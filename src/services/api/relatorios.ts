/**
 * Relatórios: cada relatório é uma função pura sobre os dados carregados,
 * retornando resumo + tabela tipada (usada na tela e na exportação CSV).
 * Exportação PDF: impressão do navegador (estilos @media print); preparado para
 * geração server-side futura a partir da mesma estrutura.
 */
import { entre, hojeISO } from '@/lib/dates';
import { formatData, round2 } from '@/lib/format';
import { ENTREGA_STATUS, FORMA_PAGAMENTO, PARCELA_STATUS, PEDIDO_STATUS, ROTA_STATUS } from '@/lib/labels';
import { statusEfetivo } from '@/services/domain/financeiro';
import { store } from '../data';
import { carregarBaseEntregas, montarEntregas, montarRotas } from './views';

export async function carregarRelatorios() {
  const [base, parcelas, pagamentos] = await Promise.all([carregarBaseEntregas(), store.list('parcelas'), store.list('pagamentos')]);
  const entregas = montarEntregas(base);
  return { ...base, parcelas, pagamentos, entregasView: entregas, rotasView: montarRotas(base, entregas) };
}

export type DadosRelatorio = Awaited<ReturnType<typeof carregarRelatorios>>;

export type TipoColuna = 'texto' | 'moeda' | 'inteiro' | 'data' | 'km' | 'minutos' | 'pct';
export interface Relatorio {
  resumo: { label: string; valor: number; tipo: TipoColuna }[];
  colunas: { label: string; tipo: TipoColuna }[];
  linhas: (string | number | null)[][];
}

export type TipoRelatorio = 'vendas' | 'entregas' | 'recebimentos' | 'aberto' | 'porMotorista' | 'desempenho' | 'clientes' | 'pedidos' | 'rotas';

export const RELATORIOS: { id: TipoRelatorio; nome: string; descricao: string }[] = [
  { id: 'vendas', nome: 'Vendas', descricao: 'Pedidos vendidos no período' },
  { id: 'entregas', nome: 'Entregas', descricao: 'Entregas programadas no período' },
  { id: 'recebimentos', nome: 'Recebimentos', descricao: 'Pagamentos recebidos no período' },
  { id: 'aberto', nome: 'Valores em aberto', descricao: 'Parcelas pendentes com vencimento no período' },
  { id: 'porMotorista', nome: 'Entregas por motorista', descricao: 'Volume e resultado por motorista' },
  { id: 'desempenho', nome: 'Desempenho dos motoristas', descricao: 'Taxa de sucesso, distância e tempo' },
  { id: 'clientes', nome: 'Clientes', descricao: 'Compras e saldo por cliente' },
  { id: 'pedidos', nome: 'Pedidos', descricao: 'Pedidos por status' },
  { id: 'rotas', nome: 'Rotas', descricao: 'Rotas executadas no período' },
];

const pct = (a: number, b: number) => (b ? round2((a / b) * 100) : 0);

