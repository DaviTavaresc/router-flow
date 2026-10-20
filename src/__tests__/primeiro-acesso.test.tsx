// @vitest-environment jsdom
/**
 * Sistema vazio: o login leva à configuração inicial, que cria a empresa e o
 * administrador; depois o admin cria um usuário e um cliente do zero.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
window.scrollTo = (() => {}) as never;

const { default: App } = await import('@/App');
const { auth } = await import('@/services/auth');
const { store, localStore } = await import('@/services/data');
const clientes = await import('@/services/api/clientes');
const empresa = await import('@/services/api/empresa');

const T = { timeout: 10_000 };

describe('primeiro acesso', () => {
  it('inicia sem nenhum usuário nem cliente', async () => {
    expect(localStore!.vazio).toBe(true);
    expect(await auth.precisaConfiguracaoInicial()).toBe(true);
    await expect(auth.entrar('admin@demo.routeflow', 'demo123')).rejects.toThrow(/incorretos/);
  });

  it('login redireciona para a configuração inicial e cria empresa + admin', async () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    await screen.findByText('Configuração inicial', undefined, T);
    const preencher = (label: RegExp, valor: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: valor } });
    preencher(/Nome da empresa/, 'Minha Distribuidora');
    preencher(/^Cidade/, 'Manaus');
    preencher(/^UF/, 'AM');
    preencher(/Bairro de saída/, 'Centro');
    preencher(/Seu nome/, 'Fulano de Tal');
    preencher(/^E-mail/, 'dono@empresa.com');
    preencher(/^Senha/, 'segredo1');
    preencher(/Confirmar senha/, 'segredo1');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Criar empresa e entrar/ }));
    });
    expect(await screen.findByText('Primeiros passos', undefined, T)).toBeTruthy();
    expect(await auth.precisaConfiguracaoInicial()).toBe(false);
  }, 20_000);

  it('admin cria usuário e cliente do zero; o novo usuário consegue entrar', async () => {
    await empresa.criarUsuario({ nome: 'Vendedora Nova', email: 'vendas@empresa.com', perfil: 'vendedor', senha: 'abc123' });
    const c = await clientes.salvarCliente(null, { nome: 'Primeiro Cliente', telefone: '(92) 99999-0000', bairro: 'Adrianópolis', cidade: 'Manaus', estado: 'AM' });
    expect(c.geo_precisao).toBe('bairro');
    expect((await store.list('clientes')).map((x) => x.nome)).toEqual(['Primeiro Cliente']);
    await auth.sair();
    await expect(auth.entrar('vendas@empresa.com', 'errada')).rejects.toThrow(/incorretos/);
    const s = await auth.entrar('vendas@empresa.com', 'abc123');
    expect(s.usuario.perfil).toBe('vendedor');
    expect(s.empresa.nome).toBe('Minha Distribuidora');
  });

  it('apagar todos os dados volta ao primeiro acesso', async () => {
    await auth.sair();
    await auth.entrar('dono@empresa.com', 'segredo1');
    await empresa.apagarTodosDados();
    expect(await auth.precisaConfiguracaoInicial()).toBe(true);
    await expect(auth.entrar('dono@empresa.com', 'segredo1')).rejects.toThrow(/incorretos/);
  });
});
