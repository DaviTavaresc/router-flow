import { hojeISO } from '@/lib/dates';
import { round2 } from '@/lib/format';
import type { FormaPagamento, ID, ParcelaView } from '@/types';
import { store } from '../data';
import { montarParcelas } from './views';

export async function listarParcelas(): Promise<ParcelaView[]> {
  const [parcelas, pedidos, clientes] = await Promise.all([store.list('parcelas'), store.list('pedidos'), store.list('clientes')]);
  return montarParcelas(parcelas, pedidos, clientes).sort(
    (a, b) => a.vencimento.localeCompare(b.vencimento) || (a.pedido?.numero ?? 0) - (b.pedido?.numero ?? 0) || a.numero - b.numero,
  );
}

export async function resumoFinanceiro() {
  const [pedidos, parcelas, pagamentos] = await Promise.all([store.list('pedidos'), store.list('parcelas'), store.list('pagamentos')]);
  const hoje = hojeISO();
  const ativos = pedidos.filter((p) => p.status !== 'cancelado');
  const aberto = parcelas.filter((p) => p.status === 'pendente');
  return {
    totalVendido: round2(ativos.reduce((s, p) => s + p.total, 0)),
    totalRecebido: round2(pagamentos.reduce((s, p) => s + p.valor, 0)),
    totalAReceber: round2(aberto.reduce((s, p) => s + p.valor - p.valor_pago, 0)),
    totalVencido: round2(aberto.filter((p) => p.vencimento < hoje).reduce((s, p) => s + p.valor - p.valor_pago, 0)),
    qtdVencidas: aberto.filter((p) => p.vencimento < hoje).length,
  };
}

export async function listarPagamentos() {
  const [pagamentos, pedidos, clientes] = await Promise.all([store.list('pagamentos'), store.list('pedidos'), store.list('clientes')]);
  const ped = new Map(pedidos.map((p) => [p.id, p]));
  const cli = new Map(clientes.map((c) => [c.id, c]));
  return pagamentos
    .map((p) => {
      const pedido = ped.get(p.pedido_id) ?? null;
      return { ...p, pedido, cliente: pedido ? (cli.get(pedido.cliente_id) ?? null) : null };
    })
    .sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at));
}

export const registrarPagamento = (args: { parcela_id: ID; valor: number; forma: FormaPagamento; data: string; observacao: string }) =>
  store.rpc('registrar_pagamento', args);
