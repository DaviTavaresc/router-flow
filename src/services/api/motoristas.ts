import { onlyDigits, round2 } from '@/lib/format';
import type { ID, Motorista, MotoristaStatus, Veiculo } from '@/types';
import { AppError, store } from '../data';
import { carregarBaseEntregas, montarEntregas, montarRotas } from './views';

export interface MotoristaLista extends Motorista {
  veiculo: Veiculo | null;
}

export async function listarMotoristas(): Promise<MotoristaLista[]> {
  const [motoristas, veiculos] = await Promise.all([store.list('motoristas'), store.list('veiculos')]);
  const v = new Map(veiculos.map((x) => [x.id, x]));
  return motoristas
    .map((m) => ({ ...m, veiculo: m.veiculo_id ? (v.get(m.veiculo_id) ?? null) : null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface MotoristaForm {
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  status: MotoristaStatus;
  usuario_id: ID | null;
  veiculo_tipo: string;
  veiculo_modelo: string;
  veiculo_placa: string;
  veiculo_capacidade: number | null;
}

export async function salvarMotorista(id: ID | null, form: MotoristaForm): Promise<Motorista> {
  if (!form.nome.trim()) throw new AppError('Informe o nome do motorista.');
  const todos = await store.list('motoristas');
  if (form.usuario_id && todos.some((m) => m.usuario_id === form.usuario_id && m.id !== id)) {
    throw new AppError('Este usuário já está vinculado a outro motorista.');
  }
  if (todos.some((m) => m.id !== id && onlyDigits(m.cpf) && onlyDigits(m.cpf) === onlyDigits(form.cpf))) {
    throw new AppError('Já existe um motorista com este CPF.');
  }
  const atual = id ? todos.find((m) => m.id === id) : null;
  const temVeiculo = form.veiculo_modelo.trim() || form.veiculo_placa.trim();
  let veiculoId = atual?.veiculo_id ?? null;
  const veiculo = {
    tipo: form.veiculo_tipo.trim(),
    modelo: form.veiculo_modelo.trim(),
    placa: form.veiculo_placa.trim().toUpperCase(),
    capacidade_kg: form.veiculo_capacidade,
  };
  if (temVeiculo) {
    veiculoId = veiculoId ? (await store.update('veiculos', veiculoId, veiculo)).id : (await store.insert('veiculos', veiculo)).id;
  }
  const dados = {
    nome: form.nome.trim(),
    telefone: form.telefone,
    email: form.email.trim().toLowerCase(),
    cpf: form.cpf,
    status: form.status,
    usuario_id: form.usuario_id,
    veiculo_id: veiculoId,
  };
  return id ? store.update('motoristas', id, dados) : store.insert('motoristas', dados);
}

export async function excluirMotorista(id: ID) {
  const m = await store.get('motoristas', id);
  await store.remove('motoristas', id);
  if (m?.veiculo_id) await store.remove('veiculos', m.veiculo_id).catch(() => undefined);
}

export async function detalheMotorista(id: ID) {
  const [base, veiculos] = await Promise.all([carregarBaseEntregas(), store.list('veiculos')]);
  const motorista = base.motoristas.find((m) => m.id === id);
  if (!motorista) throw new AppError('Motorista não encontrado.');
  const entregasView = montarEntregas(base);
  const rotas = montarRotas(base, entregasView)
    .filter((r) => r.motorista_id === id)
    .sort((a, b) => b.data.localeCompare(a.data));
  const entregas = entregasView.filter((e) => e.motorista?.id === id);
  const concluidas = entregas.filter((e) => e.status === 'entregue').length;
  const pendentes = entregas.filter((e) => e.status === 'pendente' || e.status === 'em_rota' || e.status === 'reagendada').length;
  const naoEntregues = entregas.filter((e) => e.status === 'nao_entregue').length;
  const distanciaPercorrida = round2(rotas.filter((r) => r.status === 'concluida').reduce((s, r) => s + r.distancia_km, 0));
  return {
    motorista,
    veiculo: veiculos.find((v) => v.id === motorista.veiculo_id) ?? null,
    rotas,
    stats: { total: entregas.length, concluidas, pendentes, naoEntregues, distanciaPercorrida },
  };
}
