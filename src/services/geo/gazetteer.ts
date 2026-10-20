/**
 * Gazetteer local de centróides APROXIMADOS.
 *
 * Serve apenas como fallback offline e para o modo demonstração: bairro/cidade/estado
 * não identificam um endereço exato, então toda coordenada vinda daqui é marcada como
 * "aproximada". Em produção, configure um geocodificador real (VITE_GEOCODER).
 */
import { normalizar } from '@/lib/format';
import type { LatLng } from './types';

/** Centróides aproximados de bairros, indexados por "cidade|uf" */
const BAIRROS: Record<string, Record<string, LatLng>> = {
  'manaus|am': {
    centro: { lat: -3.1316, lng: -60.0233 },
    adrianopolis: { lat: -3.101, lng: -60.012 },
    'nossa senhora das gracas': { lat: -3.106, lng: -60.023 },
    aleixo: { lat: -3.088, lng: -59.996 },
    'parque 10 de novembro': { lat: -3.079, lng: -60.011 },
    'parque dez de novembro': { lat: -3.079, lng: -60.011 },
    flores: { lat: -3.06, lng: -60.017 },
    chapada: { lat: -3.097, lng: -60.029 },
    'dom pedro': { lat: -3.088, lng: -60.044 },
    'ponta negra': { lat: -3.064, lng: -60.098 },
    compensa: { lat: -3.106, lng: -60.059 },
    'cidade nova': { lat: -3.028, lng: -59.99 },
    japiim: { lat: -3.115, lng: -59.98 },
    petropolis: { lat: -3.112, lng: -59.995 },
    'sao jose operario': { lat: -3.077, lng: -59.94 },
    cachoeirinha: { lat: -3.121, lng: -60.008 },
    educandos: { lat: -3.139, lng: -60.013 },
    planalto: { lat: -3.066, lng: -60.042 },
    alvorada: { lat: -3.079, lng: -60.035 },
    coroado: { lat: -3.09, lng: -59.976 },
    taruma: { lat: -3.01, lng: -60.05 },
    'sao jorge': { lat: -3.11, lng: -60.041 },
    'santo antonio': { lat: -3.118, lng: -60.05 },
    'distrito industrial': { lat: -3.127, lng: -59.96 },
    'novo aleixo': { lat: -3.046, lng: -59.962 },
    'jorge teixeira': { lat: -3.056, lng: -59.933 },
  },
};

/** Centróides aproximados das capitais, por UF */
const CAPITAIS: Record<string, { cidade: string } & LatLng> = {
  AC: { cidade: 'Rio Branco', lat: -9.9747, lng: -67.81 },
  AL: { cidade: 'Maceió', lat: -9.6658, lng: -35.7353 },
  AP: { cidade: 'Macapá', lat: 0.0349, lng: -51.0694 },
  AM: { cidade: 'Manaus', lat: -3.119, lng: -60.0217 },
  BA: { cidade: 'Salvador', lat: -12.9714, lng: -38.5014 },
  CE: { cidade: 'Fortaleza', lat: -3.7319, lng: -38.5267 },
  DF: { cidade: 'Brasília', lat: -15.7939, lng: -47.8828 },
  ES: { cidade: 'Vitória', lat: -20.3155, lng: -40.3128 },
  GO: { cidade: 'Goiânia', lat: -16.6869, lng: -49.2648 },
  MA: { cidade: 'São Luís', lat: -2.5307, lng: -44.3068 },
  MT: { cidade: 'Cuiabá', lat: -15.6014, lng: -56.0979 },
  MS: { cidade: 'Campo Grande', lat: -20.4697, lng: -54.6201 },
  MG: { cidade: 'Belo Horizonte', lat: -19.9167, lng: -43.9345 },
  PA: { cidade: 'Belém', lat: -1.4558, lng: -48.4902 },
  PB: { cidade: 'João Pessoa', lat: -7.1195, lng: -34.845 },
  PR: { cidade: 'Curitiba', lat: -25.4284, lng: -49.2733 },
  PE: { cidade: 'Recife', lat: -8.0476, lng: -34.877 },
  PI: { cidade: 'Teresina', lat: -5.092, lng: -42.8038 },
  RJ: { cidade: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729 },
  RN: { cidade: 'Natal', lat: -5.7945, lng: -35.211 },
  RS: { cidade: 'Porto Alegre', lat: -30.0346, lng: -51.2177 },
  RO: { cidade: 'Porto Velho', lat: -8.7612, lng: -63.9004 },
  RR: { cidade: 'Boa Vista', lat: 2.8235, lng: -60.6758 },
  SC: { cidade: 'Florianópolis', lat: -27.5954, lng: -48.548 },
  SP: { cidade: 'São Paulo', lat: -23.5505, lng: -46.6333 },
  SE: { cidade: 'Aracaju', lat: -10.9472, lng: -37.0731 },
  TO: { cidade: 'Palmas', lat: -10.2491, lng: -48.3243 },
};

export function buscarBairro(bairro: string, cidade: string, uf: string): LatLng | null {
  const tabela = BAIRROS[`${normalizar(cidade)}|${normalizar(uf)}`];
  return tabela?.[normalizar(bairro)] ?? null;
}

export function buscarCidade(cidade: string, uf: string): LatLng | null {
  const cap = CAPITAIS[uf.toUpperCase()];
  if (cap && normalizar(cap.cidade) === normalizar(cidade)) return { lat: cap.lat, lng: cap.lng };
  return null;
}

/** Bairros conhecidos pelo gazetteer para uma cidade (usado como sugestão no formulário) */
export function bairrosConhecidos(cidade: string, uf: string): string[] {
  const tabela = BAIRROS[`${normalizar(cidade)}|${normalizar(uf)}`];
  return tabela ? Object.keys(tabela) : [];
}