export function gerarRelatorio(tipo: TipoRelatorio, d: DadosRelatorio, inicio: string, fim: string): Relatorio {
  const cli = new Map(d.clientes.map((c) => [c.id, c]));
  const ped = new Map(d.pedidos.map((p) => [p.id, p]));

  switch (tipo) {
    case 'vendas': {
      const ps = d.pedidos.filter((p) => p.status !== 'cancelado' && entre(p.data_venda, inicio, fim)).sort((a, b) => a.data_venda.localeCompare(b.data_venda));
      const total = ps.reduce((s, p) => s + p.total, 0);
      return {
        resumo: [
          { label: 'Pedidos', valor: ps.length, tipo: 'inteiro' },
          { label: 'Total vendido', valor: total, tipo: 'moeda' },
          { label: 'Ticket médio', valor: ps.length ? total / ps.length : 0, tipo: 'moeda' },
          { label: 'Vendido a prazo', valor: ps.filter((p) => p.tipo_venda === 'prazo').reduce((s, p) => s + p.total, 0), tipo: 'moeda' },
        ],
        colunas: [
          { label: 'Data', tipo: 'data' },
          { label: 'Pedido', tipo: 'texto' },
          { label: 'Cliente', tipo: 'texto' },
          { label: 'Forma', tipo: 'texto' },
          { label: 'Desconto', tipo: 'moeda' },
          { label: 'Total', tipo: 'moeda' },
        ],
        linhas: ps.map((p) => [
          p.data_venda,
          `#${p.numero}`,
          cli.get(p.cliente_id)?.nome ?? '',
          p.tipo_venda === 'prazo' ? `A prazo ${p.parcelas_qtd}x` : `À vista${p.forma_pagamento ? ` · ${FORMA_PAGAMENTO[p.forma_pagamento]}` : ''}`,
          p.desconto,
          p.total,
        ]),
      };
    }
    case 'entregas': {
      const es = d.entregasView.filter((e) => entre(e.data, inicio, fim) && e.status !== 'cancelada').sort((a, b) => a.data.localeCompare(b.data));
      const ok = es.filter((e) => e.status === 'entregue').length;
      const falhas = es.filter((e) => e.status === 'nao_entregue').length;
      return {
        resumo: [
          { label: 'Entregas', valor: es.length, tipo: 'inteiro' },
          { label: 'Entregues', valor: ok, tipo: 'inteiro' },
          { label: 'Não entregues', valor: falhas, tipo: 'inteiro' },
          { label: 'Taxa de sucesso', valor: pct(ok, ok + falhas), tipo: 'pct' },
        ],
        colunas: [
          { label: 'Data', tipo: 'data' },
          { label: 'Cliente', tipo: 'texto' },
          { label: 'Bairro', tipo: 'texto' },
          { label: 'Pedido', tipo: 'texto' },
          { label: 'Motorista', tipo: 'texto' },
          { label: 'Status', tipo: 'texto' },
          { label: 'Recebido', tipo: 'moeda' },
        ],
        linhas: es.map((e) => [
          e.data,
          e.cliente?.nome ?? '',
          e.cliente?.bairro ?? '',
          `#${e.pedido?.numero ?? ''}`,
          e.motorista?.nome ?? '—',
          ENTREGA_STATUS[e.status].label,
          e.valor_recebido,
        ]),
      };
    }
    case 'recebimentos': {
      const ps = d.pagamentos.filter((p) => entre(p.data, inicio, fim)).sort((a, b) => a.data.localeCompare(b.data));
      const porForma = (f: string[]) => ps.filter((p) => f.includes(p.forma)).reduce((s, p) => s + p.valor, 0);
      return {
        resumo: [
          { label: 'Total recebido', valor: ps.reduce((s, p) => s + p.valor, 0), tipo: 'moeda' },
          { label: 'PIX', valor: porForma(['pix']), tipo: 'moeda' },
          { label: 'Dinheiro', valor: porForma(['dinheiro']), tipo: 'moeda' },
          { label: 'Cartão / boleto / outros', valor: porForma(['debito', 'credito', 'cartao', 'boleto', 'outro']), tipo: 'moeda' },
        ],
        colunas: [
          { label: 'Data', tipo: 'data' },
          { label: 'Cliente', tipo: 'texto' },
          { label: 'Pedido', tipo: 'texto' },
          { label: 'Forma', tipo: 'texto' },
          { label: 'Origem', tipo: 'texto' },
          { label: 'Valor', tipo: 'moeda' },
        ],
        linhas: ps.map((p) => {
          const pedido = ped.get(p.pedido_id);
          return [p.data, cli.get(pedido?.cliente_id ?? '')?.nome ?? '', `#${pedido?.numero ?? ''}`, FORMA_PAGAMENTO[p.forma], p.entrega_id ? 'Entrega' : 'Manual', p.valor];
        }),
      };
    }
    case 'aberto': {
      const hoje = hojeISO();
      const ps = d.parcelas.filter((p) => p.status === 'pendente' && entre(p.vencimento, inicio, fim)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
      const saldo = (p: (typeof ps)[number]) => round2(p.valor - p.valor_pago);
      return {
        resumo: [
          { label: 'Parcelas em aberto', valor: ps.length, tipo: 'inteiro' },
          { label: 'Saldo em aberto', valor: ps.reduce((s, p) => s + saldo(p), 0), tipo: 'moeda' },
          { label: 'Vencido', valor: ps.filter((p) => p.vencimento < hoje).reduce((s, p) => s + saldo(p), 0), tipo: 'moeda' },
          { label: 'A vencer', valor: ps.filter((p) => p.vencimento >= hoje).reduce((s, p) => s + saldo(p), 0), tipo: 'moeda' },
        ],
        colunas: [
          { label: 'Vencimento', tipo: 'data' },
          { label: 'Cliente', tipo: 'texto' },
          { label: 'Pedido', tipo: 'texto' },
          { label: 'Parcela', tipo: 'texto' },
          { label: 'Status', tipo: 'texto' },
          { label: 'Saldo', tipo: 'moeda' },
        ],
        linhas: ps.map((p) => {
          const pedido = ped.get(p.pedido_id);
          return [
            p.vencimento,
            cli.get(pedido?.cliente_id ?? '')?.nome ?? '',
            `#${pedido?.numero ?? ''}`,
            `${p.numero}/${p.total_parcelas}`,
            PARCELA_STATUS[statusEfetivo(p)].label,
            saldo(p),
          ];
        }),
      };
    }
    case 'porMotorista':
    case 'desempenho': {
      const es = d.entregasView.filter((e) => entre(e.data, inicio, fim) && e.motorista);
      const rs = d.rotasView.filter((r) => entre(r.data, inicio, fim));
      const linhas = d.motoristas
        .map((m) => {
          const minhas = es.filter((e) => e.motorista?.id === m.id);
          const ok = minhas.filter((e) => e.status === 'entregue').length;
          const falhas = minhas.filter((e) => e.status === 'nao_entregue').length;
          const pend = minhas.filter((e) => ['pendente', 'em_rota', 'reagendada'].includes(e.status)).length;
          const rotas = rs.filter((r) => r.motorista_id === m.id);
          const concl = rotas.filter((r) => r.status === 'concluida');
          const km = concl.reduce((s, r) => s + r.distancia_km, 0);
          const min = concl.reduce((s, r) => s + r.tempo_min, 0);
          return { m, total: minhas.length, ok, falhas, pend, recebido: minhas.reduce((s, e) => s + e.valor_recebido, 0), rotas: rotas.length, km, min };
        })
        .filter((x) => x.total > 0 || x.rotas > 0)
        .sort((a, b) => b.total - a.total);
      if (tipo === 'porMotorista') {
        return {
          resumo: [
            { label: 'Motoristas', valor: linhas.length, tipo: 'inteiro' },
            { label: 'Entregas atribuídas', valor: linhas.reduce((s, l) => s + l.total, 0), tipo: 'inteiro' },
            { label: 'Entregues', valor: linhas.reduce((s, l) => s + l.ok, 0), tipo: 'inteiro' },
            { label: 'Recebido nas entregas', valor: linhas.reduce((s, l) => s + l.recebido, 0), tipo: 'moeda' },
          ],
          colunas: [
            { label: 'Motorista', tipo: 'texto' },
            { label: 'Entregas', tipo: 'inteiro' },
            { label: 'Entregues', tipo: 'inteiro' },
            { label: 'Não entregues', tipo: 'inteiro' },
            { label: 'Pendentes', tipo: 'inteiro' },
            { label: 'Recebido', tipo: 'moeda' },
          ],
          linhas: linhas.map((l) => [l.m.nome, l.total, l.ok, l.falhas, l.pend, l.recebido]),
        };
      }
      const totOk = linhas.reduce((s, l) => s + l.ok, 0);
      const totFalha = linhas.reduce((s, l) => s + l.falhas, 0);
      return {
        resumo: [
          { label: 'Taxa de sucesso geral', valor: pct(totOk, totOk + totFalha), tipo: 'pct' },
          { label: 'Distância percorrida', valor: linhas.reduce((s, l) => s + l.km, 0), tipo: 'km' },
          { label: 'Tempo em rota (estimado)', valor: linhas.reduce((s, l) => s + l.min, 0), tipo: 'minutos' },
          { label: 'Rotas', valor: linhas.reduce((s, l) => s + l.rotas, 0), tipo: 'inteiro' },
        ],
        colunas: [
          { label: 'Motorista', tipo: 'texto' },
          { label: 'Rotas', tipo: 'inteiro' },
          { label: 'Entregas/rota', tipo: 'texto' },
          { label: 'Taxa de sucesso', tipo: 'pct' },
          { label: 'Distância', tipo: 'km' },
          { label: 'Tempo', tipo: 'minutos' },
          { label: 'km/entrega', tipo: 'texto' },
        ],
        linhas: linhas.map((l) => [
          l.m.nome,
          l.rotas,
          l.rotas ? (l.total / l.rotas).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—',
          pct(l.ok, l.ok + l.falhas),
          l.km,
          l.min,
          l.ok ? (l.km / l.ok).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—',
        ]),
      };
    }
    case 'clientes': {
      const linhas = d.clientes
        .map((c) => {
          const ps = d.pedidos.filter((p) => p.cliente_id === c.id && p.status !== 'cancelado');
          const noPeriodo = ps.filter((p) => entre(p.data_venda, inicio, fim));
          const ids = new Set(ps.map((p) => p.id));
          const aberto = d.parcelas.filter((p) => ids.has(p.pedido_id) && p.status === 'pendente').reduce((s, p) => s + p.valor - p.valor_pago, 0);
          const ultima = ps.map((p) => p.data_venda).sort().pop() ?? null;
          return { c, qtd: noPeriodo.length, total: noPeriodo.reduce((s, p) => s + p.total, 0), aberto: round2(aberto), ultima };
        })
        .sort((a, b) => b.total - a.total);
      return {
        resumo: [
          { label: 'Clientes', valor: linhas.length, tipo: 'inteiro' },
          { label: 'Compraram no período', valor: linhas.filter((l) => l.qtd > 0).length, tipo: 'inteiro' },
          { label: 'Total comprado', valor: linhas.reduce((s, l) => s + l.total, 0), tipo: 'moeda' },
          { label: 'Saldo em aberto', valor: linhas.reduce((s, l) => s + l.aberto, 0), tipo: 'moeda' },
        ],
        colunas: [
          { label: 'Cliente', tipo: 'texto' },
          { label: 'Bairro', tipo: 'texto' },
          { label: 'Cidade/UF', tipo: 'texto' },
          { label: 'Pedidos', tipo: 'inteiro' },
          { label: 'Comprado', tipo: 'moeda' },
          { label: 'Em aberto', tipo: 'moeda' },
          { label: 'Última compra', tipo: 'data' },
        ],
        linhas: linhas.map((l) => [l.c.nome, l.c.bairro, `${l.c.cidade}/${l.c.estado}`, l.qtd, l.total, l.aberto, l.ultima]),
      };
    }
    case 'pedidos': {
      const ps = d.pedidos.filter((p) => entre(p.data_venda, inicio, fim)).sort((a, b) => a.numero - b.numero);
      const saldo = (id: string) => round2(d.parcelas.filter((x) => x.pedido_id === id && x.status === 'pendente').reduce((s, x) => s + x.valor - x.valor_pago, 0));
      return {
        resumo: [
          { label: 'Pedidos', valor: ps.length, tipo: 'inteiro' },
          { label: 'Entregues', valor: ps.filter((p) => p.status === 'entregue').length, tipo: 'inteiro' },
          { label: 'Em aberto', valor: ps.filter((p) => !['entregue', 'cancelado'].includes(p.status)).length, tipo: 'inteiro' },
          { label: 'Cancelados', valor: ps.filter((p) => p.status === 'cancelado').length, tipo: 'inteiro' },
        ],
        colunas: [
          { label: 'Pedido', tipo: 'texto' },
          { label: 'Cliente', tipo: 'texto' },
          { label: 'Venda', tipo: 'data' },
          { label: 'Entrega prevista', tipo: 'data' },
          { label: 'Status', tipo: 'texto' },
          { label: 'Total', tipo: 'moeda' },
          { label: 'Em aberto', tipo: 'moeda' },
        ],
        linhas: ps.map((p) => [`#${p.numero}`, cli.get(p.cliente_id)?.nome ?? '', p.data_venda, p.data_entrega, PEDIDO_STATUS[p.status].label, p.total, saldo(p.id)]),
      };
    }
    case 'rotas': {
      const rs = d.rotasView.filter((r) => entre(r.data, inicio, fim)).sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
      return {
        resumo: [
          { label: 'Rotas', valor: rs.length, tipo: 'inteiro' },
          { label: 'Paradas', valor: rs.reduce((s, r) => s + r.paradas.length, 0), tipo: 'inteiro' },
          { label: 'Distância total', valor: rs.reduce((s, r) => s + r.distancia_km, 0), tipo: 'km' },
          { label: 'Tempo total', valor: rs.reduce((s, r) => s + r.tempo_min, 0), tipo: 'minutos' },
        ],
        colunas: [
          { label: 'Data', tipo: 'data' },
          { label: 'Motorista', tipo: 'texto' },
          { label: 'Paradas', tipo: 'inteiro' },
          { label: 'Entregues', tipo: 'inteiro' },
          { label: 'Distância', tipo: 'km' },
          { label: 'Tempo', tipo: 'minutos' },
          { label: 'Status', tipo: 'texto' },
        ],
        linhas: rs.map((r) => [
          r.data,
          r.motorista?.nome ?? r.nome,
          r.paradas.length,
          r.paradas.filter((p) => p.status === 'entregue').length,
          r.distancia_km,
          r.tempo_min,
          ROTA_STATUS[r.status].label,
        ]),
      };
    }
  }
}

/** Valor de célula para CSV (datas no padrão brasileiro, números crus) */
export function celulaCSV(v: string | number | null, tipo: TipoColuna): string | number {
  if (v == null) return '';
  if (tipo === 'data' && typeof v === 'string') return formatData(v);
  if (typeof v === 'number') return round2(v);
  return v;
}
