/**
 * Planejamento de rotas: monta o rascunho (plano) a partir da otimização automática,
 * permite edição manual na UI e persiste via RPC `salvar_plano_rotas`.
 */
import { corDoMotorista } from '@/lib/labels';
import { primeiroNome } from '@/lib/format';
import { avaliarRota, getOptimizer, otimizarOrdem, parametrosDaEmpresa, type Trecho } from '@/services/geo';
import type { Empresa, EntregaView, ID, ISODate, RotaView } from '@/types';
import { store } from '../data';
import { listarMotoristas, type MotoristaLista } from './motoristas';
import { carregarBaseEntregas, montarEntregas, montarRotas } from './views';

export interface PlanoRota {
  motoristaId: ID;
  nome: string;
  cor: string;
  paradas: EntregaView[];
  trechos: Trecho[];
  distanciaKm: number;
  tempoMin: number;
  cargaKg: number;
  capacidadeKg: number | null;
  /** Rotas já iniciadas/concluídas não podem ser editadas pelo planejamento */
  bloqueada: boolean;
  status: RotaView['status'] | 'rascunho';
}

export interface Plano {
  rotas: PlanoRota[];
  naoAtribuidas: EntregaView[];
  avisos: string[];
}

export interface DadosPlanejamento {
  empresa: Empresa;
  motoristas: MotoristaLista[];
  /** Entregas pendentes/reagendadas do dia (disponíveis para roteirização) */
  disponiveis: EntregaView[];
  rotasExistentes: RotaView[];
  pesoPorPedido: Record<ID, number>;
}

export { corDoMotorista };

export async function carregarPlanejamento(data: ISODate, empresaId: ID): Promise<DadosPlanejamento> {
  const [base, motoristas, itens, empresa] = await Promise.all([
    carregarBaseEntregas(),
    listarMotoristas(),
    store.list('itens_pedido'),
    store.get('empresas', empresaId),
  ]);
  const entregas = montarEntregas(base);
  const rotasExistentes = montarRotas(base, entregas).filter((r) => r.data === data);
  const bloqueadas = new Set(rotasExistentes.filter((r) => r.status !== 'planejada').map((r) => r.id));
  const disponiveis = entregas.filter(
    (e) => e.data === data && (e.status === 'pendente' || e.status === 'reagendada') && !(e.rota && bloqueadas.has(e.rota.id)),
  );
  const pesoPorPedido: Record<ID, number> = {};
  for (const i of itens) pesoPorPedido[i.pedido_id] = (pesoPorPedido[i.pedido_id] ?? 0) + i.peso_kg * i.quantidade;
  return { empresa: empresa!, motoristas, disponiveis, rotasExistentes, pesoPorPedido };
}

const temCoord = (e: EntregaView) => e.cliente?.latitude != null && e.cliente?.longitude != null;
const coordDe = (e: EntregaView) => ({ lat: e.cliente!.latitude!, lng: e.cliente!.longitude! });

/** Recalcula distância, tempo e carga de uma rota mantendo a ordem atual (após edição manual). */
export function recalcular(rota: PlanoRota, d: DadosPlanejamento): PlanoRota {
  const params = parametrosDaEmpresa(d.empresa);
  const partida = { lat: d.empresa.partida_lat, lng: d.empresa.partida_lng };
  const av = avaliarRota(partida, rota.paradas.filter(temCoord).map(coordDe), params);
  // paradas sem coordenada não entram no cálculo (trecho zero)
  let k = 0;
  const trechos = rota.paradas.map((p) => (temCoord(p) ? av.trechos[k++] : { distanciaKm: 0, tempoMin: params.tempoParadaMin }));
  return {
    ...rota,
    trechos,
    distanciaKm: av.distanciaKm,
    tempoMin: av.tempoMin,
    cargaKg: rota.paradas.reduce((s, p) => s + (d.pesoPorPedido[p.pedido_id] ?? 0), 0),
  };
}

/** Reordena as paradas de uma rota pelo menor percurso (vizinho mais próximo + 2-opt). */
export function reordenar(rota: PlanoRota, d: DadosPlanejamento): PlanoRota {
  const partida = { lat: d.empresa.partida_lat, lng: d.empresa.partida_lng };
  const comCoord = rota.paradas.filter(temCoord);
  const ordem = otimizarOrdem(partida, comCoord.map((p) => ({ id: p.id, ...coordDe(p) })), parametrosDaEmpresa(d.empresa));
  const porId = new Map(rota.paradas.map((p) => [p.id, p]));
  const paradas = [...ordem.map((id) => porId.get(id)!), ...rota.paradas.filter((p) => !temCoord(p))];
  return recalcular({ ...rota, paradas }, d);
}

