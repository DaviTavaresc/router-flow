import type { EntregaView, RotaView } from '@/types';
import type { MapRoute, MapStop } from './types';

export function entregaParaStop(e: EntregaView, ordem?: number | null): MapStop | null {
  if (e.cliente?.latitude == null || e.cliente?.longitude == null) return null;
  return {
    id: e.id,
    lat: e.cliente.latitude,
    lng: e.cliente.longitude,
    ordem: ordem ?? e.ordem,
    titulo: e.cliente.nome,
    subtitulo: `${e.cliente.bairro} · Pedido #${e.pedido?.numero ?? '—'}`,
    concluida: e.status === 'entregue',
    falhou: e.status === 'nao_entregue',
  };
}

export function rotaParaMapa(r: RotaView): MapRoute {
  return {
    id: r.id,
    nome: r.motorista?.nome ?? r.nome,
    cor: r.cor,
    paradas: r.paradas.map((p) => entregaParaStop(p)).filter((x): x is MapStop => !!x),
  };
}
