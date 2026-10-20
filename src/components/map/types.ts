import type { LatLng } from '@/services/geo';

/** Modelo de dados do mapa — independente do provedor (Leaflet, Mapbox GL, Google Maps). */
export interface MapStop extends LatLng {
  id: string;
  ordem?: number | null;
  titulo: string;
  subtitulo?: string;
  concluida?: boolean;
  falhou?: boolean;
}

export interface MapRoute {
  id: string;
  nome: string;
  cor: string;
  paradas: MapStop[];
}

export interface RouteMapProps {
  partida?: (LatLng & { titulo?: string }) | null;
  rotas?: MapRoute[];
  /** Pontos sem rota (ex.: entregas ainda não roteirizadas, clientes) */
  avulsos?: MapStop[];
  className?: string;
  /** Destaca uma rota (as demais ficam esmaecidas) */
  destaque?: string | null;
  onStopClick?: (id: string) => void;
  legenda?: boolean;
}
