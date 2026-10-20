/**
 * Gerador de dados de DEMONSTRAÇÃO. Todos os nomes, telefones, CPFs e placas são fictícios.
 * As datas são relativas ao dia atual para que o sistema sempre tenha "hoje", "amanhã" e histórico.
 * Os pedidos, rotas e pagamentos são criados pelas mesmas regras (RPCs) usadas pelo sistema.
 */
import { hojeISO, somarDias } from '@/lib/dates';
import { corDoMotorista } from '@/lib/labels';
import { buscarBairro } from '@/services/geo/gazetteer';
import { otimizarSync } from '@/services/geo/optimizer';
import type { Cliente, FormaPagamento, Motorista, Pedido, PedidoStatus, Produto } from '@/types';
import type { SalvarPedidoArgs, StoreContext } from './store';
import { rpcHandlers } from './local/rpc';
import { TABELAS, Tx, type Db } from './local/tx';

export const DEMO_EMPRESA_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_SENHA = 'demo123';

export const DEMO_USUARIOS = {
  admin: { id: '00000000-0000-4000-8000-0000000000a1', nome: 'Marina Costa', email: 'admin@demo.routeflow', perfil: 'admin' as const },
  vendedor: { id: '00000000-0000-4000-8000-0000000000a2', nome: 'Rafael Lima', email: 'vendas@demo.routeflow', perfil: 'vendedor' as const },
  joao: { id: '00000000-0000-4000-8000-0000000000b1', nome: 'João Pereira', email: 'joao@demo.routeflow', perfil: 'motorista' as const },
  carlos: { id: '00000000-0000-4000-8000-0000000000b2', nome: 'Carlos Mendes', email: 'carlos@demo.routeflow', perfil: 'motorista' as const },
  lucas: { id: '00000000-0000-4000-8000-0000000000b3', nome: 'Lucas Almeida', email: 'lucas@demo.routeflow', perfil: 'motorista' as const },
  pedro: { id: '00000000-0000-4000-8000-0000000000b4', nome: 'Pedro Santos', email: 'pedro@demo.routeflow', perfil: 'motorista' as const },
};

