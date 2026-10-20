import { statusEfetivo } from '@/services/domain/financeiro';
import type {
  Cliente,
  Entrega,
  EntregaView,
  Motorista,
  Parcela,
  ParcelaView,
  Pedido,
  Rota,
  RotaEntrega,
  RotaView,
} from '@/types';
import { store } from '../data';

const indexar = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

export interface BaseEntregas {
  entregas: Entrega[];
  clientes: Cliente[];
  pedidos: Pedido[];
  rotas: Rota[];
  rotaEntregas: RotaEntrega[];
  motoristas: Motorista[];
}

export async function carregarBaseEntregas(): Promise<BaseEntregas> {
  const [entregas, clientes, pedidos, rotas, rotaEntregas, motoristas] = await Promise.all([
    store.list('entregas'),
    store.list('clientes'),
    store.list('pedidos'),
    store.list('rotas'),
    store.list('rota_entregas'),
    store.list('motoristas'),
  ]);
  return { entregas, clientes, pedidos, rotas, rotaEntregas, motoristas };
}

export function montarEntregas(base: BaseEntregas): EntregaView[] {
  const clientes = indexar(base.clientes);
  const pedidos = indexar(base.pedidos);
  const rotas = indexar(base.rotas);
  const motoristas = indexar(base.motoristas);
  const porEntrega = new Map(base.rotaEntregas.map((re) => [re.entrega_id, re]));
  return base.entregas.map((e) => {
    const re = porEntrega.get(e.id);
    const rota = re ? (rotas.get(re.rota_id) ?? null) : null;
    return {
      ...e,
      cliente: clientes.get(e.cliente_id) ?? null,
      pedido: pedidos.get(e.pedido_id) ?? null,
      rota,
      motorista: rota ? (motoristas.get(rota.motorista_id) ?? null) : null,
      ordem: re?.ordem ?? null,
      trecho_km: re?.distancia_km ?? null,
    };
  });
}

export function montarRotas(base: BaseEntregas, entregasView = montarEntregas(base)): RotaView[] {
  const motoristas = indexar(base.motoristas);
  return base.rotas.map((r) => ({
    ...r,
    motorista: motoristas.get(r.motorista_id) ?? null,
    paradas: entregasView.filter((e) => e.rota?.id === r.id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
  }));
}

export function montarParcelas(parcelas: Parcela[], pedidos: Pedido[], clientes: Cliente[]): ParcelaView[] {
  const ped = indexar(pedidos);
  const cli = indexar(clientes);
  return parcelas.map((p) => {
    const pedido = ped.get(p.pedido_id) ?? null;
    return {
      ...p,
      status_efetivo: statusEfetivo(p),
      pedido,
      cliente: pedido ? (cli.get(pedido.cliente_id) ?? null) : null,
    };
  });
}
