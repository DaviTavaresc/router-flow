import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('pt-BR');

export const formatBRL = (v: number | null | undefined) => brl.format(v ?? 0);
export const formatInt = (v: number) => int.format(v);
export const formatKm = (km: number | null | undefined) => `${num1.format(km ?? 0)} km`;

/** 92 → "1h32" ; 45 → "45 min" */
export function formatDuracao(min: number | null | undefined): string {
  const m = Math.round(min ?? 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h${String(r).padStart(2, '0')}`;
}

/** YYYY-MM-DD → dd/MM/yyyy */
export function formatData(d: string | null | undefined): string {
  if (!d) return '—';
  return format(parseISO(d), 'dd/MM/yyyy');
}

export function formatDataHora(d: string | null | undefined): string {
  if (!d) return '—';
  return format(parseISO(d), 'dd/MM/yyyy HH:mm');
}

export function formatHora(d: string | null | undefined): string {
  if (!d) return '—';
  return format(parseISO(d), 'HH:mm');
}

export function formatDataExtenso(d: string): string {
  return format(parseISO(d), "EEEE, d 'de' MMMM", { locale: ptBR });
}

export function formatDiaSemanaCurto(d: string): string {
  return format(parseISO(d), 'EEE dd/MM', { locale: ptBR });
}

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** Máscara de telefone brasileiro: (92) 99999-9999 / (92) 3333-4444 */
export function maskTelefone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isTelefoneValido(value: string): boolean {
  const d = onlyDigits(value);
  return d.length === 10 || d.length === 11;
}

export function maskCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function isCPFValido(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function maskPlaca(value: string): string {
  const v = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  return v.length > 3 ? `${v.slice(0, 3)}-${v.slice(3)}` : v;
}

/** Converte texto digitado ("1.234,56" ou "1234.56") em número */
export function parseMoeda(value: string): number {
  if (!value) return 0;
  const clean = value.replace(/[^\d,.-]/g, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Arredonda para centavos evitando erros de ponto flutuante */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** Normaliza texto para comparação (minúsculas, sem acentos) */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
