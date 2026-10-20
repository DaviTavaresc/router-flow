/**
 * Otimizador local de rotas com múltiplos motoristas (VRP capacitado, heurístico).
 *
 * Etapas:
 *  1. Setorização angular (sweep) em torno do ponto de partida → grupos iniciais coerentes.
 *  2. Refinamento estilo k-means com teto de balanceamento e capacidade do veículo.
 *  3. Ordenação de cada rota: vizinho mais próximo + 2-opt.
 *  4. Busca local: realocação de paradas entre rotas, minimizando
 *     tempo total + peso × maior jornada (equilíbrio) + penalidade de capacidade.
 *
 * Determinístico (sem aleatoriedade): mesma entrada → mesmo resultado.
 * Para produção em larga escala, substitua por VROOM/OR-Tools/APIs comerciais
 * implementando a interface RouteOptimizer.
 */
import { EstimatedDistanceProvider } from './distance';
import type {
  DistanceProvider,
  LatLng,
  OptInput,
  OptResult,
  OptRoute,
  OptStop,
  OptVehicle,
  ParametrosRota,
  RouteOptimizer,
  Trecho,
} from './types';

/** Peso do equilíbrio entre motoristas (minutos da maior jornada) na função objetivo */
const PESO_EQUILIBRIO = 1.0;
const PENALIDADE_CAPACIDADE = 10_000;
const FOLGA_BALANCEAMENTO = 1.3;

/* ------------------------------------------------------------------ */
/* Avaliação e ordenação de uma rota individual (usado também na edição manual) */
/* ------------------------------------------------------------------ */

export interface AvaliacaoRota {
  trechos: Trecho[];
  distanciaKm: number;
  tempoMin: number;
}

export function avaliarRota(
  partida: LatLng,
  paradas: LatLng[],
  params: ParametrosRota,
  dp: DistanceProvider = new EstimatedDistanceProvider(params),
): AvaliacaoRota {
  const trechos: Trecho[] = [];
  let anterior = partida;
  let distanciaKm = 0;
  let tempoMin = 0;
  for (const p of paradas) {
    const t = dp.trecho(anterior, p);
    trechos.push(t);
    distanciaKm += t.distanciaKm;
    tempoMin += t.tempoMin + params.tempoParadaMin;
    anterior = p;
  }
  if (params.considerarRetorno && paradas.length) {
    const volta = dp.trecho(anterior, partida);
    distanciaKm += volta.distanciaKm;
    tempoMin += volta.tempoMin;
  }
  return { trechos, distanciaKm, tempoMin };
}

/** Matriz de distâncias: índice 0 = partida, 1..n = paradas */
function matriz(pontos: LatLng[], dp: DistanceProvider): number[][] {
  return pontos.map((a) => pontos.map((b) => (a === b ? 0 : dp.trecho(a, b).distanciaKm)));
}

/** Custo (km) de um caminho que parte do nó 0 visitando `seq` (índices de matriz) */
function custoCaminho(seq: number[], d: number[][], retorno: boolean): number {
  let c = 0;
  let prev = 0;
  for (const i of seq) {
    c += d[prev][i];
    prev = i;
  }
  if (retorno && seq.length) c += d[prev][0];
  return c;
}

function vizinhoMaisProximo(nos: number[], d: number[][]): number[] {
  const restantes = new Set(nos);
  const seq: number[] = [];
  let atual = 0;
  while (restantes.size) {
    let melhor = -1;
    let melhorD = Infinity;
    for (const n of restantes) {
      if (d[atual][n] < melhorD - 1e-12 || (Math.abs(d[atual][n] - melhorD) < 1e-12 && n < melhor)) {
        melhor = n;
        melhorD = d[atual][n];
      }
    }
    seq.push(melhor);
    restantes.delete(melhor);
    atual = melhor;
  }
  return seq;
}

