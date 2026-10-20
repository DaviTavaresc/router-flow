import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { NewRow, TableMap, TableName } from '@/types';
import { AppError, type DataStore, type RpcMap, type RpcName } from './store';

const PAGINA = 1000;

/** Converte erros do PostgreSQL/PostgREST em mensagens amigáveis */
function traduzir(error: PostgrestError): AppError {
  switch (error.code) {
    case '23503':
      return new AppError('Este registro está vinculado a outros dados e não pode ser excluído.');
    case '23505':
      return new AppError('Já existe um registro com estes dados.');
    case '42501':
      return new AppError('Você não tem permissão para esta operação.');
    case 'P0001': // raise exception das funções de negócio
      return new AppError(error.message);
    default:
      return new AppError(error.message || 'Erro ao comunicar com o servidor.');
  }
}

/**
 * Implementação PostgreSQL/Supabase. O isolamento por empresa é garantido pelo RLS;
 * o empresa_id dos inserts é preenchido pelo default `auth_empresa_id()` no banco.
 */
export class SupabaseStore implements DataStore {
  readonly tipo = 'supabase' as const;
  constructor(private readonly sb: SupabaseClient) {}

  setContext() {
    /* contexto vem do JWT da sessão */
  }

  async list<T extends TableName>(table: T, filter?: Partial<TableMap[T]>): Promise<TableMap[T][]> {
    const out: TableMap[T][] = [];
    for (let from = 0; ; from += PAGINA) {
      let q = this.sb.from(table).select('*').range(from, from + PAGINA - 1);
      if (filter) q = q.match(filter as Record<string, unknown>);
      const { data, error } = await q;
      if (error) throw traduzir(error);
      out.push(...((data ?? []) as TableMap[T][]));
      if (!data || data.length < PAGINA) break;
    }
    return out;
  }

  async get<T extends TableName>(table: T, id: string): Promise<TableMap[T] | null> {
    const { data, error } = await this.sb.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw traduzir(error);
    return data as TableMap[T] | null;
  }

  async insert<T extends TableName>(table: T, row: NewRow<TableMap[T]>): Promise<TableMap[T]> {
    const { data, error } = await this.sb.from(table).insert(row as never).select('*').single();
    if (error) throw traduzir(error);
    return data as TableMap[T];
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<TableMap[T]>): Promise<TableMap[T]> {
    const { id: _i, empresa_id: _e, created_at: _c, updated_at: _u, ...resto } = patch as Record<string, unknown>;
    const { data, error } = await this.sb.from(table).update(resto as never).eq('id', id).select('*').single();
    if (error) throw traduzir(error);
    return data as TableMap[T];
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    const { error } = await this.sb.from(table).delete().eq('id', id);
    if (error) throw traduzir(error);
  }

  async rpc<K extends RpcName>(name: K, args: RpcMap[K]['args']): Promise<RpcMap[K]['result']> {
    const { data, error } = await this.sb.rpc(name, { args });
    if (error) throw traduzir(error);
    return data as RpcMap[K]['result'];
  }
}
