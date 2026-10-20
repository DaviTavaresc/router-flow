import type { Empresa, ID, Perfil, Usuario } from '@/types';
import { auth, type NovoUsuario } from '../auth';
import { AppError, localStore, store } from '../data';
import { getGeocoder } from '../geo';

export const obterEmpresa = (id: ID) => store.get('empresas', id);

export type EmpresaForm = Omit<Empresa, 'id' | 'created_at' | 'updated_at'>;

export async function salvarEmpresa(id: ID, form: EmpresaForm) {
  if (!form.nome.trim()) throw new AppError('Informe o nome da empresa.');
  if (form.velocidade_media_kmh <= 0) throw new AppError('A velocidade média deve ser maior que zero.');
  if (form.fator_rota < 1) throw new AppError('O fator de rota deve ser maior ou igual a 1.');
  return store.update('empresas', id, form);
}

/** Localiza o ponto de partida a partir de bairro/cidade/estado (aproximado). */
export async function localizarPartida(bairro: string, cidade: string, estado: string) {
  const r = await getGeocoder().geocode({ bairro, cidade, estado });
  if (!r) throw new AppError('Não foi possível localizar este endereço. Verifique bairro, cidade e estado.');
  return r;
}

export async function listarUsuarios(): Promise<Usuario[]> {
  return (await store.list('usuarios')).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function criarUsuario(dados: NovoUsuario) {
  if (!dados.nome.trim() || !dados.email.trim()) throw new AppError('Preencha nome e e-mail.');
  if (dados.senha.length < 6) throw new AppError('A senha deve ter ao menos 6 caracteres.');
  return auth.criarUsuario(dados);
}

export const atualizarUsuario = (id: ID, patch: { nome?: string; perfil?: Perfil; ativo?: boolean }) =>
  store.update('usuarios', id, patch);

/** Modo local: apaga todos os dados e volta à configuração inicial */
export async function apagarTodosDados() {
  await auth.sair();
  localStore?.apagarTudo();
}
