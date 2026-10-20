import type { Empresa } from '@/types';
import { EstimatedDistanceProvider } from './distance';
import { LocalRouteOptimizer } from './optimizer';
import type { DistanceProvider, ParametrosRota, RouteOptimizer } from './types';

export * from './types';
export { getGeocoder } from './geocoder';
export { urlNavegacao, urlRotaCompleta, type AppNavegacao } from './navigation';
export { avaliarRota, otimizarOrdem } from './optimizer';

export function parametrosDaEmpresa(e: Empresa): ParametrosRota {
  return {
    velocidadeMediaKmh: e.velocidade_media_kmh,
    tempoParadaMin: e.tempo_parada_min,
    fatorRota: e.fator_rota,
    considerarRetorno: e.considerar_retorno,
  };
}

/** Ponto de extensão: trocar por provedor de matriz real (Mapbox/Google/OSRM). */
export function getDistanceProvider(p: ParametrosRota): DistanceProvider {
  return new EstimatedDistanceProvider(p);
}

/** Ponto de extensão: trocar por VROOM / Google Route Optimization / Mapbox Optimization. */
export function getOptimizer(): RouteOptimizer {
  return new LocalRouteOptimizer(getDistanceProvider);
}