function doisOpt(seq: number[], d: number[][], retorno: boolean): number[] {
  const path = [0, ...seq];
  const n = path.length;
  const dist = (i: number, j: number) => (j >= n ? (retorno ? d[path[i]][0] : 0) : d[path[i]][path[j]]);
  let melhorou = true;
  let guard = 0;
  while (melhorou && guard++ < 200) {
    melhorou = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const antes = d[path[i - 1]][path[i]] + dist(j, j + 1);
        const depois = d[path[i - 1]][path[j]] + (j + 1 >= n ? (retorno ? d[path[i]][0] : 0) : d[path[i]][path[j + 1]]);
        if (depois < antes - 1e-9) {
          const seg = path.slice(i, j + 1).reverse();
          path.splice(i, seg.length, ...seg);
          melhorou = true;
        }
      }
    }
  }
  return path.slice(1);
}

function ordenarIndices(nos: number[], d: number[][], retorno: boolean): number[] {
  if (nos.length <= 1) return [...nos];
  return doisOpt(vizinhoMaisProximo(nos, d), d, retorno);
}

/** Reordena paradas de uma rota (vizinho mais próximo + 2-opt). Retorna os ids na nova ordem. */
export function otimizarOrdem<T extends LatLng & { id: string }>(
  partida: LatLng,
  paradas: T[],
  params: ParametrosRota,
  dp: DistanceProvider = new EstimatedDistanceProvider(params),
): string[] {
  const d = matriz([partida, ...paradas], dp);
  const seq = ordenarIndices(
    paradas.map((_, i) => i + 1),
    d,
    params.considerarRetorno,
  );
  return seq.map((i) => paradas[i - 1].id);
}

/* ------------------------------------------------------------------ */
/* Otimização multi-motorista                                          */
/* ------------------------------------------------------------------ */

interface Estado {
  rotas: number[][]; // índices de matriz por veículo
  km: number[];
}

export class LocalRouteOptimizer implements RouteOptimizer {
  readonly nome = 'local-heuristico';

  constructor(private readonly dpFactory: (p: ParametrosRota) => DistanceProvider = (p) => new EstimatedDistanceProvider(p)) {}

  async otimizar(input: OptInput): Promise<OptResult> {
    return otimizarSync(input, this.dpFactory(input.parametros));
  }
}