/** PRNG determinístico (mulberry32) */
function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** CPF de teste (base 000.000.0XX) com dígitos verificadores válidos */
function cpfTeste(n: number): string {
  const base = String(n).padStart(9, '0');
  const dv = (s: string) => {
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += Number(s[i]) * (s.length + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv(base + d1);
  const d = base + d1 + d2;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const CLIENTES: [string, string][] = [
  ['João da Silva', 'Adrianópolis'],
  ['Mercadinho Bom Preço', 'Aleixo'],
  ['Padaria Pão Quente', 'Parque 10 de Novembro'],
  ['Maria Oliveira', 'Flores'],
  ['Restaurante Sabor da Terra', 'Centro'],
  ['Lanchonete Ponto Certo', 'Chapada'],
  ['Ana Beatriz Rocha', 'Dom Pedro'],
  ['Empório Ponta Negra', 'Ponta Negra'],
  ['Comercial Compensa', 'Compensa'],
  ['Mercearia Cidade Nova', 'Cidade Nova'],
  ['Distribuidora Japiim', 'Japiim'],
  ['Francisco Nogueira', 'Petrópolis'],
  ['Minimercado São José', 'São José Operário'],
  ['Bar e Petiscaria Educandos', 'Educandos'],
  ['Hotel Planalto', 'Planalto'],
  ['Cantina Alvorada', 'Alvorada'],
  ['Conveniência Coroado', 'Coroado'],
  ['Pousada Tarumã', 'Tarumã'],
];

const PRODUTOS: [string, string, number, number][] = [
  ['Galão de água mineral 20L', 'un', 14, 20],
  ['Fardo de água 500ml (12 un)', 'fardo', 18, 6.5],
  ['Caixa de refrigerante 2L (6 un)', 'cx', 54, 13],
  ['Saco de arroz 5kg', 'un', 28, 5],
  ['Fardo de açúcar 10kg', 'fardo', 45, 10],
  ['Caixa de óleo de soja (20 un)', 'cx', 160, 18],
  ['Caixa de café 500g (10 un)', 'cx', 190, 5.5],
  ['Caixa de leite em pó 400g (12 un)', 'cx', 210, 5],
];

export function gerarDadosDemo(): Db {
  const rand = prng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const hoje = hojeISO();
  const db = Object.fromEntries(TABELAS.map((t) => [t, []])) as unknown as Db;
  const agora = new Date().toISOString();

  db.empresas.push({
    id: DEMO_EMPRESA_ID,
    nome: 'Distribuidora Exemplo',
    cidade: 'Manaus',
    estado: 'AM',
    partida_descricao: 'Centro de distribuição — Distrito Industrial',
    partida_lat: -3.127,
    partida_lng: -59.96,
    velocidade_media_kmh: 24,
    tempo_parada_min: 6,
    fator_rota: 1.35,
    considerar_retorno: false,
    app_navegacao: 'google',
    created_at: agora,
    updated_at: agora,
  });

  const ctx: StoreContext = { empresaId: DEMO_EMPRESA_ID, usuarioId: DEMO_USUARIOS.admin.id, perfil: 'admin', motoristaId: null };
  const tx = new Tx(db, ctx);
  const empresa = db.empresas[0];
  const params = {
    velocidadeMediaKmh: empresa.velocidade_media_kmh,
    tempoParadaMin: empresa.tempo_parada_min,
    fatorRota: empresa.fator_rota,
    considerarRetorno: empresa.considerar_retorno,
  };

  for (const u of Object.values(DEMO_USUARIOS)) {
    tx.insert('usuarios', { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: true });
  }

  // Veículos e motoristas
  const frota: [keyof typeof DEMO_USUARIOS, string, string, string, number, Motorista['status']][] = [
    ['joao', 'Utilitário', 'Fiat Fiorino', 'RFL-1A01', 650, 'disponivel'],
    ['carlos', 'Van', 'Renault Master', 'RFL-2B02', 1500, 'disponivel'],
    ['lucas', 'Caminhonete', 'Hyundai HR', 'RFL-3C03', 1800, 'disponivel'],
    ['pedro', 'Utilitário', 'Fiat Doblò Cargo', 'RFL-4D04', 750, 'indisponivel'],
  ];
  const motoristas: Record<string, Motorista> = {};
  frota.forEach(([chave, tipo, modelo, placa, cap, status], i) => {
    const v = tx.insert('veiculos', { tipo, modelo, placa, capacidade_kg: cap });
    const u = DEMO_USUARIOS[chave];
    motoristas[chave] = tx.insert('motoristas', {
      usuario_id: u.id,
      veiculo_id: v.id,
      nome: u.nome,
      telefone: `(92) 90000-01${String(i + 1).padStart(2, '0')}`,
      email: u.email,
      cpf: cpfTeste(i + 1),
      status,
    });
  });
  const corDe = (m: Motorista) => corDoMotorista(m.id, Object.values(motoristas));

  const produtos: Produto[] = PRODUTOS.map(([nome, unidade, preco, peso]) =>
    tx.insert('produtos', { nome, unidade, preco, peso_kg: peso, ativo: true }),
  );

  const clientes: Cliente[] = CLIENTES.map(([nome, bairro], i) => {
    const geo = buscarBairro(bairro, 'Manaus', 'AM');
    return tx.insert('clientes', {
      nome,
      telefone: `(92) 90000-00${String(i + 1).padStart(2, '0')}`,
      bairro,
      cidade: 'Manaus',
      estado: 'AM',
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      geo_precisao: geo ? 'bairro' : 'pendente',
      geo_fonte: geo ? 'local:bairro' : null,
    });
  });

  /* ------------------------------ pedidos ------------------------------ */
  const criarPedido = (
    cliente: Cliente,
    dataVenda: string,
    dataEntrega: string | null,
    status: PedidoStatus,
    pagamento?: { tipo: 'avista' | 'prazo'; forma: FormaPagamento; naEntrega?: boolean; parcelas?: number },
  ): Pedido => {
    const qtdItens = 1 + Math.floor(rand() * 3);
    const escolhidos = new Set<Produto>();
    while (escolhidos.size < qtdItens) escolhidos.add(pick(produtos));
    const pg =
      pagamento ??
      (rand() < 0.3
        ? { tipo: 'prazo' as const, forma: pick<FormaPagamento>(['boleto', 'pix']), parcelas: 2 + Math.floor(rand() * 2) }
        : { tipo: 'avista' as const, forma: pick<FormaPagamento>(['pix', 'dinheiro', 'debito', 'credito']), naEntrega: rand() < 0.6 });
    const args: SalvarPedidoArgs = {
      pedido: {
        cliente_id: cliente.id,
        data_venda: dataVenda,
        data_entrega: dataEntrega,
        desconto: rand() < 0.25 ? 10 : 0,
        observacoes: '',
        status,
        tipo_venda: pg.tipo,
        forma_pagamento: pg.forma,
        receber_na_entrega: pg.tipo === 'avista' ? !!pg.naEntrega : false,
        parcelas_qtd: pg.tipo === 'prazo' ? (pg.parcelas ?? 3) : 1,
        intervalo_dias: 30,
        primeiro_vencimento: pg.tipo === 'prazo' ? somarDias(dataVenda, 30) : null,
      },
      itens: [...escolhidos].map((p) => ({
        produto_id: p.id,
        descricao: p.nome,
        quantidade: 1 + Math.floor(rand() * 5),
        valor_unitario: p.preco,
        peso_kg: p.peso_kg,
      })),
      gerar_entrega: !!dataEntrega,
    };
    return rpcHandlers.salvar_pedido(tx, args);
  };

  const horario = (dia: string, minutos: number) => {
    const [y, m, d] = dia.split('-').map(Number);
    return new Date(y, m - 1, d, 8, 0 + minutos).toISOString();
  };

  /** Planeja e (opcionalmente) executa as rotas de um dia usando o otimizador */
  const roteirizar = (dia: string, equipe: Motorista[], entregaIds?: string[]) => {
    const pool = tx.where(
      'entregas',
      (e) => e.data === dia && (e.status === 'pendente' || e.status === 'reagendada') && (!entregaIds || entregaIds.includes(e.id)),
    );
    if (!pool.length) return [];
    const paradas = pool.map((e) => {
      const c = tx.get('clientes', e.cliente_id)!;
      const peso = tx.where('itens_pedido', (i) => i.pedido_id === e.pedido_id).reduce((s, i) => s + i.peso_kg * i.quantidade, 0);
      return { id: e.id, lat: c.latitude!, lng: c.longitude!, pesoKg: peso };
    });
    const veiculos = equipe.map((m) => ({ id: m.id, capacidadeKg: tx.get('veiculos', m.veiculo_id!)?.capacidade_kg ?? null }));
    const res = otimizarSync({ partida: { lat: empresa.partida_lat, lng: empresa.partida_lng }, paradas, veiculos, parametros: params });
    rpcHandlers.salvar_plano_rotas(tx, {
      data: dia,
      partida_lat: empresa.partida_lat,
      partida_lng: empresa.partida_lng,
      rotas: res.rotas.map((r) => {
        const m = equipe.find((x) => x.id === r.veiculoId)!;
        return {
          motorista_id: m.id,
          nome: `Rota ${m.nome.split(' ')[0]}`,
          cor: corDe(m),
          distancia_km: r.distanciaKm,
          tempo_min: r.tempoMin,
          paradas: r.paradas.map((id, i) => ({ entrega_id: id, ordem: i + 1, distancia_km: r.trechos[i].distanciaKm, tempo_min: r.trechos[i].tempoMin })),
        };
      }),
    });
    return tx.where('rotas', (r) => r.data === dia);
  };

  const executarRota = (rotaId: string, dia: string, limite = Infinity, falharIndice = -1) => {
    rpcHandlers.iniciar_rota(tx, { rota_id: rotaId });
    tx.update('rotas', rotaId, { iniciada_em: horario(dia, 0) });
    const paradas = tx.where('rota_entregas', (re) => re.rota_id === rotaId).sort((a, b) => a.ordem - b.ordem);
    for (const re of paradas) tx.update('entregas', re.entrega_id, { saida_em: horario(dia, 0) });
    let minutos = 0;
    paradas.forEach((re, i) => {
      if (i >= limite) return;
      minutos += Math.round(re.tempo_min) + empresa.tempo_parada_min;
      const e = tx.get('entregas', re.entrega_id)!;
      if (i === falharIndice) {
        rpcHandlers.registrar_falha_entrega(tx, {
          entrega_id: e.id,
          motivo: 'cliente_ausente',
          observacao: 'Ninguém atendeu no local.',
          reagendar_para: somarDias(dia, 1),
        });
        return;
      }
      rpcHandlers.confirmar_entrega(tx, {
        entrega_id: e.id,
        horario: horario(dia, minutos),
        data: dia,
        observacao: '',
        valor_recebido: e.valor_receber,
        forma: e.valor_receber > 0 ? pick<FormaPagamento>(['pix', 'dinheiro', 'cartao']) : null,
      });
    });
    const rota = tx.get('rotas', rotaId)!;
    if (rota.status === 'concluida') tx.update('rotas', rotaId, { concluida_em: horario(dia, minutos + 10) });
  };

  // Histórico antigo de vendas a prazo (para contas a receber / vencidas)
  for (const [offset, cli, parcelas] of [
    [-62, 0, 3],
    [-47, 3, 2],
    [-36, 6, 3],
    [-21, 11, 2],
  ] as const) {
    const venda = somarDias(hoje, offset);
    const p = criarPedido(clientes[cli], venda, somarDias(venda, 1), 'pronto', { tipo: 'prazo', forma: 'boleto', parcelas });
    const e = tx.where('entregas', (x) => x.pedido_id === p.id)[0];
    rpcHandlers.confirmar_entrega(tx, { entrega_id: e.id, horario: horario(e.data, 120), data: e.data, observacao: '', valor_recebido: 0, forma: null });
  }
  // Pagamentos das primeiras parcelas (deixando outras vencidas)
  for (const parcela of tx.where('parcelas', (p) => p.numero === 1 && p.vencimento < somarDias(hoje, -20))) {
    rpcHandlers.registrar_pagamento(tx, {
      parcela_id: parcela.id,
      valor: parcela.valor,
      forma: 'boleto',
      data: parcela.vencimento,
      observacao: 'Pagamento de boleto',
    });
  }

  // Últimos 14 dias: pedidos entregues com rotas executadas
  const { joao, carlos, lucas, pedro } = motoristas;
  for (let offset = -14; offset <= -1; offset++) {
    const dia = somarDias(hoje, offset);
    const domingo = new Date(`${dia}T12:00:00`).getDay() === 0;
    if (domingo) continue;
    const qtd = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < qtd; k++) criarPedido(pick(clientes), somarDias(dia, -1), dia, 'pronto');
    const equipe = offset < -7 ? [joao, carlos, pedro] : [joao, carlos, lucas];
    const rotas = roteirizar(dia, qtd >= 5 ? equipe : equipe.slice(0, 2));
    rotas.forEach((r, i) => executarRota(r.id, dia, Infinity, offset === -4 && i === 0 ? 1 : -1));
  }

  tx.update('motoristas', pedro.id, { status: 'indisponivel' });

  // Hoje: rotas em andamento, uma planejada e entregas ainda não roteirizadas
  const ordemHoje = [...clientes].sort(() => rand() - 0.5);
  for (let k = 0; k < 14; k++) criarPedido(ordemHoje[k], somarDias(hoje, k < 10 ? -1 : 0), hoje, 'pronto');
  const entregasHoje = tx.where('entregas', (e) => e.data === hoje && (e.status === 'pendente' || e.status === 'reagendada'));
  const roteirizar11 = entregasHoje.slice(0, 11).map((e) => e.id);
  const rotasHoje = roteirizar(hoje, [joao, carlos, lucas], roteirizar11);
  const rotaJoao = rotasHoje.find((r) => r.motorista_id === joao.id);
  const rotaLucas = rotasHoje.find((r) => r.motorista_id === lucas.id);
  if (rotaJoao) executarRota(rotaJoao.id, hoje, 2);
  if (rotaLucas) executarRota(rotaLucas.id, hoje, 2, 1);

  // Amanhã e depois: pedidos para planejamento
  const amanha = somarDias(hoje, 1);
  for (let k = 0; k < 9; k++) criarPedido(clientes[(k * 2 + 1) % clientes.length], hoje, amanha, k < 6 ? 'pronto' : 'preparando');
  for (let k = 0; k < 3; k++) criarPedido(clientes[(k * 5 + 2) % clientes.length], hoje, somarDias(hoje, 2), 'novo');

  // Um pedido cancelado
  const cancelar = criarPedido(clientes[9], somarDias(hoje, -2), amanha, 'preparando');
  rpcHandlers.alterar_status_pedido(tx, { pedido_id: cancelar.id, status: 'cancelado' });

  return db;
}
