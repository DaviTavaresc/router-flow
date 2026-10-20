import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, ExternalLink, Route as RouteIcon } from 'lucide-react';
import { useSessao } from '@/app/session';
import { Card, EmptyState, ErrorState, PageSkeleton, Skeleton, StatusBadge } from '@/components/ui';
import { rotaParaMapa } from '@/components/map/adapters';
import { cn } from '@/lib/cn';
import { formatBRL, formatDuracao, formatHora, formatKm } from '@/lib/format';
import { ENTREGA_STATUS } from '@/lib/labels';
import { minhaRotaDoDia } from '@/services/api/motorista';
import { urlRotaCompleta } from '@/services/geo';

const RouteMap = lazy(() => import('@/components/map/RouteMap'));

export default function MinhaRota() {
  const { empresa } = useSessao();
  const q = useQuery({ queryKey: ['motorista', 'rota-dia'], queryFn: () => minhaRotaDoDia() });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { rota } = q.data;
  if (!rota) {
    return (
      <Card>
        <EmptyState icon={<RouteIcon className="h-6 w-6" />} title="Nenhuma rota para hoje" />
      </Card>
    );
  }
  const partida = { lat: empresa.partida_lat, lng: empresa.partida_lng };
  const pendentes = rota.paradas.filter((p) => ['pendente', 'em_rota', 'reagendada'].includes(p.status) && p.cliente?.latitude != null);
  const linkCompleto = urlRotaCompleta(
    partida,
    pendentes.map((p) => ({ lat: p.cliente!.latitude!, lng: p.cliente!.longitude! })),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Minha rota</h1>
          <p className="tabular text-sm text-slate-500">
            {rota.paradas.length} paradas · {formatKm(rota.distancia_km)} · {formatDuracao(rota.tempo_min)}
          </p>
        </div>
        {linkCompleto && (
          <a href={linkCompleto} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">
            Rota no Maps <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <RouteMap className="h-64" partida={{ ...partida, titulo: empresa.partida_descricao }} rotas={[rotaParaMapa(rota)]} legenda={false} />
      </Suspense>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {rota.paradas.map((p) => {
          const feita = p.status === 'entregue' || p.status === 'nao_entregue';
          return (
            <Link key={p.id} to={`/motorista/entregas/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 dark:active:bg-slate-800">
              <span
                className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white', feita && 'opacity-50')}
                style={{ background: p.status === 'nao_entregue' ? '#d03b3b' : rota.cor }}
              >
                {p.ordem}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate font-medium', feita && 'text-slate-500')}>{p.cliente?.nome}</p>
                <p className="truncate text-xs text-slate-500">
                  {p.cliente?.bairro} · #{p.pedido?.numero}
                  {p.valor_receber > 0 && p.status !== 'entregue' && <span className="text-amber-700 dark:text-amber-400"> · receber {formatBRL(p.valor_receber)}</span>}
                  {p.entregue_em && ` · ${formatHora(p.entregue_em)}`}
                </p>
              </div>
              <StatusBadge map={ENTREGA_STATUS} value={p.status} />
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </Link>
          );
        })}
      </Card>
    </div>
  );
}
