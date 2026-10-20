import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastTipo = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tipo: ToastTipo;
  titulo: string;
  descricao?: ReactNode;
}

interface ToastApi {
  success: (titulo: string, descricao?: ReactNode) => void;
  error: (titulo: string, descricao?: ReactNode) => void;
  info: (titulo: string, descricao?: ReactNode) => void;
  /** Exibe o erro com a mensagem amigável quando disponível */
  fromError: (err: unknown, titulo?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let seq = 0;

const icones: Record<ToastTipo, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
  error: <XCircle className="h-5 w-5 text-red-500" />,
  info: <Info className="h-5 w-5 text-brand-500" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ToastItem[]>([]);

  const remover = useCallback((id: number) => setItens((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tipo: ToastTipo, titulo: string, descricao?: ReactNode) => {
      const id = ++seq;
      setItens((l) => [...l.slice(-3), { id, tipo, titulo, descricao }]);
      setTimeout(() => remover(id), tipo === 'error' ? 6000 : 4000);
    },
    [remover],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push('success', t, d),
      error: (t, d) => push('error', t, d),
      info: (t, d) => push('info', t, d),
      fromError: (err, titulo = 'Algo deu errado') =>
        push('error', titulo, err instanceof Error ? err.message : 'Tente novamente em instantes.'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end"
          aria-live="polite"
        >
          {itens.map((t) => (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border bg-white p-4 shadow-lg dark:bg-slate-900',
                t.tipo === 'error' ? 'border-red-200 dark:border-red-500/30' : 'border-slate-200 dark:border-slate-700',
              )}
            >
              {icones[t.tipo]}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.titulo}</p>
                {t.descricao && <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{t.descricao}</div>}
              </div>
              <button onClick={() => remover(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Fechar notificação">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fora do ToastProvider');
  return ctx;
}
