import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PackageCheck } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageSkeleton, StatusBadge } from '@/components/ui';
import { formatDataExtenso, formatHora } from '@/lib/format';
import { ENTREGA_STATUS } from '@/lib/labels';
import { minhasEntregas } from '@/services/api/motorista';
import type { EntregaView } from '@/types';

export default function MinhasEntregas() {
  const q = useQuery({ queryKey: ['motorista', 'entregas'], queryFn: minhasEntregas });
  const grupos = useMemo(() => {
    const m = new Map<string, EntregaView[]>();
    for (const e of q.data ?? []) m.set(e.data, [...(m.get(e.data) ?? []), e]);
    return [...m.entries()].slice(0, 30);
  }, [q.data]);

  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Minhas entregas</h1>
      {grupos.length === 0 ? (
        <Card>
          <EmptyState icon={<PackageCheck className="h-6 w-6" />} title="Nenhuma entrega ainda" />
        </Card>
      ) : (
        grupos.map(([data, lista]) => (
          <section key={data}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold capitalize text-slate-700 dark:text-slate-300">{formatDataExtenso(data)}</h2>
              <span className="tabular text-xs text-slate-500">
                {lista.filter((e) => e.status === 'entregue').length}/{lista.length} entregues
              </span>
            </div>
            <Card className="divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map((e) => (
                <Link key={e.id} to={`/motorista/entregas/${e.id}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="tabular w-6 text-center text-sm font-semibold text-slate-400">{e.ordem}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.cliente?.nome}</p>
                    <p className="truncate text-xs text-slate-500">
                      {e.cliente?.bairro} · #{e.pedido?.numero}
                      {e.entregue_em && ` · ${formatHora(e.entregue_em)}`}
                    </p>
                  </div>
                  <StatusBadge map={ENTREGA_STATUS} value={e.status} />
                </Link>
              ))}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
