import { toISODate } from '@/lib/dates';
import type { EntregaView, FormaPagamento, ID, ISODate, MotivoOcorrencia, RotaView } from '@/types';
import { store } from '../data';
import { carregarBaseEntregas, montarEntregas, montarRotas } from './views';

export async function listarEntregas(): Promise<EntregaView[]> {
  const base = await carregarBaseEntregas();
  return montarEntregas(base).sort(
    (a, b) => a.data.localeCompare(b.data) || (a.rota?.nome ?? '~').localeCompare(b.rota?.nome ?? '~') || (a.ordem ?? 99) - (b.ordem ?? 99),
  );
}

export async function listarRotas(data?: ISODate): Promise<RotaView[]> {
  const base = await carregarBaseEntregas();
  return montarRotas(base)
    .filter((r) => !data || r.data === data)
    .sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
}

export async function obterEntrega(id: ID): Promise<EntregaView | null> {
  const base = await carregarBaseEntregas();
  return montarEntregas(base).find((e) => e.id === id) ?? null;
}

export const iniciarRota = (rota_id: ID) => store.rpc('iniciar_rota', { rota_id });

export const confirmarEntrega = (args: {
  entrega_id: ID;
  horario: string;
  observacao: string;
  valor_recebido: number;
  forma: FormaPagamento | null;
}) => store.rpc('confirmar_entrega', { ...args, data: toISODate(new Date(args.horario)) });

export const registrarFalhaEntrega = (args: {
  entrega_id: ID;
  motivo: MotivoOcorrencia;
  observacao: string;
  reagendar_para: ISODate | null;
}) => store.rpc('registrar_falha_entrega', args);

export const reagendarEntrega = (entrega_id: ID, data: ISODate) => store.rpc('reagendar_entrega', { entrega_id, data });
