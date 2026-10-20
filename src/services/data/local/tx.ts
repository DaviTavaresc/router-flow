import type { NewRow, TableMap, TableName } from '@/types';
import { AppError, type StoreContext } from '../store';

export type Db = { [K in TableName]: TableMap[K][] };

export const TABELAS: TableName[] = [
  'empresas',
  'usuarios',
  'clientes',
  'motoristas',
  'veiculos',
  'produtos',
  'pedidos',
  'itens_pedido',
  'entregas',
  'rotas',
  'rota_entregas',
  'pagamentos',
  'parcelas',
  'ocorrencias',
];

export const novoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Regras de integridade referencial (equivalentes às FKs do PostgreSQL) */
const RESTRICT: Partial<Record<TableName, { tabela: TableName; coluna: string; mensagem: string }[]>> = {
  clientes: [{ tabela: 'pedidos', coluna: 'cliente_id', mensagem: 'Este cliente possui pedidos e não pode ser excluído.' }],
  motoristas: [{ tabela: 'rotas', coluna: 'motorista_id', mensagem: 'Este motorista possui rotas registradas e não pode ser excluído. Marque-o como indisponível.' }],
  produtos: [{ tabela: 'itens_pedido', coluna: 'produto_id', mensagem: 'Este produto já foi vendido e não pode ser excluído. Desative-o.' }],
};
const SET_NULL: Partial<Record<TableName, { tabela: TableName; coluna: string }[]>> = {
  veiculos: [{ tabela: 'motoristas', coluna: 'veiculo_id' }],
  usuarios: [{ tabela: 'motoristas', coluna: 'usuario_id' }],
};

/** Acesso transacional às tabelas, sempre restrito à empresa do contexto. */
export class Tx {
  constructor(
    private readonly db: Db,
    readonly ctx: StoreContext,
  ) {}

  private pertence(t: TableName, r: { id: string; empresa_id?: string }) {
    return t === 'empresas' ? r.id === this.ctx.empresaId : r.empresa_id === this.ctx.empresaId;
  }

  all<T extends TableName>(t: T): TableMap[T][] {
    return (this.db[t] as TableMap[T][]).filter((r) => this.pertence(t, r as never));
  }

  where<T extends TableName>(t: T, pred: (r: TableMap[T]) => boolean): TableMap[T][] {
    return this.all(t).filter(pred);
  }

  get<T extends TableName>(t: T, id: string): TableMap[T] | null {
    return this.all(t).find((r) => r.id === id) ?? null;
  }

  must<T extends TableName>(t: T, id: string, nome = 'Registro'): TableMap[T] {
    const r = this.get(t, id);
    if (!r) throw new AppError(`${nome} não encontrado.`);
    return r;
  }

  insert<T extends TableName>(t: T, row: NewRow<TableMap[T]>): TableMap[T] {
    const agora = new Date().toISOString();
    const full = {
      ...row,
      id: row.id ?? novoId(),
      ...(t === 'empresas' ? {} : { empresa_id: this.ctx.empresaId }),
      created_at: agora,
      updated_at: agora,
    } as unknown as TableMap[T];
    (this.db[t] as TableMap[T][]).push(full);
    return full;
  }

  update<T extends TableName>(t: T, id: string, patch: Partial<TableMap[T]>): TableMap[T] {
    const lista = this.db[t] as TableMap[T][];
    const idx = lista.findIndex((r) => r.id === id && this.pertence(t, r as never));
    if (idx < 0) throw new AppError('Registro não encontrado.');
    const { id: _i, empresa_id: _e, created_at: _c, ...resto } = patch as Record<string, unknown>;
    lista[idx] = { ...lista[idx], ...resto, updated_at: new Date().toISOString() };
    return lista[idx];
  }

  remove<T extends TableName>(t: T, id: string): void {
    const alvo = this.get(t, id);
    if (!alvo) throw new AppError('Registro não encontrado.');
    for (const r of RESTRICT[t] ?? []) {
      if (this.all(r.tabela).some((x) => (x as unknown as Record<string, unknown>)[r.coluna] === id)) {
        throw new AppError(r.mensagem);
      }
    }
    for (const s of SET_NULL[t] ?? []) {
      for (const x of this.all(s.tabela)) {
        if ((x as unknown as Record<string, unknown>)[s.coluna] === id) this.update(s.tabela, x.id, { [s.coluna]: null } as never);
      }
    }
    const lista = this.db[t] as TableMap[T][];
    lista.splice(lista.indexOf(alvo), 1);
  }

  removeWhere<T extends TableName>(t: T, pred: (r: TableMap[T]) => boolean): void {
    for (const r of this.where(t, pred)) {
      const lista = this.db[t] as TableMap[T][];
      lista.splice(lista.indexOf(r), 1);
    }
  }
}
