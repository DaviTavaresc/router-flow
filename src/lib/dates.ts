import { addDays, addMonths, format, parseISO, startOfWeek, endOfWeek } from 'date-fns';

/** Data local de hoje no formato YYYY-MM-DD */
export const hojeISO = () => format(new Date(), 'yyyy-MM-dd');
export const toISODate = (d: Date) => format(d, 'yyyy-MM-dd');
export const somarDias = (iso: string, dias: number) => toISODate(addDays(parseISO(iso), dias));
export const amanhaISO = () => somarDias(hojeISO(), 1);
export const agoraISO = () => new Date().toISOString();

/**
 * Soma um intervalo de vencimento. Intervalos de 30 dias são tratados como
 * "mensal" (mesmo dia do mês seguinte), como é usual no comércio.
 */
export function somarIntervalo(iso: string, intervaloDias: number, vezes: number): string {
  if (intervaloDias === 30) return toISODate(addMonths(parseISO(iso), vezes));
  return somarDias(iso, intervaloDias * vezes);
}

export function semanaAtual(iso = hojeISO()): { inicio: string; fim: string } {
  const d = parseISO(iso);
  return {
    inicio: toISODate(startOfWeek(d, { weekStartsOn: 1 })),
    fim: toISODate(endOfWeek(d, { weekStartsOn: 1 })),
  };
}

export function intervaloDias(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let d = inicio;
  while (d <= fim) {
    out.push(d);
    d = somarDias(d, 1);
  }
  return out;
}

export const entre = (d: string | null | undefined, inicio: string, fim: string) =>
  !!d && d.slice(0, 10) >= inicio && d.slice(0, 10) <= fim;
