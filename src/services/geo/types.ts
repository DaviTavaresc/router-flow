/**
 * Contratos da camada geográfica. Toda integração com APIs reais (Mapbox, Google,
 * OSRM, Nominatim, VROOM...) deve implementar estas interfaces — a UI e os serviços
 * de negócio dependem apenas delas.
 */
import type { GeoPrecisao } from '@/types';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface EnderecoAproximado {
  bairro: string;
  cidade: string;
  estado: string;
}

export interface GeocodeResult extends LatLng {
  precisao: Exclude<GeoPrecisao, 'pendente'>;
  /** Identifica o provedor que gerou a coordenada (ex.: "local:bairro", "nominatim") */
  fonte: string;
}

export interface Geocoder {
  readonly nome: string;
  geocode(endereco: EnderecoAproximado): Promise<GeocodeResult | null>;
}

export interface Trecho {
  distanciaKm: number;
  tempoMin: number;
}

/** Calcula distância/tempo entre pontos. Implementações reais: Mapbox Matrix, Google Distance Matrix, OSRM. */
export interface DistanceProvider {
  readonly nome: string;
  /** Indica se os valores são estimativas (linha reta × fator) ou distâncias viárias reais */
  readonly estimado: boolean;
  trecho(a: LatLng, b: LatLng): Trecho;
}

export interface ParametrosRota {
  velocidadeMediaKmh: number;
  tempoParadaMin: number;
  fatorRota: number;
  considerarRetorno: boolean;
}

export interface OptStop extends LatLng {
  id: string;
  pesoKg?: number;
}

export interface OptVehicle {
  id: string;
  capacidadeKg?: number | null;
}

export interface OptInput {
  partida: LatLng;
  paradas: OptStop[];
  veiculos: OptVehicle[];
  parametros: ParametrosRota;
}

export interface OptRoute {
  veiculoId: string;
  paradas: string[];
  trechos: Trecho[];
  distanciaKm: number;
  tempoMin: number;
  cargaKg: number;
  excedeCapacidade: boolean;
}

export interface OptResult {
  rotas: OptRoute[];
  naoAtribuidas: { id: string; motivo: string }[];
  avisos: string[];
  totalKm: number;
  maiorTempoMin: number;
}

/** Otimizador de rotas. Implementações futuras: VROOM, Google Route Optimization, Mapbox Optimization. */
export interface RouteOptimizer {
  readonly nome: string;
  otimizar(input: OptInput): Promise<OptResult>;
}
