import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { normalizar, onlyDigits } from '@/lib/format';
import type { Cliente } from '@/types';

export function ClienteCombobox({
  clientes,
  value,
  onChange,
  invalid,
  id,
}: {
  clientes: Cliente[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  id?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selecionado = clientes.find((c) => c.id === value);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtrados = useMemo(() => {
    const t = normalizar(busca);
    const d = onlyDigits(busca);
    return clientes
      .filter((c) => !t || normalizar(c.nome).includes(t) || normalizar(c.bairro).includes(t) || (d.length >= 3 && onlyDigits(c.telefone).includes(d)))
      .slice(0, 50);
  }, [clientes, busca]);

  const escolher = (c: Cliente) => {
    onChange(c.id);
    setAberto(false);
    setBusca('');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm dark:bg-slate-900',
          invalid ? 'border-red-400' : 'border-slate-200 dark:border-slate-700',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/30',
        )}
        aria-haspopup="listbox"
        aria-expanded={aberto}
      >
        {selecionado ? (
          <span className="truncate">
            <span className="font-medium">{selecionado.nome}</span>
            <span className="text-slate-500"> · {selecionado.bairro}</span>
          </span>
        ) : (
          <span className="text-slate-400">Selecione o cliente</span>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {aberto && (
        <div className="absolute z-30 mt-1 w-full animate-fade-in rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 dark:border-slate-800">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setAtivo(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setAtivo((a) => Math.min(a + 1, filtrados.length - 1));
                if (e.key === 'ArrowUp') setAtivo((a) => Math.max(a - 1, 0));
                if (e.key === 'Enter' && filtrados[ativo]) {
                  e.preventDefault();
                  escolher(filtrados[ativo]);
                }
                if (e.key === 'Escape') setAberto(false);
              }}
              placeholder="Buscar por nome, bairro ou telefone"
              className="h-10 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <ul role="listbox" className="scroll-thin max-h-64 overflow-y-auto p-1">
            {filtrados.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Nenhum cliente encontrado</li>}
            {filtrados.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={c.id === value}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(c)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm',
                  i === ativo && 'bg-slate-100 dark:bg-slate-800',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.nome}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {c.bairro} · {c.telefone}
                  </span>
                </span>
                {c.id === value && <Check className="h-4 w-4 text-brand-600" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
