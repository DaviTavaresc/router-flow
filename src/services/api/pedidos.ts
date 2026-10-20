import { round2 } from '@/lib/format';
import { statusEfetivo } from '@/services/domain/financeiro';
import type { Cliente, Entrega, ID, Pedido, PedidoStatus, Produto } from '@/types';
import { AppError, store } from '../data';
import type { SalvarPedidoArgs } from '../data/store';
import { carregarBaseEntregas, montarEntregas } from './views';

export interface PedidoLista extends Pedido {
  cliente: Cliente | null;
  entrega: Entrega | null;
  saldo: number;
}

export async function listarPedidos(): Promise<PedidoLista[]> {
  const [pedidos, clientes, entregas, parcelas] = await Promise.all([
    store.list('pedidos'),
    store.list('clientes'),
    store.list('entregas'),
    store.list('parcelas'),
  ]);
  const cli = new Map(clientes.map((c) => [c.id, c]));
  return pedidos
    .map((p) => ({
      ...p,
      cliente: cli.get(p.cliente_id) ?? null,
      entrega:
        entregas
          .filter((e) => e.pedido_id === p.id)
          .sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at))[0] ?? null,
      saldo: round2(
        parcelas.filter((x) => x.pedido_id === p.id && x.status === 'pendente').reduce((s, x) => s + x.valor - x.valor_pago, 0),
      ),
    }))
    .sort((a, b) => b.numero - a.numero);
}

export async function detalhePedido(id: ID) {
  const [pedido, itens, parcelas, pagamentos, base, ocorrencias] = await Promise.all([
    store.get('pedidos', id),
    store.list('itens_pedido', { pedido_id: id }),
    store.list('parcelas', { pedido_id: id }),
    store.list('pagamentos', { pedido_id: id }),
    carregarBaseEntregas(),
    store.list('ocorrencias'),
  ]);
  if (!pedido) throw new AppError('Pedido não encontrado.');
  const cliente = base.clientes.find((c) => c.id === pedido.cliente_id) ?? null;
  const entregas = montarEntregas(base)
    .filter((e) => e.pedido_id === id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const idsEntregas = new Set(entregas.map((e) => e.id));
  return {
    pedido,
    cliente,
    itens: itens.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    parcelas: parcelas.map((p) => ({ ...p, status_efetivo: statusEfetivo(p) })).sort((a, b) => a.numero - b.numero),
    pagamentos: pagamentos.sort((a, b) => a.data.localeCompare(b.data)),
    entregas,
    ocorrencias: ocorrencias.filter((o) => idsEntregas.has(o.entrega_id)),
  };
}

export const salvarPedido = (args: SalvarPedidoArgs) => store.rpc('salvar_pedido', args);
export const alterarStatusPedido = (pedido_id: ID, status: PedidoStatus) => store.rpc('alterar_status_pedido', { pedido_id, status });
export const gerarEntrega = (pedido_id: ID, data: string) => store.rpc('gerar_entrega', { pedido_id, data });

/* ------------------------------ produtos ------------------------------ */

export async function listarProdutos(): Promise<Produto[]> {
  return (await store.list('produtos')).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type ProdutoForm = Pick<Produto, 'nome' | 'unidade' | 'preco' | 'peso_kg' | 'ativo'>;

export async function salvarProduto(id: ID | null, form: ProdutoForm) {
  if (!form.nome.trim()) throw new AppError('Informe o nome do produto.');
  if (form.preco < 0 || form.peso_kg < 0) throw new AppError('Preço e peso não podem ser negativos.');
  const dados = { ...form, nome: form.nome.trim() };
  return id ? store.update('produtos', id, dados) : store.insert('produtos', dados);
}

export const excluirProduto = (id: ID) => store.remove('produtos', id);
