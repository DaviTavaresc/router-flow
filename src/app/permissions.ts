import type { Perfil } from '@/types';

export type Modulo =
  | 'dashboard'
  | 'clientes'
  | 'pedidos'
  | 'motoristas'
  | 'rotas'
  | 'entregas'
  | 'financeiro'
  | 'relatorios'
  | 'configuracoes'
  | 'usuarios';

const MODULOS: Record<Perfil, Modulo[]> = {
  admin: ['dashboard', 'clientes', 'pedidos', 'motoristas', 'rotas', 'entregas', 'financeiro', 'relatorios', 'configuracoes', 'usuarios'],
  vendedor: ['dashboard', 'clientes', 'pedidos', 'entregas'],
  motorista: [],
};

export type Acao =
  | 'cliente.criar'
  | 'cliente.editar'
  | 'cliente.excluir'
  | 'pedido.criar'
  | 'pedido.editar'
  | 'pedido.status'
  | 'entrega.gerenciar'
  | 'financeiro.ver'
  | 'pagamento.registrar';

const ACOES: Record<Acao, Perfil[]> = {
  'cliente.criar': ['admin', 'vendedor'],
  'cliente.editar': ['admin', 'vendedor'],
  'cliente.excluir': ['admin'],
  'pedido.criar': ['admin', 'vendedor'],
  'pedido.editar': ['admin', 'vendedor'],
  'pedido.status': ['admin', 'vendedor'],
  'entrega.gerenciar': ['admin'],
  'financeiro.ver': ['admin', 'vendedor'],
  'pagamento.registrar': ['admin'],
};

export const podeAcessar = (perfil: Perfil | undefined, modulo: Modulo) => !!perfil && MODULOS[perfil].includes(modulo);
export const pode = (perfil: Perfil | undefined, acao: Acao) => !!perfil && ACOES[acao].includes(perfil);
export const rotaInicial = (perfil: Perfil) => (perfil === 'motorista' ? '/motorista' : '/');
