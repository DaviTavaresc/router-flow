// @vitest-environment jsdom
/**
 * Smoke test de interface: renderiza todas as telas com os dados de demonstração,
 * para cada perfil, e verifica que carregam sem erros de runtime.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// Polyfills que o jsdom não possui
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO);
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
window.scrollTo = (() => {}) as never;

const erros: string[] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => {
  const msg = args.map(String).join(' ');
  // ignora avisos de act() do React em testes assíncronos
  if (!/not wrapped in act|act\(\.\.\.\)/.test(msg)) erros.push(msg);
  originalError(...args);
};

const { default: App } = await import('@/App');
const { auth } = await import('@/services/auth');
const { store, localStore } = await import('@/services/data');
localStore!.carregarDemo();
const { DEMO_SENHA, DEMO_USUARIOS } = await import('@/services/data/seed');

const T = { timeout: 10_000 };

async function visitar(rota: string, texto: string | RegExp) {
  window.history.pushState({}, '', rota);
  render(<App />);
  expect(await screen.findAllByText(texto, undefined, T)).not.toHaveLength(0);
}

afterEach(() => {
  cleanup();
  const encontrados = erros.splice(0);
  expect(encontrados, encontrados.join('\n')).toEqual([]);
});

describe('admin', () => {
  let ids: { cliente: string; pedido: string; motorista: string };
  beforeAll(async () => {
    await auth.entrar(DEMO_USUARIOS.admin.email, DEMO_SENHA);
    const [clientes, pedidos, motoristas] = await Promise.all([store.list('clientes'), store.list('pedidos'), store.list('motoristas')]);
    ids = {
      cliente: clientes.find((c) => c.nome === 'João da Silva')!.id,
      pedido: pedidos.find((p) => p.status === 'pronto')!.id,
      motorista: motoristas[0].id,
    };
  });

  it('dashboard', () => visitar('/', 'Rotas de hoje'), 15_000);
  it('clientes', () => visitar('/clientes', 'João da Silva'), 15_000);
  it('cliente detalhe', () => visitar(`/clientes/${ids.cliente}`, 'Localização aproximada'), 15_000);
  it('pedidos', () => visitar('/pedidos', 'Em aberto'), 15_000);
  it('novo pedido', () => visitar('/pedidos/novo', 'Forma da venda'), 15_000);
  it('pedido detalhe', () => visitar(`/pedidos/${ids.pedido}`, 'Produtos'), 15_000);
  it('editar pedido', () => visitar(`/pedidos/${ids.pedido}/editar`, 'Salvar alterações'), 15_000);
  it('motoristas', () => visitar('/motoristas', 'Carlos Mendes'), 15_000);
  it('motorista detalhe', () => visitar(`/motoristas/${ids.motorista}`, 'Histórico de rotas'), 15_000);
  it('entregas', () => visitar('/entregas', 'Data específica'), 15_000);
  it('financeiro', () => visitar('/financeiro', 'Contas a receber'), 15_000);
  it('relatórios', () => visitar('/relatorios', 'Exportar CSV'), 15_000);
  it('configurações', () => visitar('/configuracoes', 'Dados da empresa'), 15_000);
  it('usuários', () => visitar('/usuarios', 'Marina Costa'), 15_000);

  it('rotas: otimiza as entregas de amanhã', async () => {
    const amanha = new Date(Date.now() + 86_400_000);
    const iso = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;
    await visitar(`/rotas?data=${iso}`, 'Otimização automática');
    const botoes = await screen.findAllByRole('button', { name: /Otimizar rotas/ }, T);
    await act(async () => {
      fireEvent.click(botoes[botoes.length - 1]);
    });
    expect(await screen.findByText('Rotas otimizadas', undefined, T)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Salvar rotas/ }, T)).toBeTruthy();
  }, 20_000);
});

describe('vendedor', () => {
  beforeAll(async () => {
    await auth.sair();
    await auth.entrar(DEMO_USUARIOS.vendedor.email, DEMO_SENHA);
  });
  it('dashboard', () => visitar('/', 'Rotas de hoje'), 15_000);
  it('não acessa o financeiro', () => visitar('/financeiro', 'Acesso restrito'), 15_000);
});

describe('motorista', () => {
  let entregaId = '';
  beforeAll(async () => {
    await auth.sair();
    await auth.entrar(DEMO_USUARIOS.joao.email, DEMO_SENHA);
    entregaId = (await store.list('entregas'))[0].id;
  });
  it('dashboard do motorista', () => visitar('/motorista', 'Sua rota de hoje'), 15_000);
  it('mostra a próxima entrega com ações', async () => {
    await visitar('/motorista', 'Próxima entrega');
    expect(screen.getByRole('button', { name: /Confirmar entrega/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Iniciar navegação/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Não foi possível entregar/ })).toBeTruthy();
  }, 15_000);
  it('minha rota', () => visitar('/motorista/rota', 'Minha rota'), 15_000);
  it('minhas entregas', () => visitar('/motorista/entregas', 'Minhas entregas'), 15_000);
  it('detalhe da entrega', () => visitar(`/motorista/entregas/${entregaId}`, 'Pagamento'), 15_000);
  it('admin redireciona motorista para a área dele', () => visitar('/financeiro', 'Sua rota de hoje'), 15_000);
});

describe('público', () => {
  beforeAll(async () => {
    await auth.sair();
  });
  it('login', () => visitar('/login', 'Esqueceu a senha?'), 15_000);
  it('recuperar senha', () => visitar('/recuperar-senha', 'Recuperar senha'), 15_000);
  it('rota protegida redireciona para o login', () => visitar('/pedidos', 'Esqueceu a senha?'), 15_000);
});
