/**
 * Implementação em TypeScript das RPCs do banco para o modo demonstração.
 * Mantenha em paridade com supabase/migrations/003_functions.sql.
 */
import { agoraISO } from '@/lib/dates';
import { round2 } from '@/lib/format';
import { calcularTotais, gerarParcelas } from '@/services/domain/financeiro';
import { avaliarRota } from '@/services/geo/optimizer';
import type { Entrega, FormaPagamento, Parcela, Pedido, PedidoStatus } from '@/types';
import { AppError, type RpcMap, type RpcName } from '../store';
import type { Tx } from './tx';

type Handlers = { [K in RpcName]: (tx: Tx, args: RpcMap[K]['args']) => RpcMap[K]['result'] };

const STATUS_FINAIS_ENTREGA = ['entregue', 'nao_entregue', 'cancelada'] as const;
const STATUS_MANUAIS: PedidoStatus[] = ['novo', 'preparando', 'pronto'];

/* ------------------------------ auxiliares ------------------------------ */

function exigirPerfil(tx: Tx, ...perfis: Array<'admin' | 'vendedor' | 'motorista'>) {
  if (!perfis.includes(tx.ctx.perfil)) throw new AppError('Você não tem permissão para esta operação.');
}

function parametros(tx: Tx) {
  const e = tx.must('empresas', tx.ctx.empresaId, 'Empresa');
  return {
    velocidadeMediaKmh: e.velocidade_media_kmh,
    tempoParadaMin: e.tempo_parada_min,
    fatorRota: e.fator_rota,
    considerarRetorno: e.considerar_retorno,
  };
}

