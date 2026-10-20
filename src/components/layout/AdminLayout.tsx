import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  FlaskConical,
  LayoutDashboard,
  Menu,
  PackageCheck,
  Route,
  Settings,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { podeAcessar, type Modulo } from '@/app/permissions';
import { useSessao } from '@/app/session';
import { cn } from '@/lib/cn';
import { formatDataExtenso } from '@/lib/format';
import { hojeISO } from '@/lib/dates';
import { MODO_DEMO } from '@/services/data';
import { PageSkeleton } from '@/components/ui';
import { Logo } from './Logo';
import { ThemeToggle, UserMenu } from './UserMenu';

const NAV: { to: string; label: string; icon: typeof Users; modulo: Modulo; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, modulo: 'dashboard', end: true },
  { to: '/clientes', label: 'Clientes', icon: Users, modulo: 'clientes' },
  { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart, modulo: 'pedidos' },
  { to: '/motoristas', label: 'Motoristas', icon: Truck, modulo: 'motoristas' },
  { to: '/rotas', label: 'Rotas', icon: Route, modulo: 'rotas' },
  { to: '/entregas', label: 'Entregas', icon: PackageCheck, modulo: 'entregas' },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, modulo: 'financeiro' },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3, modulo: 'relatorios' },
];
const NAV_ADMIN: typeof NAV = [
  { to: '/configuracoes', label: 'Configurações', icon: Settings, modulo: 'configuracoes' },
  { to: '/usuarios', label: 'Usuários', icon: UserCog, modulo: 'usuarios' },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { usuario } = useSessao();
  const item = (n: (typeof NAV)[number]) =>
    podeAcessar(usuario.perfil, n.modulo) && (
      <NavLink
        key={n.to}
        to={n.to}
        end={n.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white',
          )
        }
      >
        <n.icon className="h-[18px] w-[18px] shrink-0" />
        {n.label}
      </NavLink>
    );
  const admin = NAV_ADMIN.filter((n) => podeAcessar(usuario.perfil, n.modulo));
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map(item)}
      {admin.length > 0 && (
        <>
          <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Administração</p>
          {admin.map(item)}
        </>
      )}
    </nav>
  );
}

function SidebarFooter() {
  const { empresa } = useSessao();
  return (
    <div className="m-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className="truncate text-xs font-medium text-slate-900 dark:text-white">{empresa.nome}</p>
      <p className="truncate text-[11px] text-slate-500">
        {empresa.cidade} - {empresa.estado}
      </p>
    </div>
  );
}

export function AdminLayout() {
  const [menuAberto, setMenuAberto] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuAberto(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      {/* Sidebar fixa (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <div className="scroll-thin flex flex-1 flex-col overflow-y-auto py-3">
          <NavItems />
        </div>
        <SidebarFooter />
      </aside>

      {/* Menu lateral (mobile/tablet) */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-950/50" onClick={() => setMenuAberto(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] animate-slide-in-left flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex h-16 items-center justify-between px-5">
              <Logo />
              <button onClick={() => setMenuAberto(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="scroll-thin flex flex-1 flex-col overflow-y-auto py-3">
              <NavItems onNavigate={() => setMenuAberto(false)} />
            </div>
            <SidebarFooter />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-950/80">
          <button
            onClick={() => setMenuAberto(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="hidden text-sm capitalize text-slate-500 sm:block dark:text-slate-400">{formatDataExtenso(hojeISO())}</p>
          <div className="flex-1" />
          {MODO_DEMO && (
            <span className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 sm:inline-flex dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
              <FlaskConical className="h-3.5 w-3.5" /> Dados neste navegador
            </span>
          )}
          <ThemeToggle />
          <UserMenu />
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
