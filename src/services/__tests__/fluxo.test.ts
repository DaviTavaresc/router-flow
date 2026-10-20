/**
 * Teste de integração do fluxo principal pela camada de serviços (modo demo):
 * cliente → pedido → data de entrega → motoristas → otimizar → salvar rotas →
 * motorista executa → confirma entrega → recebimento → financeiro atualizado.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

// localStorage mínimo para o ambiente node
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});

const { auth } = await import('@/services/auth');
const { store, localStore } = await import('@/services/data');
const { DEMO_SENHA, DEMO_USUARIOS } = await import('@/services/data/seed');
const clientes = await import('@/services/api/clientes');
const pedidos = await import('@/services/api/pedidos');
const planejamento = await import('@/services/api/planejamento');
const entregas = await import('@/services/api/entregas');
const motorista = await import('@/services/api/motorista');
const financeiro = await import('@/services/api/financeiro');
const { amanhaISO, hojeISO, somarDias } = await import('@/lib/dates');

const DIA = somarDias(hojeISO(), 3);

describe('fluxo principal', () => {
  let pedidoId = '';
  let entregaId = '';

  beforeAll(async () => {
    localStore!.carregarDemo();
    await auth.entrar(DEMO_USUARIOS.admin.email, DEMO_SENHA);
  });

  it('cadastra cliente com 5 campos e geolocaliza pelo bairro', async () => {
    const c = await clientes.salvarCliente(null, { nome: 'Cliente Teste', telefone: '(92) 90000-9999', bairro: 'Adrianópolis', cidade: 'Manaus', estado: 'AM' });
    expect(c.geo_precisao).toBe('bairro');
    expect(c.latitude).not.toBeNull();
    const p = await pedidos.salvarPedido({
      pedido: {
        cliente_id: c.id,
        data_venda: hojeISO(),
        data_entrega: DIA,
        desconto: 0,
        observacoes: '',
        status: 'pronto',
        tipo_venda: 'avista',
        forma_pagamento: 'pix',
        receber_na_entrega: true,
        parcelas_qtd: 1,
        intervalo_dias: 0,
        primeiro_vencimento: null,
      },
      itens: [{ produto_id: null, descricao: 'Item teste', quantidade: 2, valor_unitario: 175, peso_kg: 5 }],
      gerar_entrega: true,
    });
    expect(p.total).toBe(350);
    pedidoId = p.id;
  });

  it('gera parcelas a prazo (R$ 1.200 em 3x)', async () => {
    const c = (await clientes.listarClientes())[0];
    const p = await pedidos.salvarPedido({
      pedido: {
        cliente_id: c.id,
        data_venda: hojeISO(),
        data_entrega: null,
        desconto: 0,
        observacoes: '',
        status: 'novo',
        tipo_venda: 'prazo',
        forma_pagamento: 'boleto',
        receber_na_entrega: false,
        parcelas_qtd: 3,
        intervalo_dias: 30,
        primeiro_vencimento: '2026-10-10',
      },
      itens: [{ produto_id: null, descricao: 'Lote', quantidade: 1, valor_unitario: 1200, peso_kg: 0 }],
      gerar_entrega: false,
    });
    const d = await pedidos.detalhePedido(p.id);
    expect(d.parcelas.map((x) => [x.valor, x.vencimento])).toEqual([
      [400, '2026-10-10'],
      [400, '2026-11-10'],
      [400, '2026-12-10'],
    ]);
  });

  it('otimiza e salva rotas com vários motoristas', async () => {
    // mais algumas entregas no mesmo dia
    const todos = await clientes.listarClientes();
    for (const c of todos.slice(0, 8)) {
      await pedidos.salvarPedido({
        pedido: { cliente_id: c.id, data_venda: hojeISO(), data_entrega: DIA, desconto: 0, observacoes: '', status: 'pronto', tipo_venda: 'avista', forma_pagamento: 'dinheiro', receber_na_entrega: false, parcelas_qtd: 1, intervalo_dias: 0, primeiro_vencimento: null },
        itens: [{ produto_id: null, descricao: 'Item', quantidade: 1, valor_unitario: 50, peso_kg: 10 }],
        gerar_entrega: true,
      });
    }
    const sessao = await auth.restaurar();
    const d = await planejamento.carregarPlanejamento(DIA, sessao!.empresa.id);
    expect(d.disponiveis.length).toBe(9);
    const joao = d.motoristas.find((m) => m.email === DEMO_USUARIOS.joao.email)!;
    const carlos = d.motoristas.find((m) => m.email === DEMO_USUARIOS.carlos.email)!;
    const plano = await planejamento.otimizar(d, d.disponiveis.map((e) => e.id), [joao.id, carlos.id], []);
    expect(plano.rotas.flatMap((r) => r.paradas).length).toBe(9);
    expect(plano.rotas.every((r) => r.distanciaKm > 0)).toBe(true);

    // edição manual: move a entrega do pedido de teste para o João, no início
    entregaId = d.disponiveis.find((e) => e.pedido_id === pedidoId)!.id;
    const semEla = plano.rotas.map((r) => ({ ...r, paradas: r.paradas.filter((p) => p.id !== entregaId) }));
    const alvo = semEla.find((r) => r.motoristaId === joao.id)!;
    alvo.paradas.unshift(d.disponiveis.find((e) => e.id === entregaId)!);
    const editado = { ...plano, rotas: semEla.map((r) => planejamento.recalcular(r, d)) };
    await planejamento.salvarPlano(DIA, editado, sessao!.empresa);

    const rotas = await entregas.listarRotas(DIA);
    expect(rotas.length).toBe(2);
    const rj = rotas.find((r) => r.motorista_id === joao.id)!;
    expect(rj.paradas[0].id).toBe(entregaId);
    expect(rj.paradas.map((p) => p.ordem)).toEqual(rj.paradas.map((_, i) => i + 1));
  });

  it('motorista só enxerga a própria rota e não acessa o financeiro', async () => {
    await auth.sair();
    await auth.entrar(DEMO_USUARIOS.joao.email, DEMO_SENHA);
    const { rota } = await motorista.minhaRotaDoDia(DIA);
    expect(rota?.paradas[0].id).toBe(entregaId);
    expect(await store.list('parcelas')).toEqual([]);
    expect(await store.list('pagamentos')).toEqual([]);
    const todas = await entregas.listarEntregas();
    expect(todas.every((e) => e.motorista?.email === DEMO_USUARIOS.joao.email)).toBe(true);
    await expect(store.update('clientes', rota!.paradas[0].cliente_id, { nome: 'x' })).rejects.toThrow(/permissão/);
  });

  it('motorista inicia a rota, confirma com recebimento e passa para a próxima', async () => {
    const { rota } = await motorista.minhaRotaDoDia(DIA);
    await entregas.iniciarRota(rota!.id);
    const antes = await motorista.minhaRotaDoDia(DIA);
    expect(antes.proxima?.id).toBe(entregaId);
    expect(antes.proxima?.valor_receber).toBe(350);
    await entregas.confirmarEntrega({ entrega_id: entregaId, horario: new Date().toISOString(), observacao: 'ok', valor_recebido: 350, forma: 'pix' });
    const depois = await motorista.minhaRotaDoDia(DIA);
    expect(depois.proxima?.id).not.toBe(entregaId);
    expect(depois.rota?.status).toBe('em_andamento');
  });

  it('não entregue com reagendamento cria nova entrega', async () => {
    const { proxima } = await motorista.minhaRotaDoDia(DIA);
    await entregas.registrarFalhaEntrega({ entrega_id: proxima!.id, motivo: 'cliente_ausente', observacao: '', reagendar_para: amanhaISO() });
    await auth.sair();
    await auth.entrar(DEMO_USUARIOS.admin.email, DEMO_SENHA);
    const todas = await entregas.listarEntregas();
    const original = todas.find((e) => e.id === proxima!.id)!;
    expect(original.status).toBe('nao_entregue');
    expect(todas.some((e) => e.pedido_id === original.pedido_id && e.status === 'reagendada' && e.data === amanhaISO())).toBe(true);
  });

  it('financeiro reflete o recebimento na entrega', async () => {
    const d = await pedidos.detalhePedido(pedidoId);
    expect(d.pedido.status).toBe('entregue');
    expect(d.parcelas[0].status).toBe('pago');
    expect(d.pagamentos[0]).toMatchObject({ valor: 350, forma: 'pix', entrega_id: entregaId });
    const resumo = await financeiro.resumoFinanceiro();
    expect(resumo.totalRecebido).toBeGreaterThanOrEqual(350);
  });

  it('vendedor não registra pagamentos nem exclui clientes', async () => {
    await auth.sair();
    await auth.entrar(DEMO_USUARIOS.vendedor.email, DEMO_SENHA);
    const parc = (await financeiro.listarParcelas()).find((p) => p.status === 'pendente')!;
    await expect(financeiro.registrarPagamento({ parcela_id: parc.id, valor: 1, forma: 'pix', data: hojeISO(), observacao: '' })).rejects.toThrow(/permissão/);
    const c = (await clientes.listarClientes())[0];
    await expect(clientes.excluirCliente(c.id)).rejects.toThrow(/permissão/);
  });

  it('cliente com pedidos não pode ser excluído', async () => {
    await auth.sair();
    await auth.entrar(DEMO_USUARIOS.admin.email, DEMO_SENHA);
    const d = await pedidos.detalhePedido(pedidoId);
    await expect(clientes.excluirCliente(d.pedido.cliente_id)).rejects.toThrow(/possui pedidos/);
  });
});