function entregaAtiva(tx: Tx, pedidoId: string): Entrega | null {
  return (
    tx
      .where('entregas', (e) => e.pedido_id === pedidoId && !['cancelada', 'nao_entregue'].includes(e.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

function valorAReceberNaEntrega(tx: Tx, pedido: Pedido): number {
  if (pedido.tipo_venda !== 'avista' || !pedido.receber_na_entrega) return 0;
  return round2(
    tx
      .where('parcelas', (p) => p.pedido_id === pedido.id && p.status === 'pendente')
      .reduce((s, p) => s + p.valor - p.valor_pago, 0),
  );
}

function criarEntrega(tx: Tx, pedido: Pedido, data: string, status: Entrega['status'] = 'pendente'): Entrega {
  return tx.insert('entregas', {
    pedido_id: pedido.id,
    cliente_id: pedido.cliente_id,
    data,
    status,
    saida_em: null,
    entregue_em: null,
    observacoes: '',
    valor_receber: valorAReceberNaEntrega(tx, pedido),
    valor_recebido: 0,
  });
}

function quitar(
  tx: Tx,
  parcela: Parcela,
  valor: number,
  forma: FormaPagamento,
  data: string,
  observacao: string,
  entregaId: string | null,
) {
  const novoPago = round2(parcela.valor_pago + valor);
  const pago = novoPago >= parcela.valor - 0.005;
  tx.update('parcelas', parcela.id, {
    valor_pago: novoPago,
    status: pago ? 'pago' : 'pendente',
    pago_em: pago ? data : null,
    forma_pagamento: forma,
  });
  tx.insert('pagamentos', {
    pedido_id: parcela.pedido_id,
    parcela_id: parcela.id,
    entrega_id: entregaId,
    valor: round2(valor),
    forma,
    data,
    observacao,
    registrado_por: tx.ctx.usuarioId,
  });
}

function gerarFinanceiro(tx: Tx, pedido: Pedido) {
  if (pedido.tipo_venda === 'prazo') {
    for (const p of gerarParcelas(pedido.total, pedido.parcelas_qtd, pedido.primeiro_vencimento!, pedido.intervalo_dias)) {
      tx.insert('parcelas', { ...p, pedido_id: pedido.id, status: 'pendente', pago_em: null, valor_pago: 0, forma_pagamento: pedido.forma_pagamento });
    }
    return;
  }
  const vencimento = pedido.receber_na_entrega ? (pedido.data_entrega ?? pedido.data_venda) : pedido.data_venda;
  const parcela = tx.insert('parcelas', {
    pedido_id: pedido.id,
    numero: 1,
    total_parcelas: 1,
    valor: pedido.total,
    vencimento,
    status: 'pendente',
    pago_em: null,
    valor_pago: 0,
    forma_pagamento: pedido.forma_pagamento,
  });
  if (!pedido.receber_na_entrega) {
    quitar(tx, parcela, pedido.total, pedido.forma_pagamento ?? 'pix', pedido.data_venda, 'Pagamento no ato da venda', null);
  }
}

/** Recalcula ordem, trechos, distância e tempo de uma rota a partir das paradas atuais. */
export function recalcularRota(tx: Tx, rotaId: string) {
  const rota = tx.get('rotas', rotaId);
  if (!rota) return;
  const paradas = tx.where('rota_entregas', (re) => re.rota_id === rotaId).sort((a, b) => a.ordem - b.ordem);
  if (!paradas.length && rota.status === 'planejada') {
    tx.remove('rotas', rotaId);
    return;
  }
  const coords = paradas.map((re) => {
    const e = tx.get('entregas', re.entrega_id);
    const c = e ? tx.get('clientes', e.cliente_id) : null;
    return { lat: c?.latitude ?? rota.partida_lat, lng: c?.longitude ?? rota.partida_lng };
  });
  const av = avaliarRota({ lat: rota.partida_lat, lng: rota.partida_lng }, coords, parametros(tx));
  paradas.forEach((re, i) =>
    tx.update('rota_entregas', re.id, { ordem: i + 1, distancia_km: av.trechos[i].distanciaKm, tempo_min: av.trechos[i].tempoMin }),
  );
  tx.update('rotas', rotaId, { distancia_km: av.distanciaKm, tempo_min: av.tempoMin });
}

function removerDaRota(tx: Tx, entregaId: string) {
  const re = tx.where('rota_entregas', (x) => x.entrega_id === entregaId)[0];
  if (!re) return;
  tx.remove('rota_entregas', re.id);
  recalcularRota(tx, re.rota_id);
}

function rotaDaEntrega(tx: Tx, entregaId: string) {
  const re = tx.where('rota_entregas', (x) => x.entrega_id === entregaId)[0];
  return re ? tx.get('rotas', re.rota_id) : null;
}

function exigirEntregaDoMotorista(tx: Tx, entregaId: string) {
  if (tx.ctx.perfil !== 'motorista') return;
  const rota = rotaDaEntrega(tx, entregaId);
  if (!rota || rota.motorista_id !== tx.ctx.motoristaId) throw new AppError('Esta entrega não pertence à sua rota.');
}

function verificarConclusaoRota(tx: Tx, rotaId: string | undefined) {
  if (!rotaId) return;
  const rota = tx.get('rotas', rotaId);
  if (!rota || rota.status === 'concluida' || rota.status === 'cancelada') return;
  const paradas = tx.where('rota_entregas', (re) => re.rota_id === rotaId);
  const todasFinalizadas = paradas.every((re) => {
    const e = tx.get('entregas', re.entrega_id);
    return !e || (STATUS_FINAIS_ENTREGA as readonly string[]).includes(e.status);
  });
  if (todasFinalizadas) {
    tx.update('rotas', rotaId, { status: 'concluida', concluida_em: agoraISO() });
    const outras = tx.where('rotas', (r) => r.motorista_id === rota.motorista_id && r.id !== rotaId && r.status === 'em_andamento');
    if (!outras.length) tx.update('motoristas', rota.motorista_id, { status: 'disponivel' });
  } else if (rota.status === 'planejada') {
    tx.update('rotas', rotaId, { status: 'em_andamento', iniciada_em: rota.iniciada_em ?? agoraISO() });
    tx.update('motoristas', rota.motorista_id, { status: 'em_rota' });
  }
}

/* ------------------------------- handlers ------------------------------- */

export const rpcHandlers: Handlers = {
  salvar_pedido(tx, { id, pedido: p, itens, gerar_entrega }) {
    exigirPerfil(tx, 'admin', 'vendedor');
    if (!itens.length) throw new AppError('Adicione ao menos um produto ao pedido.');
    if (itens.some((i) => !i.descricao.trim() || i.quantidade <= 0 || i.valor_unitario < 0)) {
      throw new AppError('Verifique produtos, quantidades e valores.');
    }
    tx.must('clientes', p.cliente_id, 'Cliente');
    const { subtotal, desconto, total } = calcularTotais(itens, p.desconto);
    if (total <= 0) throw new AppError('O valor total do pedido deve ser maior que zero.');
    const prazo = p.tipo_venda === 'prazo';
    if (prazo && (!p.primeiro_vencimento || p.parcelas_qtd < 1)) {
      throw new AppError('Informe a quantidade de parcelas e o primeiro vencimento.');
    }
    if (!prazo && !p.forma_pagamento) throw new AppError('Informe a forma de pagamento.');

    const atualStatus = id ? tx.get('pedidos', id)?.status : undefined;
    const dados = {
      ...p,
      // em_rota/entregue/cancelado são definidos pelo sistema, não pelo formulário
      status: STATUS_MANUAIS.includes(p.status) ? p.status : (atualStatus ?? 'novo'),
      subtotal,
      desconto,
      total,
      parcelas_qtd: prazo ? Math.floor(p.parcelas_qtd) : 1,
      intervalo_dias: prazo ? p.intervalo_dias : 0,
      primeiro_vencimento: prazo ? p.primeiro_vencimento : null,
      receber_na_entrega: prazo ? false : p.receber_na_entrega,
    };

    let pedido: Pedido;
    if (id) {
      const atual = tx.must('pedidos', id, 'Pedido');
      if (atual.status === 'cancelado' || atual.status === 'entregue') {
        throw new AppError('Pedidos entregues ou cancelados não podem ser editados.');
      }
      const financeiroMudou =
        atual.total !== total ||
        atual.tipo_venda !== dados.tipo_venda ||
        atual.parcelas_qtd !== dados.parcelas_qtd ||
        atual.primeiro_vencimento !== dados.primeiro_vencimento ||
        atual.intervalo_dias !== dados.intervalo_dias ||
        atual.receber_na_entrega !== dados.receber_na_entrega ||
        atual.forma_pagamento !== dados.forma_pagamento;
      const temPagamentos = tx.where('pagamentos', (x) => x.pedido_id === id).length > 0;
      if (temPagamentos && financeiroMudou) {
        throw new AppError('Este pedido já possui pagamentos registrados. Não é possível alterar valores ou condições de pagamento.');
      }
      pedido = tx.update('pedidos', id, dados);
      tx.removeWhere('itens_pedido', (i) => i.pedido_id === id);
      if (financeiroMudou) {
        tx.removeWhere('parcelas', (x) => x.pedido_id === id);
        gerarFinanceiro(tx, pedido);
      }
      const entrega = entregaAtiva(tx, id);
      if (entrega && (entrega.status === 'pendente' || entrega.status === 'reagendada')) {
        const patch: Partial<Entrega> = { valor_receber: valorAReceberNaEntrega(tx, pedido) };
        if (pedido.data_entrega && pedido.data_entrega !== entrega.data) {
          patch.data = pedido.data_entrega;
          removerDaRota(tx, entrega.id);
        }
        tx.update('entregas', entrega.id, patch);
      } else if (!entrega && gerar_entrega && pedido.data_entrega) {
        criarEntrega(tx, pedido, pedido.data_entrega);
      }
    } else {
      const numero = Math.max(1000, ...tx.all('pedidos').map((x) => x.numero)) + 1;
      pedido = tx.insert('pedidos', { ...dados, numero, vendedor_id: tx.ctx.usuarioId });
      gerarFinanceiro(tx, pedido);
      if (gerar_entrega && pedido.data_entrega) criarEntrega(tx, pedido, pedido.data_entrega);
    }

    for (const i of itens) {
      tx.insert('itens_pedido', {
        pedido_id: pedido.id,
        produto_id: i.produto_id,
        descricao: i.descricao.trim(),
        quantidade: i.quantidade,
        valor_unitario: round2(i.valor_unitario),
        peso_kg: i.peso_kg,
        total: round2(i.quantidade * i.valor_unitario),
      });
    }
    return pedido;
  },

  alterar_status_pedido(tx, { pedido_id, status }) {
    exigirPerfil(tx, 'admin', 'vendedor');
    const pedido = tx.must('pedidos', pedido_id, 'Pedido');
    if (pedido.status === 'cancelado' && status !== 'cancelado') throw new AppError('Pedidos cancelados não podem ser reabertos.');
    if (status !== 'cancelado' && !STATUS_MANUAIS.includes(status)) throw new AppError('Este status é definido automaticamente pelas entregas.');
    if (status !== 'cancelado' && (pedido.status === 'em_rota' || pedido.status === 'entregue')) {
      throw new AppError('O status de pedidos em rota ou entregues é definido pelas entregas.');
    }
    if (status === 'cancelado') {
      if (tx.where('entregas', (e) => e.pedido_id === pedido_id && e.status === 'entregue').length) {
        throw new AppError('Pedidos já entregues não podem ser cancelados.');
      }
      for (const e of tx.where('entregas', (e) => e.pedido_id === pedido_id && e.status !== 'nao_entregue')) {
        removerDaRota(tx, e.id);
        tx.update('entregas', e.id, { status: 'cancelada' });
      }
      for (const p of tx.where('parcelas', (x) => x.pedido_id === pedido_id && x.status === 'pendente')) {
        tx.update('parcelas', p.id, { status: 'cancelado' });
      }
    }
    tx.update('pedidos', pedido_id, { status });
    return null;
  },

  gerar_entrega(tx, { pedido_id, data }) {
    exigirPerfil(tx, 'admin', 'vendedor');
    const pedido = tx.must('pedidos', pedido_id, 'Pedido');
    if (pedido.status === 'cancelado') throw new AppError('Pedido cancelado.');
    if (entregaAtiva(tx, pedido_id)) throw new AppError('Este pedido já possui uma entrega ativa.');
    const atualizado = tx.update('pedidos', pedido_id, { data_entrega: data });
    return criarEntrega(tx, atualizado, data);
  },

  registrar_pagamento(tx, { parcela_id, valor, forma, data, observacao }) {
    exigirPerfil(tx, 'admin');
    const parcela = tx.must('parcelas', parcela_id, 'Parcela');
    if (parcela.status !== 'pendente') throw new AppError('Somente parcelas pendentes podem receber pagamento.');
    const saldo = round2(parcela.valor - parcela.valor_pago);
    if (valor <= 0 || valor > saldo + 0.009) throw new AppError(`Informe um valor entre R$ 0,01 e o saldo da parcela.`);
    quitar(tx, parcela, valor, forma, data, observacao, null);
    const pedido = tx.must('pedidos', parcela.pedido_id);
    const entrega = entregaAtiva(tx, pedido.id);
    if (entrega && entrega.status !== 'entregue') tx.update('entregas', entrega.id, { valor_receber: valorAReceberNaEntrega(tx, pedido) });
    return null;
  },

  salvar_plano_rotas(tx, { data, partida_lat, partida_lng, rotas }) {
    exigirPerfil(tx, 'admin');
    const doDia = tx.where('rotas', (r) => r.data === data);
    const editaveis = new Set(doDia.filter((r) => r.status === 'planejada').map((r) => r.id));
    const bloqueadas = new Set(
      tx.where('rota_entregas', (re) => doDia.some((r) => r.id === re.rota_id && !editaveis.has(r.id))).map((re) => re.entrega_id),
    );
    const vistas = new Set<string>();
    for (const r of rotas) {
      tx.must('motoristas', r.motorista_id, 'Motorista');
      for (const p of r.paradas) {
        const e = tx.must('entregas', p.entrega_id, 'Entrega');
        if (vistas.has(e.id)) throw new AppError('Uma entrega foi atribuída a mais de uma rota.');
        if (bloqueadas.has(e.id)) throw new AppError('Uma das entregas já está em uma rota em andamento.');
        if (e.data !== data) throw new AppError('Todas as entregas devem ser da data planejada.');
        if (e.status !== 'pendente' && e.status !== 'reagendada') throw new AppError('Somente entregas pendentes podem ser roteirizadas.');
        vistas.add(e.id);
      }
    }
    tx.removeWhere('rota_entregas', (re) => editaveis.has(re.rota_id));
    tx.removeWhere('rotas', (r) => editaveis.has(r.id));
    for (const r of rotas) {
      if (!r.paradas.length) continue;
      const rota = tx.insert('rotas', {
        motorista_id: r.motorista_id,
        data,
        nome: r.nome,
        cor: r.cor,
        status: 'planejada',
        distancia_km: r.distancia_km,
        tempo_min: r.tempo_min,
        partida_lat,
        partida_lng,
        iniciada_em: null,
        concluida_em: null,
      });
      for (const p of r.paradas) {
        tx.insert('rota_entregas', { rota_id: rota.id, entrega_id: p.entrega_id, ordem: p.ordem, distancia_km: p.distancia_km, tempo_min: p.tempo_min });
      }
    }
    return null;
  },

  iniciar_rota(tx, { rota_id }) {
    exigirPerfil(tx, 'admin', 'motorista');
    const rota = tx.must('rotas', rota_id, 'Rota');
    if (tx.ctx.perfil === 'motorista' && rota.motorista_id !== tx.ctx.motoristaId) throw new AppError('Esta rota não é sua.');
    if (rota.status !== 'planejada') throw new AppError('Esta rota já foi iniciada.');
    const agora = agoraISO();
    tx.update('rotas', rota_id, { status: 'em_andamento', iniciada_em: agora });
    for (const re of tx.where('rota_entregas', (x) => x.rota_id === rota_id)) {
      const e = tx.get('entregas', re.entrega_id);
      if (e && (e.status === 'pendente' || e.status === 'reagendada')) {
        tx.update('entregas', e.id, { status: 'em_rota', saida_em: agora });
        tx.update('pedidos', e.pedido_id, { status: 'em_rota' });
      }
    }
    tx.update('motoristas', rota.motorista_id, { status: 'em_rota' });
    return null;
  },

  confirmar_entrega(tx, { entrega_id, horario, data, observacao, valor_recebido, forma }) {
    exigirPerfil(tx, 'admin', 'motorista');
    exigirEntregaDoMotorista(tx, entrega_id);
    const e = tx.must('entregas', entrega_id, 'Entrega');
    if (!['pendente', 'em_rota', 'reagendada'].includes(e.status)) throw new AppError('Esta entrega já foi finalizada.');
    if (valor_recebido < 0) throw new AppError('Valor recebido inválido.');
    if (valor_recebido > 0 && !forma) throw new AppError('Informe a forma de recebimento.');
    tx.update('entregas', entrega_id, {
      status: 'entregue',
      entregue_em: horario,
      saida_em: e.saida_em ?? horario,
      observacoes: observacao || e.observacoes,
      valor_recebido: round2(valor_recebido),
    });
    tx.update('pedidos', e.pedido_id, { status: 'entregue' });

    let restante = round2(valor_recebido);
    const dataPag = data;
    const pendentes = tx
      .where('parcelas', (p) => p.pedido_id === e.pedido_id && p.status === 'pendente')
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.numero - b.numero);
    for (const p of pendentes) {
      if (restante <= 0.005) break;
      const valor = Math.min(restante, round2(p.valor - p.valor_pago));
      quitar(tx, p, valor, forma!, dataPag, 'Recebido na entrega', entrega_id);
      restante = round2(restante - valor);
    }
    if (restante > 0.005) {
      tx.insert('pagamentos', {
        pedido_id: e.pedido_id,
        parcela_id: null,
        entrega_id,
        valor: restante,
        forma: forma!,
        data: dataPag,
        observacao: 'Valor recebido acima do saldo em aberto',
        registrado_por: tx.ctx.usuarioId,
      });
    }
    verificarConclusaoRota(tx, rotaDaEntrega(tx, entrega_id)?.id);
    return null;
  },

  registrar_falha_entrega(tx, { entrega_id, motivo, observacao, reagendar_para }) {
    exigirPerfil(tx, 'admin', 'motorista');
    exigirEntregaDoMotorista(tx, entrega_id);
    const e = tx.must('entregas', entrega_id, 'Entrega');
    if (!['pendente', 'em_rota', 'reagendada'].includes(e.status)) throw new AppError('Esta entrega já foi finalizada.');
    if (motivo === 'outro' && !observacao.trim()) throw new AppError('Descreva o motivo na observação.');
    const rota = rotaDaEntrega(tx, entrega_id);
    tx.update('entregas', entrega_id, { status: 'nao_entregue', observacoes: observacao || e.observacoes });
    tx.insert('ocorrencias', {
      entrega_id,
      motorista_id: tx.ctx.motoristaId ?? rota?.motorista_id ?? null,
      motivo,
      observacao,
      reagendada_para: reagendar_para,
    });
    const pedido = tx.must('pedidos', e.pedido_id);
    if (reagendar_para) {
      const atualizado = tx.update('pedidos', pedido.id, { status: 'pronto', data_entrega: reagendar_para });
      criarEntrega(tx, atualizado, reagendar_para, 'reagendada');
    } else {
      tx.update('pedidos', pedido.id, { status: 'pronto' });
    }
    verificarConclusaoRota(tx, rota?.id);
    return null;
  },

  reagendar_entrega(tx, { entrega_id, data }) {
    exigirPerfil(tx, 'admin');
    const e = tx.must('entregas', entrega_id, 'Entrega');
    const pedido = tx.must('pedidos', e.pedido_id);
    if (pedido.status === 'cancelado') throw new AppError('Pedido cancelado.');
    if (e.status === 'nao_entregue') {
      if (entregaAtiva(tx, pedido.id)) throw new AppError('Já existe uma entrega ativa para este pedido.');
      const atualizado = tx.update('pedidos', pedido.id, { status: 'pronto', data_entrega: data });
      criarEntrega(tx, atualizado, data, 'reagendada');
      return null;
    }
    if (e.status !== 'pendente' && e.status !== 'reagendada') {
      throw new AppError('Somente entregas pendentes ou não realizadas podem ser reagendadas.');
    }
    const rota = rotaDaEntrega(tx, entrega_id);
    if (rota && rota.status !== 'planejada') throw new AppError('A entrega está em uma rota em andamento.');
    removerDaRota(tx, entrega_id);
    tx.update('entregas', entrega_id, { data, status: 'reagendada' });
    tx.update('pedidos', pedido.id, { data_entrega: data });
    return null;
  },
};
