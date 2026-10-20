import type { ReactNode } from 'react';
import { MapPinned, Route, Wallet } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/layout/UserMenu';

const DESTAQUES = [
  { icon: Route, titulo: 'Rotas otimizadas', texto: 'Distribua entregas entre vários motoristas por proximidade geográfica.' },
  { icon: MapPinned, titulo: 'Operação em tempo real', texto: 'Acompanhe cada parada, confirmação e ocorrência do dia.' },
  { icon: Wallet, titulo: 'Recebimentos integrados', texto: 'Pagamentos na entrega atualizam o financeiro automaticamente.' },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-center text-xs text-slate-400">© {new Date().getFullYear()} RouteFlow</p>
      </div>
      <div className="relative hidden overflow-hidden bg-brand-700 lg:block">
        <svg className="absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="white" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <path d="M60 620 C 200 520, 260 420, 400 400 S 620 300, 700 140" stroke="#93c5fd" strokeWidth="3" fill="none" strokeDasharray="8 8" />
          <path d="M80 200 C 220 260, 300 330, 420 300 S 600 420, 720 520" stroke="white" strokeWidth="3" fill="none" strokeDasharray="8 8" />
          {[
            [60, 620],
            [400, 400],
            [700, 140],
            [80, 200],
            [420, 300],
            [720, 520],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="9" fill="white" />
          ))}
        </svg>
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">Do pedido à entrega, toda a operação em um só lugar.</h2>
          <div className="mt-10 grid max-w-lg gap-5">
            {DESTAQUES.map((d) => (
              <div key={d.titulo} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                  <d.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium">{d.titulo}</p>
                  <p className="text-sm text-blue-100">{d.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
