/**
 * Consultas do app do motorista. O isolamento (somente as próprias rotas/entregas)
 * é garantido pela camada de dados (RLS no Supabase / políticas no modo demo).
 */
import { hojeISO } from '@/lib/dates';
import type { RotaView } from '@/types';
import { store } from '../data';
import { carregarBaseEntregas, montarEntregas, montarRotas } from './views';

const PRIORIDADE: Record<RotaView['status'], number> = { em_andamento: 0, planejada: 1, concluida: 2, cancelada: 3 };

export async function minhaRotaDoDia(data = hojeISO()) {
  const base = await carregarBaseEntregas();
  const rotas = montarRotas(base)
    .filter((r) => r.data === data && r.status !== 'cancelada')
    .sort((a, b) => PRIORIDADE[a.status] - PRIORIDADE[b.status]);
  const rota = rotas[0] ?? null;
  const proxima = rota?.paradas.find((p) => p.status === 'em_rota' || p.status === 'pendente' || p.status === 'reagendada') ?? null;
  return { rota, outras: rotas.slice(1), proxima };
}

export async function minhasEntregas() {
  const base = await carregarBaseEntregas();
  return montarEntregas(base)
    .filter((e) => e.rota)
    .sort((a, b) => b.data.localeCompare(a.data) || (a.ordem ?? 0) - (b.ordem ?? 0));
}

export async function detalheEntregaMotorista(id: string) {
  const [base, itens] = await Promise.all([carregarBaseEntregas(), store.list('itens_pedido')]);
  const entrega = montarEntregas(base).find((e) => e.id === id) ?? null;
  if (!entrega) return null;
  const rota = montarRotas(base).find((r) => r.id === entrega.rota?.id) ?? null;
  return {
    entrega,
    itens: itens.filter((i) => i.pedido_id === entrega.pedido_id),
    totalParadas: rota?.paradas.length ?? 0,
  };
}