export function otimizarSync(input: OptInput, dp: DistanceProvider = new EstimatedDistanceProvider(input.parametros)): OptResult {
  const { partida, veiculos, parametros } = input;
  const avisos: string[] = [];
  const naoAtribuidas: OptResult['naoAtribuidas'] = [];

  const paradas: OptStop[] = [];
  for (const p of input.paradas) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) paradas.push(p);
    else naoAtribuidas.push({ id: p.id, motivo: 'Cliente sem localização' });
  }

  if (!veiculos.length) {
    for (const p of paradas) naoAtribuidas.push({ id: p.id, motivo: 'Nenhum motorista selecionado' });
    return { rotas: [], naoAtribuidas, avisos: ['Selecione ao menos um motorista.'], totalKm: 0, maiorTempoMin: 0 };
  }
  if (!paradas.length) {
    return {
      rotas: veiculos.map((v) => vazia(v.id)),
      naoAtribuidas,
      avisos,
      totalKm: 0,
      maiorTempoMin: 0,
    };
  }

  const pontos: LatLng[] = [partida, ...paradas];
  const d = matriz(pontos, dp);
  const pesos = [0, ...paradas.map((p) => p.pesoKg ?? 0)];
  const retorno = parametros.considerarRetorno;
  const V = veiculos.length;
  const n = paradas.length;

  const tempoDe = (km: number, qtd: number) =>
    (km / Math.max(parametros.velocidadeMediaKmh, 1)) * 60 + qtd * parametros.tempoParadaMin;
  const carga = (r: number[]) => r.reduce((s, i) => s + pesos[i], 0);
  const excesso = (r: number[], v: OptVehicle) =>
    v.capacidadeKg ? Math.max(0, carga(r) - v.capacidadeKg) : 0;

  // 1. Setorização angular
  let grupos = sweep(paradas, partida, V);

  // 2. Refinamento k-means com teto de balanceamento e capacidade
  const teto = Math.ceil((n / V) * FOLGA_BALANCEAMENTO);
  for (let it = 0; it < 20; it++) {
    const centros = grupos.map((g, gi) => (g.length ? centroide(g.map((i) => pontos[i])) : pontoMaisDistante(grupos, gi, pontos, partida)));
    const novos = atribuirBalanceado(paradas, centros, teto, veiculos, pesos);
    if (mesmaAtribuicao(grupos, novos)) break;
    grupos = novos;
  }

  // 3. Ordenação inicial
  const estado: Estado = { rotas: grupos.map((g) => ordenarIndices(g, d, retorno)), km: [] };
  estado.km = estado.rotas.map((r) => custoCaminho(r, d, retorno));

  const objetivo = (km: number[], rotas: number[][]) => {
    let soma = 0;
    let max = 0;
    let pen = 0;
    for (let v = 0; v < V; v++) {
      const t = tempoDe(km[v], rotas[v].length);
      soma += t;
      max = Math.max(max, t);
      pen += excesso(rotas[v], veiculos[v]) * PENALIDADE_CAPACIDADE;
    }
    return soma + PESO_EQUILIBRIO * max + pen;
  };

  // 4. Busca local: realocação entre rotas
  let atual = objetivo(estado.km, estado.rotas);
  for (let passe = 0; passe < 40; passe++) {
    let melhorou = false;
    for (let a = 0; a < V; a++) {
      for (let pos = 0; pos < estado.rotas[a].length; pos++) {
        const no = estado.rotas[a][pos];
        const semNo = estado.rotas[a].filter((_, i) => i !== pos);
        const kmA = custoCaminho(semNo, d, retorno);
        let melhor: { b: number; rota: number[]; km: number; obj: number } | null = null;
        for (let b = 0; b < V; b++) {
          if (b === a) continue;
          const { rota, km } = insercaoMaisBarata(estado.rotas[b], no, d, retorno);
          const kms = [...estado.km];
          kms[a] = kmA;
          kms[b] = km;
          const rotas = [...estado.rotas];
          rotas[a] = semNo;
          rotas[b] = rota;
          const obj = objetivo(kms, rotas);
          if (obj < atual - 0.01 && (!melhor || obj < melhor.obj)) melhor = { b, rota, km, obj };
        }
        if (melhor) {
          estado.rotas[a] = ordenarIndices(semNo, d, retorno);
          estado.rotas[melhor.b] = ordenarIndices(melhor.rota, d, retorno);
          estado.km[a] = custoCaminho(estado.rotas[a], d, retorno);
          estado.km[melhor.b] = custoCaminho(estado.rotas[melhor.b], d, retorno);
          atual = objetivo(estado.km, estado.rotas);
          melhorou = true;
          pos--; // a posição atual agora contém outro nó
        }
      }
    }
    if (!melhorou) break;
  }

  // Resultado
  const rotas: OptRoute[] = veiculos.map((v, vi) => {
    const seq = estado.rotas[vi];
    const av = avaliarRota(partida, seq.map((i) => pontos[i]), parametros, dp);
    const cargaKg = carga(seq);
    const excede = !!v.capacidadeKg && cargaKg > v.capacidadeKg;
    if (excede) avisos.push(`A carga atribuída a um veículo (${cargaKg.toFixed(0)} kg) excede sua capacidade (${v.capacidadeKg} kg).`);
    return {
      veiculoId: v.id,
      paradas: seq.map((i) => paradas[i - 1].id),
      trechos: av.trechos,
      distanciaKm: av.distanciaKm,
      tempoMin: av.tempoMin,
      cargaKg,
      excedeCapacidade: excede,
    };
  });

  return {
    rotas,
    naoAtribuidas,
    avisos,
    totalKm: rotas.reduce((s, r) => s + r.distanciaKm, 0),
    maiorTempoMin: Math.max(0, ...rotas.map((r) => r.tempoMin)),
  };
}

/* ---------------------------- auxiliares ---------------------------- */

function vazia(veiculoId: string): OptRoute {
  return { veiculoId, paradas: [], trechos: [], distanciaKm: 0, tempoMin: 0, cargaKg: 0, excedeCapacidade: false };
}

function angulo(p: LatLng, c: LatLng) {
  return Math.atan2(p.lat - c.lat, (p.lng - c.lng) * Math.cos((c.lat * Math.PI) / 180));
}

