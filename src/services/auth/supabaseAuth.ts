import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Empresa, Motorista, Usuario } from '@/types';
import { AppError } from '../data/store';
import type { AuthService, ConfiguracaoInicial, NovoUsuario, Sessao } from './types';

/** Conta criada, mas o Supabase exige confirmação por e-mail antes do primeiro login. */
export class ConfirmacaoEmailPendente extends AppError {
  constructor() {
    super('Enviamos um link de confirmação para o seu e-mail. Confirme e depois faça login: a empresa será criada automaticamente.');
    this.name = 'ConfirmacaoEmailPendente';
  }
}

type SetupPendente = Omit<ConfiguracaoInicial, 'senha' | 'email'>;

const expira = (expiresAt?: number) => new Date((expiresAt ?? 0) * 1000).toISOString();

/** Autenticação via Supabase Auth. O perfil e a empresa vêm da tabela `usuarios`. */
export class SupabaseAuthService implements AuthService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  private async criarEmpresa(s: SetupPendente) {
    const { error } = await this.sb.rpc('onboarding_criar_empresa', {
      args: { nome: s.empresa, cidade: s.cidade, estado: s.estado, partida_descricao: s.bairroPartida, nome_usuario: s.nome },
    });
    if (error) throw new AppError(error.message);
  }

  private async carregarSessao(userId: string, expiraEm: string, tentarSetup = true): Promise<Sessao> {
    const { data: usuario, error } = await this.sb.from('usuarios').select('*').eq('id', userId).maybeSingle();
    if (error) throw new AppError('Não foi possível carregar seu cadastro.');
    if (!usuario) {
      // Primeiro login após confirmar o e-mail: conclui a criação da empresa guardada no cadastro
      const { data } = await this.sb.auth.getUser();
      const setup = data.user?.user_metadata?.setup as SetupPendente | undefined;
      if (setup && tentarSetup) {
        await this.criarEmpresa(setup);
        await this.sb.auth.updateUser({ data: { setup: null } });
        return this.carregarSessao(userId, expiraEm, false);
      }
      throw new AppError('Usuário sem cadastro na empresa. Procure o administrador.');
    }
    if (!usuario.ativo) throw new AppError('Usuário desativado. Procure o administrador.');
    const { data: empresa } = await this.sb.from('empresas').select('*').eq('id', usuario.empresa_id).single();
    let motorista: Motorista | null = null;
    if (usuario.perfil === 'motorista') {
      const { data } = await this.sb.from('motoristas').select('*').eq('usuario_id', userId).maybeSingle();
      motorista = data as Motorista | null;
      if (!motorista) throw new AppError('Seu usuário não está vinculado a um motorista. Procure o administrador.');
    }
    return { usuario: usuario as Usuario, empresa: empresa as Empresa, motorista, expiraEm };
  }

  /** No Supabase, cada nova conta criada pela tela "Criar conta" gera uma nova empresa. */
  async precisaConfiguracaoInicial() {
    return false;
  }

  async configurarInicial(d: ConfiguracaoInicial): Promise<Sessao> {
    const setup: SetupPendente = { empresa: d.empresa, cidade: d.cidade, estado: d.estado, bairroPartida: d.bairroPartida, nome: d.nome };
    const { data, error } = await this.sb.auth.signUp({
      email: d.email.trim(),
      password: d.senha,
      options: { data: { setup, nome: d.nome }, emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error || !data.user) throw new AppError(traduzirAuth(error?.message));
    if (data.user.identities?.length === 0) throw new AppError('Já existe uma conta com este e-mail.');
    if (!data.session) throw new ConfirmacaoEmailPendente();
    return this.carregarSessao(data.user.id, expira(data.session.expires_at));
  }

  async entrar(email: string, senha: string): Promise<Sessao> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error?.message?.toLowerCase().includes('not confirmed')) throw new AppError('Confirme seu e-mail pelo link enviado antes de entrar.');
    if (error || !data.session) throw new AppError('E-mail ou senha incorretos.');
    try {
      return await this.carregarSessao(data.user.id, expira(data.session.expires_at));
    } catch (e) {
      await this.sb.auth.signOut();
      throw e;
    }
  }

  async sair() {
    await this.sb.auth.signOut();
  }

  async restaurar(): Promise<Sessao | null> {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return null;
    try {
      return await this.carregarSessao(data.session.user.id, expira(data.session.expires_at));
    } catch {
      return null;
    }
  }

  async solicitarRecuperacao(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) throw new AppError('Não foi possível enviar o e-mail de recuperação.');
    return {};
  }

  async redefinirSenha(novaSenha: string) {
    const { error } = await this.sb.auth.updateUser({ password: novaSenha });
    if (error) throw new AppError('Não foi possível redefinir a senha. Solicite um novo link.');
  }

  /**
   * Cria a conta com um cliente separado (sem persistir sessão, para não deslogar o
   * administrador) e vincula o novo usuário à empresa pela função `vincular_usuario`.
   */
  async criarUsuario({ nome, email, perfil, senha }: NovoUsuario): Promise<Usuario> {
    const temporario = createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'routeflow-cadastro' },
    });
    const { data, error } = await temporario.auth.signUp({
      email: email.trim(),
      password: senha,
      options: { data: { nome }, emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error || !data.user) throw new AppError(traduzirAuth(error?.message));
    if (data.user.identities?.length === 0) throw new AppError('Já existe uma conta com este e-mail.');
    const { data: usuario, error: erroVinculo } = await this.sb.rpc('vincular_usuario', {
      args: { id: data.user.id, email: email.trim(), nome: nome.trim(), perfil },
    });
    if (erroVinculo) throw new AppError(erroVinculo.message);
    return usuario as Usuario;
  }
}

function traduzirAuth(msg?: string): string {
  const m = (msg ?? '').toLowerCase();
  if (m.includes('already registered')) return 'Já existe uma conta com este e-mail.';
  if (m.includes('password')) return 'Senha fraca: use ao menos 6 caracteres.';
  if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (m.includes('invalid') && m.includes('email')) return 'E-mail inválido.';
  return msg || 'Não foi possível criar a conta.';
}
