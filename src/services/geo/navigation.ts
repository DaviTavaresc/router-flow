import type { LatLng } from './types';

export type AppNavegacao = 'google' | 'waze';

interface Destino {
  coords: LatLng | null;
  /** Texto usado quando não há coordenada (ex.: "Adrianópolis, Manaus - AM") */
  descricao: string;
}

/** Monta o link de navegação externa (Google Maps / Waze). */
export function urlNavegacao(app: AppNavegacao, destino: Destino): string {
  const { coords, descricao } = destino;
  if (app === 'waze') {
    return coords
      ? `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`
      : `https://waze.com/ul?q=${encodeURIComponent(descricao)}&navigate=yes`;
  }
  const dest = coords ? `${coords.lat},${coords.lng}` : descricao;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

/** Rota completa no Google Maps com paradas intermediárias (limite de 9 waypoints da URL pública). */
export function urlRotaCompleta(origem: LatLng, paradas: LatLng[]): string {
  if (!paradas.length) return '';
  const dest = paradas[paradas.length - 1];
  const meio = paradas.slice(0, -1).slice(0, 9).map((p) => `${p.lat},${p.lng}`).join('|');
  const params = new URLSearchParams({
    api: '1',
    origin: `${origem.lat},${origem.lng}`,
    destination: `${dest.lat},${dest.lng}`,
    travelmode: 'driving',
  });
  if (meio) params.set('waypoints', meio);
  return `https://www.google.com/maps/dir/?${params}`;
}
