import { buscarBairro, buscarCidade } from './gazetteer';
import type { EnderecoAproximado, GeocodeResult, Geocoder } from './types';

/** Usa o gazetteer local (offline). Sempre retorna precisão aproximada. */
export class LocalGeocoder implements Geocoder {
  readonly nome = 'local';
  async geocode({ bairro, cidade, estado }: EnderecoAproximado): Promise<GeocodeResult | null> {
    const b = buscarBairro(bairro, cidade, estado);
    if (b) return { ...b, precisao: 'bairro', fonte: 'local:bairro' };
    const c = buscarCidade(cidade, estado);
    if (c) return { ...c, precisao: 'cidade', fonte: 'local:cidade' };
    return null;
  }
}

/**
 * Geocodificação via Nominatim (OpenStreetMap). Respeite a política de uso
 * (1 req/s, identificação). Para volume, use instância própria ou provedor pago.
 */
export class NominatimGeocoder implements Geocoder {
  readonly nome = 'nominatim';
  async geocode({ bairro, cidade, estado }: EnderecoAproximado): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({
      format: 'json',
      limit: '1',
      countrycodes: 'br',
      q: `${bairro}, ${cidade}, ${estado}, Brasil`,
    });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'Accept-Language': 'pt-BR' },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { lat: string; lon: string }[];
      if (!data.length) return null;
      return { lat: Number(data[0].lat), lng: Number(data[0].lon), precisao: 'bairro', fonte: 'nominatim' };
    } catch {
      return null;
    }
  }
}

/** Encadeia provedores: o primeiro que responder vence. */
export class ChainGeocoder implements Geocoder {
  readonly nome: string;
  constructor(private readonly provedores: Geocoder[]) {
    this.nome = provedores.map((p) => p.nome).join('+');
  }
  async geocode(endereco: EnderecoAproximado): Promise<GeocodeResult | null> {
    let melhor: GeocodeResult | null = null;
    for (const p of this.provedores) {
      const r = await p.geocode(endereco);
      if (r && r.precisao !== 'cidade') return r;
      if (r && !melhor) melhor = r;
    }
    return melhor;
  }
}

let instancia: Geocoder | null = null;

/**
 * Fábrica do geocodificador configurado em VITE_GEOCODER.
 * Pontos de extensão: adicionar MapboxGeocoder / GoogleGeocoder aqui.
 */
export function getGeocoder(): Geocoder {
  if (instancia) return instancia;
  const tipo = import.meta.env?.VITE_GEOCODER ?? 'local';
  instancia =
    tipo === 'nominatim'
      ? new ChainGeocoder([new LocalGeocoder(), new NominatimGeocoder()])
      : new LocalGeocoder();
  return instancia;
}
