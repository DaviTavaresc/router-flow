import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { House, ListOrdered, PackageCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageSkeleton } from '@/components/ui';
import { LogoMark } from './Logo';
import { ThemeToggle, UserMenu } from './UserMenu';

const ITENS = [
  { to: '/motorista', label: 'Início', icon: House, end: true },
  { to: '/motorista/rota', label: 'Minha rota', icon: ListOrdered },
  { to: '/motorista/entregas', label: 'Entregas', icon: PackageCheck },
];

/** Layout mobile-first do motorista: cabeçalho compacto + navegação inferior com alvos grandes. */
export function MotoristaLayout() {
  return (
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <LogoMark className="h-7 w-7" />
          <span className="font-semibold tracking-tight">RouteFlow</span>
          <nav className="ml-6 hidden gap-1 md:flex">
            {ITENS.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium',
                    isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                  )
                }
              >
                {i.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-3">
          {ITENS.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400',
                )
              }
            >
              <i.icon className="h-5 w-5" />
              {i.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
