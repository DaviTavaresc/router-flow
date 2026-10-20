/**
 * Contrato da camada de dados. Há duas implementações:
 *  - LocalStore: modo demonstração (dados fictícios no navegador, mesmas regras do banco)
 *  - SupabaseStore: PostgreSQL via Supabase, com RLS isolando cada empresa
 *
 * Operações compostas/atômicas (pedido + itens + parcelas, confirmação de entrega,
 * salvar plano de rotas...) são RPCs: no Supabase são funções plpgsql
 * (supabase/migrations/003_functions.sql); no modo demo são implementadas em local/rpc.ts.
 */
import type {
  Entrega,
  FormaPagamento,
  ID,
  ISODate,
  ISODateTime,
  MotivoOcorrencia,
  NewRow,
  Pedido,
  PedidoStatus,
  TableMap,
  TableName,
  TipoVenda,
} from '@/types';

export interface SalvarPedidoArgs {
  id?: ID | null;
  pedido: {
    cliente_id: ID;
    data_venda: ISODate;
    data_entrega: ISODate | null;
    desconto: number;
    observacoes: string;
    status: PedidoStatus;
    tipo_venda: TipoVenda;
    forma_pagamento: FormaPagamento | null;
    receber_na_entrega: boolean;
    parcelas_qtd: number;
    intervalo_dias: number;
    primeiro_vencimento: ISODate | null;
  };
  itens: { produto_id: ID | null; descricao: string; quantidade: number; valor_unitario: number; peso_kg: number }[];
  gerar_entrega: boolean;
}

export interface PlanoRotaArgs {
  motorista_id: ID;
  nome: string;
  cor: string;
  distancia_km: number;
  tempo_min: number;
  paradas: { entrega_id: ID; ordem: number; distancia_km: number; tempo_min: number }[];
}

export interface RpcMap {
  salvar_pedido: { args: SalvarPedidoArgs; result: Pedido };
  alterar_status_pedido: { args: { pedido_id: ID; status: PedidoStatus }; result: null };
  gerar_entrega: { args: { pedido_id: ID; data: ISODate }; result: Entrega };
  registrar_pagamento: {
    args: { parcela_id: ID; valor: number; forma: FormaPagamento; data: ISODate; observacao: string };
    result: null;
  };
  salvar_plano_rotas: {
    args: { data: ISODate; partida_lat: number; partida_lng: number; rotas: PlanoRotaArgs[] };
    result: null;
  };
  iniciar_rota: { args: { rota_id: ID }; result: null };
  confirmar_entrega: {
    args: {
      entrega_id: ID;
      horario: ISODateTime;
      /** Data local do recebimento (evita virada de dia por fuso horário) */
      data: ISODate;
      observacao: string;
      valor_recebido: number;
      forma: FormaPagamento | null;
    };
    result: null;
  };
  registrar_falha_entrega: {
    args: { entrega_id: ID; motivo: MotivoOcorrencia; observacao: string; reagendar_para: ISODate | null };
    result: null;
  };
  reagendar_entrega: { args: { entrega_id: ID; data: ISODate }; result: null };
}

export type RpcName = keyof RpcMap;

export interface StoreContext {
  empresaId: ID;
  usuarioId: ID;
  perfil: 'admin' | 'vendedor' | 'motorista';
  motoristaId: ID | null;
}

export interface DataStore {
  readonly tipo: 'demo' | 'supabase';
  setContext(ctx: StoreContext | null): void;
  list<T extends TableName>(table: T, filter?: Partial<TableMap[T]>): Promise<TableMap[T][]>;
  get<T extends TableName>(table: T, id: ID): Promise<TableMap[T] | null>;
  insert<T extends TableName>(table: T, row: NewRow<TableMap[T]>): Promise<TableMap[T]>;
  update<T extends TableName>(table: T, id: ID, patch: Partial<TableMap[T]>): Promise<TableMap[T]>;
  remove<T extends TableName>(table: T, id: ID): Promise<void>;
  rpc<K extends RpcName>(name: K, args: RpcMap[K]['args']): Promise<RpcMap[K]['result']>;
}

/** Erro de regra de negócio com mensagem amigável para o usuário */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}
