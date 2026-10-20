/**
 * Tipos de domínio do RouteFlow.
 * Espelham as tabelas definidas em supabase/migrations.
 */

export type ID = string;
/** Data no formato YYYY-MM-DD */
export type ISODate = string;
/** Timestamp ISO 8601 */
export type ISODateTime = string;

export interface BaseRow {
  id: ID;
  empresa_id: ID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type Perfil = 'admin' | 'vendedor' | 'motorista';

export interface Empresa {
  id: ID;
  nome: string;
  cidade: string;
  estado: string;
  /** Ponto de partida das rotas (depósito/loja) */
  partida_descricao: string;
  partida_lat: number;
  partida_lng: number;
  velocidade_media_kmh: number;
  tempo_parada_min: number;
  /** Multiplicador sobre a distância em linha reta para estimar a distância viária */
  fator_rota: number;
  considerar_retorno: boolean;
  app_navegacao: 'google' | 'waze';
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Usuario extends BaseRow {
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
}

/** Precisão da localização armazenada para o cliente (dado técnico) */
export type GeoPrecisao = 'exata' | 'bairro' | 'cidade' | 'pendente';

export interface Cliente extends BaseRow {
  nome: string;
  telefone: string;
  bairro: string;
  cidade: string;
  estado: string;
  /** Campos técnicos — nunca exibidos no formulário */
  latitude: number | null;
  longitude: number | null;
  geo_precisao: GeoPrecisao;
  geo_fonte: string | null;
}

export type MotoristaStatus = 'disponivel' | 'em_rota' | 'indisponivel';

export interface Veiculo extends BaseRow {
  tipo: string;
  modelo: string;
  placa: string;
  capacidade_kg: number | null;
}

export interface Motorista extends BaseRow {
  usuario_id: ID | null;
  veiculo_id: ID | null;
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  status: MotoristaStatus;
}

export interface Produto extends BaseRow {
  nome: string;
  unidade: string;
  preco: number;
  peso_kg: number;
  ativo: boolean;
}

export type PedidoStatus = 'novo' | 'preparando' | 'pronto' | 'em_rota' | 'entregue' | 'cancelado';
export type TipoVenda = 'avista' | 'prazo';
export type FormaPagamento = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'cartao' | 'boleto' | 'outro';

export interface Pedido extends BaseRow {
  numero: number;
  cliente_id: ID;
  vendedor_id: ID | null;
  data_venda: ISODate;
  data_entrega: ISODate | null;
  subtotal: number;
  desconto: number;
  total: number;
  observacoes: string;
  status: PedidoStatus;
  tipo_venda: TipoVenda;
  forma_pagamento: FormaPagamento | null;
  /** À vista: true = cobrar na entrega; false = já pago no ato da venda */
  receber_na_entrega: boolean;
  parcelas_qtd: number;
  intervalo_dias: number;
  primeiro_vencimento: ISODate | null;
}

export interface ItemPedido extends BaseRow {
  pedido_id: ID;
  produto_id: ID | null;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  peso_kg: number;
  total: number;
}

export type EntregaStatus = 'pendente' | 'em_rota' | 'entregue' | 'nao_entregue' | 'reagendada' | 'cancelada';

export interface Entrega extends BaseRow {
  pedido_id: ID;
  cliente_id: ID;
  data: ISODate;
  status: EntregaStatus;
  saida_em: ISODateTime | null;
  entregue_em: ISODateTime | null;
  observacoes: string;
  valor_receber: number;
  valor_recebido: number;
}

export type RotaStatus = 'planejada' | 'em_andamento' | 'concluida' | 'cancelada';

export interface Rota extends BaseRow {
  motorista_id: ID;
  data: ISODate;
  nome: string;
  cor: string;
  status: RotaStatus;
  distancia_km: number;
  tempo_min: number;
  partida_lat: number;
  partida_lng: number;
  iniciada_em: ISODateTime | null;
  concluida_em: ISODateTime | null;
}

export interface RotaEntrega extends BaseRow {
  rota_id: ID;
  entrega_id: ID;
  ordem: number;
  /** Trecho a partir da parada anterior */
  distancia_km: number;
  tempo_min: number;
}

export type ParcelaStatus = 'pendente' | 'pago' | 'vencido' | 'cancelado';

export interface Parcela extends BaseRow {
  pedido_id: ID;
  numero: number;
  total_parcelas: number;
  valor: number;
  vencimento: ISODate;
  status: ParcelaStatus;
  pago_em: ISODate | null;
  valor_pago: number;
  forma_pagamento: FormaPagamento | null;
}

export interface Pagamento extends BaseRow {
  pedido_id: ID;
  parcela_id: ID | null;
  entrega_id: ID | null;
  valor: number;
  forma: FormaPagamento;
  data: ISODate;
  observacao: string;
  registrado_por: ID | null;
}

export type MotivoOcorrencia =
  | 'cliente_ausente'
  | 'local_nao_encontrado'
  | 'cliente_recusou'
  | 'problema_pagamento'
  | 'problema_veiculo'
  | 'outro';

export interface Ocorrencia extends BaseRow {
  entrega_id: ID;
  motorista_id: ID | null;
  motivo: MotivoOcorrencia;
  observacao: string;
  reagendada_para: ISODate | null;
}

export interface TableMap {
  empresas: Empresa;
  usuarios: Usuario;
  clientes: Cliente;
  motoristas: Motorista;
  veiculos: Veiculo;
  produtos: Produto;
  pedidos: Pedido;
  itens_pedido: ItemPedido;
  entregas: Entrega;
  rotas: Rota;
  rota_entregas: RotaEntrega;
  pagamentos: Pagamento;
  parcelas: Parcela;
  ocorrencias: Ocorrencia;
}

export type TableName = keyof TableMap;
export type Row<T extends TableName> = TableMap[T];
export type NewRow<T> = Omit<T, 'id' | 'empresa_id' | 'created_at' | 'updated_at'> & { id?: ID };

/* ---------- Views compostas usadas pela UI ---------- */

export interface EntregaView extends Entrega {
  cliente: Cliente | null;
  pedido: Pedido | null;
  rota: Rota | null;
  motorista: Motorista | null;
  ordem: number | null;
  trecho_km: number | null;
}

export interface ParcelaView extends Parcela {
  /** Status efetivo considerando o vencimento (pendente vencida → vencido) */
  status_efetivo: ParcelaStatus;
  pedido: Pedido | null;
  cliente: Cliente | null;
}

export interface RotaView extends Rota {
  motorista: Motorista | null;
  paradas: EntregaView[];
}
