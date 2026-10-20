import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Badge, Card, ErrorState, PageSkeleton, Skeleton, StatusBadge } from '@/components/ui';
import { entregaParaStop } from '@/components/map/adapters';
import { formatBRL, formatDataHora, onlyDigits } from '@/lib/format';
import { ENTREGA_STATUS } from '@/lib/labels';
import { detalheEntregaMotorista } from '@/services/api/motorista';
import { AcoesEntrega } from './shared';

const RouteMap = lazy(() => import('@/components/map/RouteMap'));

export default function EntregaMotorista() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['motorista', 'entrega', id], queryFn: () => detalheEntregaMotorista(id) });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error('Entrega não encontrada.')} onRetry={() => q.refetch()} />;
  const { entrega: e, itens, totalParadas } = q.data;
  const c = e.cliente;
  const stop = entregaParaStop(e);
  const tel = onlyDigits(c?.telefone ?? '');

  return (
    <div className="space-y-4">
      <Link to="/motorista/rota" className="inline-flex items-center gap-1.5 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Minha rota
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">
            Parada {e.ordem} de {totalParadas} · Pedido #{e.pedido?.numero}
          </p>
          <h1 className="text-xl font-semibold leading-tight tracking-tight">{c?.nome}</h1>
        </div>
        <StatusBadge map={ENTREGA_STATUS} value={e.status} />
      </div>

      <Card className="p-4">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Bairro</dt>
            <dd className="font-medium">{c?.bairro}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cidade</dt>
            <dd className="font-medium">{c?.cidade}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Estado</dt>
            <dd className="font-medium">{c?.estado}</dd>
          </div>
        </dl>
        {tel && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={`tel:${tel}`} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-medium dark:border-slate-700">
              <Phone className="h-4 w-4 text-brand-600" /> Ligar
            </a>
            <a href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-medium dark:border-slate-700">
              <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp
            </a>
          </div>
        )}
      </Card>

      {stop && (
        <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
          <RouteMap className="h-48" avulsos={[stop]} legenda={false} />
        </Suspense>
      )}
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <MapPin className="h-3.5 w-3.5" /> Localização aproximada (centro do bairro).
      </p>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Pagamento</p>
          {e.status === 'entregue' ? (
            e.valor_recebido > 0 ? <Badge tone="green">Recebido {formatBRL(e.valor_recebido)}</Badge> : <Badge tone="green">Concluído</Badge>
          ) : e.valor_receber > 0 ? (
            <Badge tone="amber">A receber {formatBRL(e.valor_receber)}</Badge>
          ) : e.pedido?.tipo_venda === 'prazo' ? (
            <Badge tone="blue">A prazo — não cobrar</Badge>
          ) : (
            <Badge tone="green">Já pago</Badge>
          )}
        </div>
        {itens.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            {itens.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span className="text-slate-600 dark:text-slate-300">{i.descricao}</span>
                <span className="tabular shrink-0 font-medium">× {i.quantidade}</span>
              </li>
            ))}
          </ul>
        )}
        {e.pedido?.observacoes && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{e.pedido.observacoes}</p>}
        {e.entregue_em && <p className="mt-3 text-xs text-slate-500">Entregue em {formatDataHora(e.entregue_em)}</p>}
        {e.observacoes && <p className="mt-1 text-xs italic text-slate-500">“{e.observacoes}”</p>}
      </Card>

      <AcoesEntrega entrega={e} onConcluida={() => navigate('/motorista')} />
    </div>
  );
}
