import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { MotoristaLayout } from '@/components/layout/MotoristaLayout';
import { SessionProvider } from '@/app/session';
import { PublicOnly, RequireAuth, RequireModulo, TelaCarregando } from '@/app/guards';
import type { Modulo } from '@/app/permissions';

const Login = lazy(() => import('@/pages/auth/Login'));
const RecuperarSenha = lazy(() => import('@/pages/auth/RecuperarSenha'));
const RedefinirSenha = lazy(() => import('@/pages/auth/RedefinirSenha'));
const PrimeiroAcesso = lazy(() => import('@/pages/auth/PrimeiroAcesso'));
const Dashboard = lazy(() => import('@/pages/dashboard/Dashboard'));
const Clientes = lazy(() => import('@/pages/clientes/Clientes'));
const ClienteDetalhe = lazy(() => import('@/pages/clientes/ClienteDetalhe'));
const Pedidos = lazy(() => import('@/pages/pedidos/Pedidos'));
const PedidoForm = lazy(() => import('@/pages/pedidos/PedidoForm'));
const PedidoDetalhe = lazy(() => import('@/pages/pedidos/PedidoDetalhe'));
const Motoristas = lazy(() => import('@/pages/motoristas/Motoristas'));
const MotoristaDetalhe = lazy(() => import('@/pages/motoristas/MotoristaDetalhe'));
const Rotas = lazy(() => import('@/pages/rotas/Rotas'));
const Entregas = lazy(() => import('@/pages/entregas/Entregas'));
const Financeiro = lazy(() => import('@/pages/financeiro/Financeiro'));
const Relatorios = lazy(() => import('@/pages/relatorios/Relatorios'));
const Configuracoes = lazy(() => import('@/pages/configuracoes/Configuracoes'));
const Usuarios = lazy(() => import('@/pages/configuracoes/Usuarios'));
const MotoristaHome = lazy(() => import('@/pages/motorista/MotoristaHome'));
const MinhaRota = lazy(() => import('@/pages/motorista/MinhaRota'));
const MinhasEntregas = lazy(() => import('@/pages/motorista/MinhasEntregas'));
const EntregaMotorista = lazy(() => import('@/pages/motorista/EntregaMotorista'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

const m = (modulo: Modulo, el: ReactNode) => <RequireModulo modulo={modulo}>{el}</RequireModulo>;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <SessionProvider>
            <BrowserRouter>
              <Suspense fallback={<TelaCarregando />}>
                <Routes>
                  <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
                  <Route path="/recuperar-senha" element={<PublicOnly><RecuperarSenha /></PublicOnly>} />
                  <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                  <Route path="/primeiro-acesso" element={<PublicOnly><PrimeiroAcesso /></PublicOnly>} />

                  <Route element={<RequireAuth perfis={['admin', 'vendedor']}><AdminLayout /></RequireAuth>}>
                    <Route index element={m('dashboard', <Dashboard />)} />
                    <Route path="clientes" element={m('clientes', <Clientes />)} />
                    <Route path="clientes/:id" element={m('clientes', <ClienteDetalhe />)} />
                    <Route path="pedidos" element={m('pedidos', <Pedidos />)} />
                    <Route path="pedidos/novo" element={m('pedidos', <PedidoForm />)} />
                    <Route path="pedidos/:id" element={m('pedidos', <PedidoDetalhe />)} />
                    <Route path="pedidos/:id/editar" element={m('pedidos', <PedidoForm />)} />
                    <Route path="motoristas" element={m('motoristas', <Motoristas />)} />
                    <Route path="motoristas/:id" element={m('motoristas', <MotoristaDetalhe />)} />
                    <Route path="rotas" element={m('rotas', <Rotas />)} />
                    <Route path="entregas" element={m('entregas', <Entregas />)} />
                    <Route path="financeiro" element={m('financeiro', <Financeiro />)} />
                    <Route path="relatorios" element={m('relatorios', <Relatorios />)} />
                    <Route path="configuracoes" element={m('configuracoes', <Configuracoes />)} />
                    <Route path="usuarios" element={m('usuarios', <Usuarios />)} />
                  </Route>

                  <Route path="/motorista" element={<RequireAuth perfis={['motorista']}><MotoristaLayout /></RequireAuth>}>
                    <Route index element={<MotoristaHome />} />
                    <Route path="rota" element={<MinhaRota />} />
                    <Route path="entregas" element={<MinhasEntregas />} />
                    <Route path="entregas/:id" element={<EntregaMotorista />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </SessionProvider>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
