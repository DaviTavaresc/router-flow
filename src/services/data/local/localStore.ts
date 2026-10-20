import type { NewRow, TableMap, TableName } from '@/types';
import { AppError, type DataStore, type RpcMap, type RpcName, type StoreContext } from '../store';
import { rpcHandlers } from './rpc';
import { TABELAS, Tx, type Db } from './tx';
import { definirSenha, limparSenhas } from './senhas';
import { DEMO_SENHA, DEMO_USUARIOS, gerarDadosDemo } from '../seed';

// v2: o sistema passa a iniciar vazio (sem dados de teste)
const STORAGE_KEY = 'routeflow:db:v2';

const bancoVazio = (): Db => Object.fromEntries(TABELAS.map((t) => [t, []])) as unknown as Db;

/* Políticas equivalentes ao RLS (supabase/migrations/002_rls.sql) */
type Op = 'insert' | 'update' | 'delete';
const ESCRITA: Record<StoreContext['perfil'], Partial<Record<TableName, Op[]>>> = {
  admin: Object.fromEntries(TABELAS.map((t) => [t, ['insert', 'update', 'delete'] as Op[]])),
  vendedor: { clientes: ['insert', 'update'] },
  motorista: {},
};
const LEITURA_NEGADA: Record<StoreContext['perfil'], TableName[]> = {
  admin: [],
  vendedor: ['usuarios'],
  motorista: ['pagamentos', 'parcelas', 'usuarios', 'produtos'],
};

const latencia = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 220));
const clone = <T>(v: T): T => structuredClone(v);

export class LocalStore implements DataStore {
  readonly tipo = 'demo' as const;
  private db: Db;
  private ctx: StoreContext | null = null;

  constructor() {
    this.db = this.carregar();
  }

  private carregar(): Db {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Db;
        if (TABELAS.every((t) => Array.isArray(parsed[t]))) return parsed;
      }
    } catch {
      /* armazenamento indisponível: segue em memória */
    }
    try {
      localStorage.removeItem('routeflow:db:v1'); // descarta dados de teste de versões anteriores
      localStorage.removeItem('routeflow:senhas');
    } catch {
      /* ignora */
    }
    const db = bancoVazio();
    this.persistir(db);
    return db;
  }

  private persistir(db = this.db) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* ignora: modo privado/quota */
    }
  }

  /** Apaga todos os dados (empresa, usuários, clientes...) — volta à configuração inicial */
  apagarTudo() {
    this.substituir(bancoVazio());
    limparSenhas();
  }

  /** Carrega dados fictícios de demonstração (usado nos testes automatizados) */
  carregarDemo() {
    this.substituir(gerarDadosDemo());
    for (const u of Object.values(DEMO_USUARIOS)) definirSenha(u.email, DEMO_SENHA);
  }

  private substituir(novo: Db) {
    for (const t of TABELAS) (this.db[t] as unknown[]) = novo[t];
    this.persistir();
  }

  /** Indica se ainda não existe nenhuma empresa/usuário cadastrado */
  get vazio(): boolean {
    return this.db.usuarios.length === 0;
  }

  /** Acesso direto para o serviço de autenticação demo (fora do contexto de empresa) */
  get raw(): Db {
    return this.db;
  }

  setContext(ctx: StoreContext | null) {
    this.ctx = ctx;
  }

  private tx(): Tx {
    if (!this.ctx) throw new AppError('Sessão expirada. Faça login novamente.');
    return new Tx(this.db, this.ctx);
  }

  private podeEscrever(t: TableName, op: Op) {
    const ctx = this.ctx!;
    if (!(ESCRITA[ctx.perfil][t] ?? []).includes(op)) throw new AppError('Você não tem permissão para esta operação.');
  }

  /** Filtro por linha para o perfil motorista: só enxerga o que está nas suas rotas. */
  private visivel<T extends TableName>(tx: Tx, t: T, rows: TableMap[T][]): TableMap[T][] {
    const ctx = this.ctx!;
    if (LEITURA_NEGADA[ctx.perfil].includes(t)) return [];
    if (ctx.perfil !== 'motorista') return rows;
    const minhasRotas = new Set(tx.where('rotas', (r) => r.motorista_id === ctx.motoristaId).map((r) => r.id));
    const minhasRE = tx.where('rota_entregas', (re) => minhasRotas.has(re.rota_id));
    const minhasEntregas = new Set(minhasRE.map((re) => re.entrega_id));
    const entregas = tx.where('entregas', (e) => minhasEntregas.has(e.id));
    const pedidos = new Set(entregas.map((e) => e.pedido_id));
    const clientes = new Set(entregas.map((e) => e.cliente_id));
    const eu = tx.get('motoristas', ctx.motoristaId ?? '');
    const filtros: Partial<Record<TableName, (r: never) => boolean>> = {
      rotas: (r: TableMap['rotas']) => minhasRotas.has(r.id),
      rota_entregas: (r: TableMap['rota_entregas']) => minhasRotas.has(r.rota_id),
      entregas: (r: TableMap['entregas']) => minhasEntregas.has(r.id),
      pedidos: (r: TableMap['pedidos']) => pedidos.has(r.id),
      itens_pedido: (r: TableMap['itens_pedido']) => pedidos.has(r.pedido_id),
      clientes: (r: TableMap['clientes']) => clientes.has(r.id),
      motoristas: (r: TableMap['motoristas']) => r.id === ctx.motoristaId,
      veiculos: (r: TableMap['veiculos']) => r.id === eu?.veiculo_id,
      ocorrencias: (r: TableMap['ocorrencias']) => minhasEntregas.has(r.entrega_id),
    };
    const f = filtros[t];
    return f ? rows.filter(f as (r: TableMap[T]) => boolean) : rows;
  }

  async list<T extends TableName>(table: T, filter?: Partial<TableMap[T]>): Promise<TableMap[T][]> {
    await latencia();
    const tx = this.tx();
    let rows = this.visivel(tx, table, tx.all(table));
    if (filter) {
      const entries = Object.entries(filter);
      rows = rows.filter((r) => entries.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
    }
    return clone(rows);
  }

  async get<T extends TableName>(table: T, id: string): Promise<TableMap[T] | null> {
    await latencia();
    const tx = this.tx();
    const r = tx.get(table, id);
    return r && this.visivel(tx, table, [r]).length ? clone(r) : null;
  }

  async insert<T extends TableName>(table: T, row: NewRow<TableMap[T]>): Promise<TableMap[T]> {
    await latencia();
    this.podeEscrever(table, 'insert');
    const r = this.tx().insert(table, row);
    this.persistir();
    return clone(r);
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<TableMap[T]>): Promise<TableMap[T]> {
    await latencia();
    this.podeEscrever(table, 'update');
    const r = this.tx().update(table, id, patch);
    this.persistir();
    return clone(r);
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    await latencia();
    this.podeEscrever(table, 'delete');
    this.tx().remove(table, id);
    this.persistir();
  }

  async rpc<K extends RpcName>(name: K, args: RpcMap[K]['args']): Promise<RpcMap[K]['result']> {
    await latencia();
    const tx = this.tx();
    const snapshot = clone(this.db);
    try {
      const handler = rpcHandlers[name] as (tx: Tx, a: RpcMap[K]['args']) => RpcMap[K]['result'];
      const result = handler(tx, clone(args));
      this.persistir();
      return clone(result);
    } catch (err) {
      // rollback (atomicidade equivalente à transação do PostgreSQL)
      for (const t of TABELAS) (this.db[t] as unknown[]) = snapshot[t];
      throw err;
    }
  }
}
