import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { Download, FileBarChart, Printer } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, Table, Td, Th, Tr, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { exportarCSV } from '@/lib/csv';
import { hojeISO, somarDias, toISODate } from '@/lib/dates';
import { formatBRL, formatData, formatDuracao, formatInt, formatKm } from '@/lib/format';
import { carregarRelatorios, celulaCSV, gerarRelatorio, RELATORIOS, type TipoColuna, type TipoRelatorio } from '@/services/api/relatorios';

function fmt(v: string | number | null, tipo: TipoColuna): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return tipo === 'data' ? formatData(v) : v;
  switch (tipo) {
    case 'moeda':
      return formatBRL(v);
    case 'km':
      return formatKm(v);
    case 'minutos':
      return formatDuracao(v);
    case 'pct':
      return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    default:
      return formatInt(v);
  }
}

const numerico = (t: TipoColuna) => t !== 'texto' && t !== 'data';

const PRESETS = [
  { id: '7', label: 'Últimos 7 dias', range: () => ({ inicio: somarDias(hojeISO(), -6), fim: hojeISO() }) },
  { id: '30', label: 'Últimos 30 dias', range: () => ({ inicio: somarDias(hojeISO(), -29), fim: hojeISO() }) },
  { id: 'mes', label: 'Este mês', range: () => ({ inicio: toISODate(startOfMonth(new Date())), fim: toISODate(endOfMonth(new Date())) }) },
  {
    id: 'anterior',
    label: 'Mês anterior',
    range: () => ({ inicio: toISODate(startOfMonth(subMonths(new Date(), 1))), fim: toISODate(endOfMonth(subMonths(new Date(), 1))) }),
  },
];

export default function Relatorios() {
  const toast = useToast();
  const q = useQuery({ queryKey: ['relatorios'], queryFn: carregarRelatorios });
  const [tipo, setTipo] = useState<TipoRelatorio>('vendas');
  const [preset, setPreset] = useState('30');
  const [periodo, setPeriodo] = useState(PRESETS[1].range());

  const rel = useMemo(() => (q.data ? gerarRelatorio(tipo, q.data, periodo.inicio, periodo.fim) : null), [q.data, tipo, periodo]);
  const meta = RELATORIOS.find((r) => r.id === tipo)!;

  const exportar = () => {
    if (!rel) return;
    exportarCSV(
      `routeflow-${tipo}-${periodo.inicio}-a-${periodo.fim}`,
      rel.colunas.map((c) => c.label),
      rel.linhas.map((l) => l.map((v, i) => celulaCSV(v, rel.colunas[i].tipo))),
    );
    toast.success('Relatório exportado', 'Arquivo CSV gerado.');
  };

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data || !rel) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Indicadores de vendas, entregas, recebimentos e equipe."
        actions={
          <>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()} title="Imprimir ou salvar como PDF">
              PDF
            </Button>
            <Button icon={<Download className="h-4 w-4" />} onClick={exportar} disabled={!rel.linhas.length}>
              Exportar CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="no-print scroll-thin flex gap-1 overflow-x-auto lg:flex-col">
          {RELATORIOS.map((r) => (
            <button
              key={r.id}
              onClick={() => setTipo(r.id)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                tipo === r.id
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              {r.nome}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-5">
          <Card className="no-print flex flex-wrap items-center gap-3 p-4">
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={preset === p.id ? 'primary' : 'outline'}
                  onClick={() => {
                    setPreset(p.id);
                    setPeriodo(p.range());
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={periodo.inicio}
                onChange={(e) => {
                  setPreset('custom');
                  setPeriodo((x) => ({ ...x, inicio: e.target.value }));
                }}
                className="w-40"
                aria-label="Início"
              />
              <span className="text-sm text-slate-400">a</span>
              <Input
                type="date"
                value={periodo.fim}
                onChange={(e) => {
                  setPreset('custom');
                  setPeriodo((x) => ({ ...x, fim: e.target.value }));
                }}
                className="w-40"
                aria-label="Fim"
              />
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {rel.resumo.map((r) => (
              <Card key={r.label} className="p-4">
                <p className="text-xs text-slate-500">{r.label}</p>
                <p className="tabular mt-1 truncate text-xl font-semibold">{fmt(r.valor, r.tipo)}</p>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title={meta.nome} description={`${meta.descricao} · ${formatData(periodo.inicio)} a ${formatData(periodo.fim)}`} />
            {rel.linhas.length === 0 ? (
              <EmptyState icon={<FileBarChart className="h-6 w-6" />} title="Sem dados no período" description="Escolha outro período para ver resultados." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    {rel.colunas.map((c) => (
                      <Th key={c.label} className={cn(numerico(c.tipo) && 'text-right')}>
                        {c.label}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rel.linhas.slice(0, 500).map((l, i) => (
                    <Tr key={i}>
                      {l.map((v, j) => (
                        <Td key={j} className={cn('whitespace-nowrap', numerico(rel.colunas[j].tipo) && 'tabular text-right', j === 0 && 'font-medium text-slate-900 dark:text-white')}>
                          {fmt(v, rel.colunas[j].tipo)}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