function rotaVazia(m: MotoristaLista, d: DadosPlanejamento): PlanoRota {
  return {
    motoristaId: m.id,
    nome: `Rota ${primeiroNome(m.nome)}`,
    cor: corDoMotorista(m.id, d.motoristas),
    paradas: [],
    trechos: [],
    distanciaKm: 0,
    tempoMin: 0,
    cargaKg: 0,
    capacidadeKg: m.veiculo?.capacidade_kg ?? null,
    bloqueada: false,
    status: 'rascunho',
  };
}

/** Plano a partir das rotas já salvas para o dia (para continuar editando). */
export function planoExistente(d: DadosPlanejamento): Plano {
  const rotas: PlanoRota[] = d.rotasExistentes.map((r) => {
    const m = d.motoristas.find((x) => x.id === r.motorista_id);
    return recalcularSeEditavel(
      {
        motoristaId: r.motorista_id,
        nome: r.nome,
        cor: r.cor,
        paradas: r.paradas,
        trechos: r.paradas.map((p) => ({ distanciaKm: p.trecho_km ?? 0, tempoMin: 0 })),
        distanciaKm: r.distancia_km,
        tempoMin: r.tempo_min,
        cargaKg: r.paradas.reduce((s, p) => s + (d.pesoPorPedido[p.pedido_id] ?? 0), 0),
        capacidadeKg: m?.veiculo?.capacidade_kg ?? null,
        bloqueada: r.status !== 'planejada',
        status: r.status,
      },
      d,
    );
  });
  const atribuidas = new Set(rotas.flatMap((r) => r.paradas.map((p) => p.id)));
  return { rotas, naoAtribuidas: d.disponiveis.filter((e) => !atribuidas.has(e.id)), avisos: [] };
}

function recalcularSeEditavel(r: PlanoRota, d: DadosPlanejamento) {
  return r.bloqueada ? r : recalcular(r, d);
}

/**
 * Executa a otimização automática para as entregas e motoristas selecionados.
 * Rotas bloqueadas (em andamento) são preservadas.
 */
export async function otimizar(
  d: DadosPlanejamento,
  entregaIds: ID[],
  motoristaIds: ID[],
  bloqueadas: PlanoRota[],
): Promise<Plano> {
  const selecionadas = d.disponiveis.filter((e) => entregaIds.includes(e.id));
  const motoristas = d.motoristas.filter((m) => motoristaIds.includes(m.id));
  const params = parametrosDaEmpresa(d.empresa);
  const res = await getOptimizer().otimizar({
    partida: { lat: d.empresa.partida_lat, lng: d.empresa.partida_lng },
    paradas: selecionadas.map((e) => ({
      id: e.id,
      lat: e.cliente?.latitude ?? NaN,
      lng: e.cliente?.longitude ?? NaN,
      pesoKg: d.pesoPorPedido[e.pedido_id] ?? 0,
    })),
    veiculos: motoristas.map((m) => ({ id: m.id, capacidadeKg: m.veiculo?.capacidade_kg ?? null })),
    parametros: params,
  });
  const porId = new Map(selecionadas.map((e) => [e.id, e]));
  const rotas = res.rotas.map((r) => {
    const m = motoristas.find((x) => x.id === r.veiculoId)!;
    return recalcular({ ...rotaVazia(m, d), paradas: r.paradas.map((id) => porId.get(id)!) }, d);
  });
  const atribuidas = new Set(rotas.flatMap((r) => r.paradas.map((p) => p.id)));
  const avisos = [...res.avisos];
  if (res.naoAtribuidas.length) {
    avisos.push(`${res.naoAtribuidas.length} entrega(s) sem localização do cliente ficaram fora das rotas.`);
  }
  return {
    rotas: [...bloqueadas, ...rotas],
    naoAtribuidas: d.disponiveis.filter((e) => !atribuidas.has(e.id)),
    avisos,
  };
}

export function novaRotaVazia(motoristaId: ID, d: DadosPlanejamento): PlanoRota | null {
  const m = d.motoristas.find((x) => x.id === motoristaId);
  return m ? rotaVazia(m, d) : null;
}

export async function salvarPlano(data: ISODate, plano: Plano, empresa: Empresa) {
  await store.rpc('salvar_plano_rotas', {
    data,
    partida_lat: empresa.partida_lat,
    partida_lng: empresa.partida_lng,
    rotas: plano.rotas
      .filter((r) => !r.bloqueada && r.paradas.length)
      .map((r) => ({
        motorista_id: r.motoristaId,
        nome: r.nome,
        cor: r.cor,
        distancia_km: r.distanciaKm,
        tempo_min: r.tempoMin,
        paradas: r.paradas.map((p, i) => ({
          entrega_id: p.id,
          ordem: i + 1,
          distancia_km: r.trechos[i]?.distanciaKm ?? 0,
          tempo_min: r.trechos[i]?.tempoMin ?? 0,
        })),
      })),
  });
}
