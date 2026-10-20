/**
 * Gráficos do RouteFlow (Recharts). Cores por papel via tokens CSS (index.css),
 * com variantes light/dark; marcas finas, grade discreta, tooltip no hover.
 */
import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatData } from '@/lib/format';
import { format, parseISO } from 'date-fns';

const eixo = { fontSize: 11, fill: 'var(--chart-axis)' };
const diaCurto = (d: string) => format(parseISO(d), 'dd/MM');

function TooltipBox({ titulo, linhas }: { titulo: string; linhas: { cor: string; label: string; valor: ReactNode }[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-1 font-medium text-slate-900 dark:text-white">{titulo}</p>
      {linhas.map((l) => (
        <p key={l.label} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: l.cor }} />
          {l.label}: <span className="tabular font-medium text-slate-900 dark:text-white">{l.valor}</span>
        </p>
      ))}
    </div>
  );
}

export function Legenda({ itens }: { itens: { cor: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
      {itens.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.cor }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function EntregasPorDiaChart({ data }: { data: { data: string; entregues: number; naoEntregues: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="data" tickFormatter={diaCurto} tick={eixo} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={eixo} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.5 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  titulo={formatData(String(label))}
                  linhas={[
                    { cor: 'var(--series-1)', label: 'Entregues', valor: payload[0]?.payload.entregues },
                    { cor: 'var(--series-2)', label: 'Não entregues', valor: payload[0]?.payload.naoEntregues },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="entregues" stackId="a" fill="var(--series-1)" stroke="var(--chart-surface)" strokeWidth={1} />
          <Bar dataKey="naoEntregues" stackId="a" fill="var(--series-2)" radius={[4, 4, 0, 0]} stroke="var(--chart-surface)" strokeWidth={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VendasChart({ data }: { data: { data: string; valor: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradVendas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="data" tickFormatter={diaCurto} tick={eixo} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis
            tick={eixo}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(v))}
          />
          <Tooltip
            cursor={{ stroke: 'var(--chart-axis)', strokeDasharray: '3 3' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox titulo={formatData(String(label))} linhas={[{ cor: 'var(--series-1)', label: 'Vendas', valor: formatBRL(Number(payload[0].value)) }]} />
              ) : null
            }
          />
          <Area type="monotone" dataKey="valor" stroke="var(--series-1)" strokeWidth={2} fill="url(#gradVendas)" activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontais em HTML (rótulo + valor sempre visíveis; cor única) */
export function BarrasHorizontais({ itens }: { itens: { label: ReactNode; valor: number; detalhe?: ReactNode }[] }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-3">
      {itens.map((i, k) => (
        <li key={k} className="group">
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="tabular shrink-0 font-medium text-slate-900 dark:text-white">{i.detalhe ?? i.valor}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-[var(--series-1)] transition-all" style={{ width: `${(i.valor / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
