import type { Empresa, Motorista, Perfil, Usuario } from '@/types';

export interface Sessao {
  usuario: Usuario;
  empresa: Empresa;
  /** Preenchido quando o perfil é motorista */
  motorista: Motorista | null;
  expiraEm: string;
}

export interface NovoUsuario {
  nome: string;
  email: string;
  perfil: Perfil;
  senha: string;
}

export interface ConfiguracaoInicial {
  empresa: string;
  cidade: string;
  estado: string;
  /** Bairro do ponto de partida das rotas (opcional, para localizar no mapa) */
  bairroPartida: string;
  nome: string;
  email: string;
  senha: string;
}

export interface AuthService {
  /** true quando ainda não existe nenhum usuário (primeiro acesso) */
  precisaConfiguracaoInicial(): Promise<boolean>;
  /** Cria a empresa e o primeiro administrador, já entrando no sistema */
  configurarInicial(dados: ConfiguracaoInicial): Promise<Sessao>;
  entrar(email: string, senha: string): Promise<Sessao>;
  sair(): Promise<void>;
  restaurar(): Promise<Sessao | null>;
  /** No modo demo retorna o link de redefinição (não há envio real de e-mail) */
  solicitarRecuperacao(email: string): Promise<{ linkDemo?: string }>;
  redefinirSenha(novaSenha: string, token?: string | null): Promise<void>;
  criarUsuario(dados: NovoUsuario): Promise<Usuario>;
}