/** Divide as paradas em V setores angulares contíguos, começando no maior "vão" angular. */
function sweep(paradas: OptStop[], partida: LatLng, V: number): number[][] {
  const itens = paradas
    .map((p, i) => ({ idx: i + 1, a: angulo(p, partida) }))
    .sort((x, y) => x.a - y.a || x.idx - y.idx);
  // encontra o maior vão para iniciar a varredura
  let inicio = 0;
  let maiorVao = -1;
  for (let i = 0; i < itens.length; i++) {
    const prox = itens[(i + 1) % itens.length];
    const vao = (prox.a - itens[i].a + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
    if (vao > maiorVao) {
      maiorVao = vao;
      inicio = (i + 1) % itens.length;
    }
  }
  const ordenados = [...itens.slice(inicio), ...itens.slice(0, inicio)];
  const grupos: number[][] = Array.from({ length: V }, () => []);
  ordenados.forEach((it, k) => grupos[Math.min(V - 1, Math.floor((k * V) / ordenados.length))].push(it.idx));
  return grupos;
}

function centroide(pts: LatLng[]): LatLng {
  const s = pts.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: s.lat / pts.length, lng: s.lng / pts.length };
}

/** Para grupos vazios: usa o ponto mais distante da partida que ainda não é centro de outro grupo */
function pontoMaisDistante(grupos: number[][], gi: number, pontos: LatLng[], partida: LatLng): LatLng {
  const maior = grupos.reduce((m, g, i) => (i !== gi && g.length > grupos[m].length ? i : m), gi === 0 ? 1 % grupos.length : 0);
  const g = grupos[maior];
  if (!g.length) return partida;
  let melhor = g[0];
  let melhorD = -1;
  for (const i of g) {
    const dd = (pontos[i].lat - partida.lat) ** 2 + (pontos[i].lng - partida.lng) ** 2;
    if (dd > melhorD) {
      melhorD = dd;
      melhor = i;
    }
  }
  return pontos[melhor];
}

function atribuirBalanceado(
  paradas: OptStop[],
  centros: LatLng[],
  teto: number,
  veiculos: OptVehicle[],
  pesos: number[],
): number[][] {
  const V = centros.length;
  const dist = (p: LatLng, c: LatLng) => (p.lat - c.lat) ** 2 + ((p.lng - c.lng) * Math.cos((c.lat * Math.PI) / 180)) ** 2;
  // prioriza paradas com maior "arrependimento" (diferença entre melhor e segundo melhor centro)
  const ordem = paradas
    .map((p, i) => {
      const ds = centros.map((c) => dist(p, c)).sort((a, b) => a - b);
      return { idx: i + 1, p, regret: (ds[1] ?? ds[0]) - ds[0] };
    })
    .sort((a, b) => b.regret - a.regret || a.idx - b.idx);

  const grupos: number[][] = Array.from({ length: V }, () => []);
  const cargas = new Array(V).fill(0);
  for (const { idx, p } of ordem) {
    const candidatos = centros
      .map((c, v) => ({ v, d: dist(p, c) }))
      .sort((a, b) => a.d - b.d || a.v - b.v);
    const escolhido =
      candidatos.find(
        ({ v }) =>
          grupos[v].length < teto &&
          (!veiculos[v].capacidadeKg || cargas[v] + pesos[idx] <= (veiculos[v].capacidadeKg as number)),
      ) ??
      candidatos.find(({ v }) => grupos[v].length < teto) ??
      candidatos[0];
    grupos[escolhido.v].push(idx);
    cargas[escolhido.v] += pesos[idx];
  }
  return grupos;
}

function mesmaAtribuicao(a: number[][], b: number[][]) {
  return a.every((g, i) => g.length === b[i].length && [...g].sort().join() === [...b[i]].sort().join());
}

function insercaoMaisBarata(rota: number[], no: number, d: number[][], retorno: boolean): { rota: number[]; km: number } {
  let melhorPos = 0;
  let melhorDelta = Infinity;
  const path = [0, ...rota];
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = i + 1 < path.length ? path[i + 1] : retorno ? 0 : -1;
    const delta = b === -1 ? d[a][no] : d[a][no] + d[no][b] - d[a][b];
    if (delta < melhorDelta) {
      melhorDelta = delta;
      melhorPos = i;
    }
  }
  const nova = [...rota];
  nova.splice(melhorPos, 0, no);
  return { rota: nova, km: custoCaminho(nova, d, retorno) };
}
