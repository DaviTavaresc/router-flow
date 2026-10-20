import { hojeISO, intervaloDias, somarDias } from '@/lib/dates';
import { round2 } from '@/lib/format';
import type { EntregaStatus } from '@/types';
import { store } from '../data';
import { carregarBaseEntregas, montarEntregas, montarRotas } from './views';

export async function dadosDashboard() {
  const hoje = hojeISO();
  const [base, pagamentos, parcelas] = await Promise.all([carregarBaseEntregas(), store.list('pagamentos'), store.list('parcelas')]);
  const entregas = montarEntregas(base);
  const doDia = entregas.filter((e) => e.data === hoje && e.status !== 'cancelada');
  const count = (s: EntregaStatus[]) => doDia.filter((e) => s.includes(e.status)).length;

  const pedidosAtivos = base.pedidos.filter((p) => p.status !== 'cancelado');
  const vendasDia = round2(pedidosAtivos.filter((p) => p.data_venda === hoje).reduce((s, p) => s + p.total, 0));
  const recebidoHoje = round2(pagamentos.filter((p) => p.data === hoje).reduce((s, p) => s + p.valor, 0));
  const aberto = parcelas.filter((p) => p.status === 'pendente');
  const aReceber = round2(aberto.reduce((s, p) => s + p.valor - p.valor_pago, 0));
  const vencido = round2(aberto.filter((p) => p.vencimento < hoje).reduce((s, p) => s + p.valor - p.valor_pago, 0));

  const inicioMes = `${hoje.slice(0, 8)}01`;
  const vendasMes = round2(pedidosAtivos.filter((p) => p.data_venda >= inicioMes && p.data_venda <= hoje).reduce((s, p) => s + p.total, 0));
  const recebidoMes = round2(pagamentos.filter((p) => p.data >= inicioMes && p.data <= hoje).reduce((s, p) => s + p.valor, 0));

  const rotasHoje = montarRotas(base, entregas)
    .filter((r) => r.data === hoje)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  // Séries dos gráficos
  const dias14 = intervaloDias(somarDias(hoje, -13), hoje);
  const entregasPorDia = dias14.map((d) => ({
    data: d,
    entregues: entregas.filter((e) => e.data === d && e.status === 'entregue').length,
    naoEntregues: entregas.filter((e) => e.data === d && e.status === 'nao_entregue').length,
  }));
  const dias30 = intervaloDias(somarDias(hoje, -29), hoje);
  const vendasPorDia = dias30.map((d) => ({
    data: d,
    valor: round2(pedidosAtivos.filter((p) => p.data_venda === d).reduce((s, p) => s + p.total, 0)),
  }));
  const ultimos30 = entregas.filter((e) => e.data >= dias30[0] && e.data <= hoje);
  const statusOrdem: EntregaStatus[] = ['entregue', 'em_rota', 'pendente', 'reagendada', 'nao_entregue', 'cancelada'];
  const statusEntregas = statusOrdem.map((s) => ({ status: s, total: ultimos30.filter((e) => e.status === s).length }));

  return {
    contagens: {
      clientes: base.clientes.length,
      motoristas: base.motoristas.length,
      pedidos: base.pedidos.length,
      rotas: base.rotas.length,
    },
    kpis: {
      entregasHoje: doDia.length,
      concluidas: count(['entregue']),
      pendentes: count(['pendente', 'reagendada']),
      emRota: count(['em_rota']),
      naoEntregues: count(['nao_entregue']),
      vendasDia,
      recebidoHoje,
      aReceber,
      vencido,
      motoristasAtivos: base.motoristas.filter((m) => m.status !== 'indisponivel').length,
      motoristasTotal: base.motoristas.length,
    },
    financeiro: { vendasMes, recebidoMes, aReceber, vencido },
    rotasHoje,
    entregasPorDia,
    vendasPorDia,
    statusEntregas,
  };
}

export type DadosDashboard = Awaited<ReturnType<typeof dadosDashboard>>;
