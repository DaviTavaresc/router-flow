import type { DistanceProvider, LatLng, ParametrosRota, Trecho } from './types';

const R_TERRA_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (g: number) => (g * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TERRA_KM * Math.asin(Math.sqrt(h));
}

/**
 * Estimativa: distância em linha reta × fator de correção viária, a uma
 * velocidade média configurável. NÃO representa distância real de ruas —
 * substitua por um provedor de matriz de distâncias quando disponível.
 */
export class EstimatedDistanceProvider implements DistanceProvider {
  readonly nome = 'estimativa-haversine';
  readonly estimado = true;
  constructor(private readonly params: Pick<ParametrosRota, 'fatorRota' | 'velocidadeMediaKmh'>) {}

  trecho(a: LatLng, b: LatLng): Trecho {
    const distanciaKm = haversineKm(a, b) * this.params.fatorRota;
    const tempoMin = (distanciaKm / Math.max(this.params.velocidadeMediaKmh, 1)) * 60;
    return { distanciaKm, tempoMin };
  }
}
