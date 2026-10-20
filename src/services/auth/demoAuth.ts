import { normalizar } from '@/lib/format';
import type { Usuario } from '@/types';
import { AppError } from '../data/store';
import type { LocalStore } from '../data/local/localStore';
import { definirSenha, lerSenhas } from '../data/local/senhas';
import { novoId } from '../data/local/tx';
import { getGeocoder } from '../geo/geocoder';
import type { AuthService, ConfiguracaoInicial, NovoUsuario, Sessao } from './types';

const SESSAO_KEY = 'routeflow:sessao';
const TOKENS_KEY = 'routeflow:reset-tokens';
/** Duração da sessão (controle de sessão) */
const DURACAO_MS = 8 * 60 * 60 * 1000;

function ler<T>(key: string, padrao: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : padrao;
  } catch {
    return padrao;
  }
}
function gravar(key: string, valor: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(valor));
  } catch {
    /* ignora */
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emailValido = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/**
 * Autenticação do modo local. As senhas ficam apenas neste navegador —
 * para uso com vários dispositivos, utilize o Supabase (Supabase Auth).
 */
export class DemoAuthService implements AuthService {
  constructor(private readonly store: LocalStore) {}

  private montarSessao(usuario: Usuario, expiraEm: string): Sessao {
    const db = this.store.raw;
    const empresa = db.empresas.find((e) => e.id === usuario.empresa_id);
    if (!empresa) throw new AppError('Empresa não encontrada.');
    const motorista = usuario.perfil === 'motorista' ? (db.motoristas.find((m) => m.usuario_id === usuario.id) ?? null) : null;
    if (usuario.perfil === 'motorista' && !motorista) {
      throw new AppError('Seu usuário não está vinculado a um motorista. Procure o administrador.');
    }
    const sessao = { usuario, empresa, motorista, expiraEm };
    this.store.setContext({ empresaId: empresa.id, usuarioId: usuario.id, perfil: usuario.perfil, motoristaId: motorista?.id ?? null });
    return sessao;
  }

  private iniciarSessao(usuario: Usuario): Sessao {
    const expiraEm = new Date(Date.now() + DURACAO_MS).toISOString();
    const sessao = this.montarSessao(usuario, expiraEm);
    gravar(SESSAO_KEY, { usuarioId: usuario.id, expiraEm });
    return sessao;
  }

  async precisaConfiguracaoInicial() {
    return this.store.vazio;
  }

  async configurarInicial(d: ConfiguracaoInicial): Promise<Sessao> {
    await espera(300);
    if (!this.store.vazio) throw new AppError('O sistema já foi configurado. Faça login.');
    if (!d.empresa.trim()) throw new AppError('Informe o nome da empresa.');
    if (!d.cidade.trim() || !d.estado) throw new AppError('Informe a cidade e o estado.');
    if (d.nome.trim().length < 3) throw new AppError('Informe o seu nome.');
    if (!emailValido(d.email)) throw new AppError('Informe um e-mail válido.');
    if (d.senha.length < 6) throw new AppError('A senha deve ter ao menos 6 caracteres.');

    // ponto de partida aproximado (bairro → cidade); pode ser ajustado em Configurações
    const geo = await getGeocoder().geocode({ bairro: d.bairroPartida, cidade: d.cidade, estado: d.estado });
    const agora = new Date().toISOString();
    const empresaId = novoId();
    this.store.raw.empresas.push({
      id: empresaId,
      nome: d.empresa.trim(),
      cidade: d.cidade.trim(),
      estado: d.estado,
      partida_descricao: d.bairroPartida.trim() ? `${d.bairroPartida.trim()}, ${d.cidade.trim()}` : d.cidade.trim(),
      partida_lat: geo?.lat ?? -14.235,
      partida_lng: geo?.lng ?? -51.925,
      velocidade_media_kmh: 25,
      tempo_parada_min: 6,
      fator_rota: 1.35,
      considerar_retorno: false,
      app_navegacao: 'google',
      created_at: agora,
      updated_at: agora,
    });
    const usuario: Usuario = {
      id: novoId(),
      empresa_id: empresaId,
      nome: d.nome.trim(),
      email: d.email.trim().toLowerCase(),
      perfil: 'admin',
      ativo: true,
      created_at: agora,
      updated_at: agora,
    };
    this.store.raw.usuarios.push(usuario);
    definirSenha(usuario.email, d.senha);
    const sessao = this.iniciarSessao(usuario);
    await this.store.update('usuarios', usuario.id, {}); // persiste
    return sessao;
  }

  async entrar(email: string, senha: string): Promise<Sessao> {
    await espera(450);
    const usuario = this.store.raw.usuarios.find((u) => normalizar(u.email) === normalizar(email));
    const correta = lerSenhas()[normalizar(email)];
    if (!usuario || !correta || correta !== senha) throw new AppError('E-mail ou senha incorretos.');
    if (!usuario.ativo) throw new AppError('Usuário desativado. Procure o administrador.');
    return this.iniciarSessao(usuario);
  }

  async sair() {
    try {
      localStorage.removeItem(SESSAO_KEY);
    } catch {
      /* ignora */
    }
    this.store.setContext(null);
  }

  async restaurar(): Promise<Sessao | null> {
    const s = ler<{ usuarioId: string; expiraEm: string } | null>(SESSAO_KEY, null);
    if (!s || new Date(s.expiraEm).getTime() < Date.now()) {
      await this.sair();
      return null;
    }
    const usuario = this.store.raw.usuarios.find((u) => u.id === s.usuarioId && u.ativo);
    if (!usuario) return null;
    try {
      return this.montarSessao(usuario, s.expiraEm);
    } catch {
      return null;
    }
  }

  async solicitarRecuperacao(email: string) {
    await espera(500);
    const usuario = this.store.raw.usuarios.find((u) => normalizar(u.email) === normalizar(email));
    // Por segurança a resposta é a mesma exista ou não o e-mail
    if (!usuario) return {};
    const token = novoId();
    const tokens = ler<Record<string, { email: string; expira: number }>>(TOKENS_KEY, {});
    tokens[token] = { email: usuario.email, expira: Date.now() + 60 * 60 * 1000 };
    gravar(TOKENS_KEY, tokens);
    return { linkDemo: `/redefinir-senha?token=${token}` };
  }

  async redefinirSenha(novaSenha: string, token?: string | null) {
    await espera(400);
    const tokens = ler<Record<string, { email: string; expira: number }>>(TOKENS_KEY, {});
    const t = token ? tokens[token] : null;
    if (!t || t.expira < Date.now()) throw new AppError('Link de redefinição inválido ou expirado.');
    definirSenha(t.email, novaSenha);
    delete tokens[token!];
    gravar(TOKENS_KEY, tokens);
  }

  async criarUsuario({ nome, email, perfil, senha }: NovoUsuario): Promise<Usuario> {
    await espera(300);
    const atual = ler<{ usuarioId: string } | null>(SESSAO_KEY, null);
    const admin = this.store.raw.usuarios.find((u) => u.id === atual?.usuarioId);
    if (!admin || admin.perfil !== 'admin') throw new AppError('Você não tem permissão para esta operação.');
    if (!emailValido(email)) throw new AppError('Informe um e-mail válido.');
    if (this.store.raw.usuarios.some((u) => normalizar(u.email) === normalizar(email))) {
      throw new AppError('Já existe um usuário com este e-mail.');
    }
    const agora = new Date().toISOString();
    const usuario: Usuario = {
      id: novoId(),
      empresa_id: admin.empresa_id,
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      perfil,
      ativo: true,
      created_at: agora,
      updated_at: agora,
    };
    this.store.raw.usuarios.push(usuario);
    definirSenha(email, senha);
    await this.store.update('usuarios', usuario.id, {}); // persiste
    return usuario;
  }
}
