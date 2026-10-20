import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/app/session';
import { useTheme } from '@/app/theme';
import { Avatar } from '@/components/ui';
import { PERFIL } from '@/lib/labels';

export function ThemeToggle() {
  const { tema, alternar } = useTheme();
  return (
    <button
      onClick={alternar}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
      aria-label={tema === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={tema === 'dark' ? 'Modo claro' : 'Modo escuro'}
    >
      {tema === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function UserMenu() {
  const { sessao, sair } = useSession();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!sessao) return null;
  const { usuario, empresa } = sessao;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        <Avatar nome={usuario.nome} className="h-8 w-8" />
        <div className="hidden text-left leading-tight md:block">
          <p className="text-sm font-medium text-slate-900 dark:text-white">{usuario.nome}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{PERFIL[usuario.perfil]}</p>
        </div>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
      </button>
      {aberto && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 animate-fade-in rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{usuario.nome}</p>
            <p className="truncate text-xs text-slate-500">{usuario.email}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{empresa.nome}</p>
          </div>
          <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
          <button
            role="menuitem"
            onClick={async () => {
              await sair();
              navigate('/login', { replace: true });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}
