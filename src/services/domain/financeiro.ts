import { hojeISO, somarIntervalo } from '@/lib/dates';
import { round2 } from '@/lib/format';
import type { Parcela, ParcelaStatus } from '@/types';

export interface ParcelaGerada {
  numero: number;
  total_parcelas: number;
  valor: number;
  vencimento: string;
}

/**
 * Gera parcelas distribuindo os centavos: as primeiras parcelas recebem o valor
 * arredondado e a última absorve a diferença, garantindo soma exata.
 * Ex.: R$ 1.200 em 3x a partir de 10/10/2026 (30 dias) → 400 / 400 / 400 em 10/10, 10/11, 10/12.
 */
export function gerarParcelas(total: number, qtd: number, primeiroVencimento: string, intervaloDias: number): ParcelaGerada[] {
  const n = Math.max(1, Math.floor(qtd));
  const base = Math.floor((total / n) * 100) / 100;
  const out: ParcelaGerada[] = [];
  for (let i = 0; i < n; i++) {
    const valor = i === n - 1 ? round2(total - base * (n - 1)) : base;
    out.push({ numero: i + 1, total_parcelas: n, valor, vencimento: somarIntervalo(primeiroVencimento, intervaloDias, i) });
  }
  return out;
}

/** Status efetivo: parcela pendente com vencimento passado é exibida como vencida. */
export function statusEfetivo(p: Pick<Parcela, 'status' | 'vencimento'>, hoje = hojeISO()): ParcelaStatus {
  if (p.status === 'pendente' && p.vencimento < hoje) return 'vencido';
  return p.status;
}

export function saldoParcela(p: Pick<Parcela, 'valor' | 'valor_pago' | 'status'>): number {
  if (p.status === 'pago' || p.status === 'cancelado') return 0;
  return round2(p.valor - p.valor_pago);
}

export interface ItemCalculo {
  quantidade: number;
  valor_unitario: number;
}

export function calcularTotais(itens: ItemCalculo[], desconto: number) {
  const subtotal = round2(itens.reduce((s, i) => s + round2(i.quantidade * i.valor_unitario), 0));
  const desc = round2(Math.min(Math.max(desconto, 0), subtotal));
  return { subtotal, desconto: desc, total: round2(subtotal - desc) };
}
