import { round2 } from '@/lib/format';
import { statusEfetivo } from '@/services/domain/financeiro';
import { getGeocoder } from '@/services/geo/geocoder';
import type { Cliente, ID } from '@/types';
import { AppError, store } from '../data';
import { carregarBaseEntregas, montarEntregas } from './views';

export interface ClienteForm {
  nome: string;
  telefone: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export async function listarClientes(): Promise<Cliente[]> {
  const rows = await store.list('clientes');
  return rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Salva o cliente. A geolocalização é um dado técnico: é (re)calculada
 * automaticamente quando bairro/cidade/estado mudam — nunca digitada pelo usuário.
 */
export async function salvarCliente(id: ID | null, form: ClienteForm): Promise<Cliente> {
  const dados = {
    nome: form.nome.trim(),
    telefone: form.telefone.trim(),
    bairro: form.bairro.trim(),
    cidade: form.cidade.trim(),
    estado: form.estado.trim().toUpperCase(),
  };
  if (!dados.nome || !dados.bairro || !dados.cidade || !dados.estado) throw new AppError('Preencha todos os campos obrigatórios.');

  const atual = id ? await store.get('clientes', id) : null;
  const localMudou =
    !atual || atual.bairro !== dados.bairro || atual.cidade !== dados.cidade || atual.estado !== dados.estado || atual.geo_precisao === 'pendente';

  let geo: Pick<Cliente, 'latitude' | 'longitude' | 'geo_precisao' | 'geo_fonte'> | null = null;
  if (localMudou) {
    const r = await getGeocoder().geocode(dados);
    geo = r
      ? { latitude: r.lat, longitude: r.lng, geo_precisao: r.precisao, geo_fonte: r.fonte }
      : { latitude: null, longitude: null, geo_precisao: 'pendente', geo_fonte: null };
  }

  if (id) return store.update('clientes', id, { ...dados, ...(geo ?? {}) });
  return store.insert('clientes', { ...dados, ...geo! });
}

export async function excluirCliente(id: ID) {
  await store.remove('clientes', id);
}

export async function detalheCliente(id: ID) {
  const [cliente, base, parcelas] = await Promise.all([store.get('clientes', id), carregarBaseEntregas(), store.list('parcelas')]);
  if (!cliente) throw new AppError('Cliente não encontrado.');
  const pedidos = base.pedidos.filter((p) => p.cliente_id === id).sort((a, b) => b.numero - a.numero);
  const idsPedidos = new Set(pedidos.map((p) => p.id));
  const entregas = montarEntregas(base)
    .filter((e) => e.cliente_id === id)
    .sort((a, b) => b.data.localeCompare(a.data));
  const parcelasCli = parcelas.filter((p) => idsPedidos.has(p.pedido_id));
  const totalComprado = round2(pedidos.filter((p) => p.status !== 'cancelado').reduce((s, p) => s + p.total, 0));
  const emAberto = round2(
    parcelasCli.filter((p) => p.status === 'pendente').reduce((s, p) => s + p.valor - p.valor_pago, 0),
  );
  const vencido = round2(
    parcelasCli.filter((p) => statusEfetivo(p) === 'vencido').reduce((s, p) => s + p.valor - p.valor_pago, 0),
  );
  return { cliente, pedidos, entregas, totalComprado, emAberto, vencido };
}
