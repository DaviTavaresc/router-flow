import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MapPin, PartyPopper, Phone, Play, Route as RouteIcon } from 'lucide-react';
import { useSessao } from '@/app/session';
import { useAcao } from '@/app/hooks';
import { Badge, Button, Card, EmptyState, ErrorState, PageSkeleton, StatusBadge } from '@/components/ui';
import { formatBRL, formatDataExtenso, formatDuracao, formatKm, onlyDigits, primeiroNome } from '@/lib/format';
import { hojeISO } from '@/lib/dates';
import { ROTA_STATUS } from '@/lib/labels';
import { iniciarRota } from '@/services/api/entregas';
import { minhaRotaDoDia } from '@/services/api/motorista';
import { AcoesEntrega } from './shared';

export default function MotoristaHome() {
  const { usuario } = useSessao();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['motorista', 'rota-dia'], queryFn: () => minhaRotaDoDia(), refetchInterval: 60_000 });
  const iniciar = useAcao(iniciarRota, { sucesso: 'Rota iniciada. Boa viagem!' });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { rota, proxima } = q.data;
  const feitas = rota?.paradas.filter((p) => p.status === 'entregue' || p.status === 'nao_entregue').length ?? 0;
  const total = rota?.paradas.length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {primeiroNome(usuario.nome)} 👋</h1>
        <p className="text-sm capitalize text-slate-500">{formatDataExtenso(hojeISO())}</p>
      </div>

      {!rota ? (
        <Card>
          <EmptyState
            icon={<RouteIcon className="h-6 w-6" />}
            title="Nenhuma rota para hoje"
            description="Quando o administrador planejar sua rota, ela aparecerá aqui."
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="bg-brand-600 p-5 text-white">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-blue-100">Sua rota de hoje</p>
                <Badge tone="neutral" className="bg-white/15 text-white ring-white/25" dot={false}>
                  {ROTA_STATUS[rota.status].label}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <p className="tabular text-2xl font-semibold">{total}</p>
                  <p className="text-xs text-blue-100">entregas</p>
                </div>
                <div>
                  <p className="tabular text-2xl font-semibold">{formatKm(rota.distancia_km)}</p>
                  <p className="text-xs text-blue-100">estimados</p>
                </div>
                <div>
                  <p className="tabular text-2xl font-semibold">{formatDuracao(rota.tempo_min)}</p>
                  <p className="text-xs text-blue-100">previsto</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white transition-all" style={{ width: `${total ? (feitas / total) * 100 : 0}%` }} />
                </div>
                <p className="tabular mt-1.5 text-xs text-blue-100">
                  {feitas} de {total} concluídas
                </p>
              </div>
            </div>
            <div className="flex gap-2 p-3">
              {rota.status === 'planejada' && (
                <Button className="flex-1" size="lg" icon={<Play className="h-5 w-5" />} loading={iniciar.isPending} onClick={() => iniciar.mutate(rota.id)}>
                  Iniciar rota
                </Button>
              )}
              <Button variant="outline" size="lg" className="flex-1" onClick={() => navigate('/motorista/rota')}>
                Ver todas as paradas
              </Button>
            </div>
          </Card>

          {proxima ? (
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Próxima entrega</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: rota.cor }}>
                  {proxima.ordem}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Cliente</dt>
                  <dd className="text-lg font-semibold leading-tight">{proxima.cliente?.nome}</dd>
                </div>
                <Item label="Bairro" valor={proxima.cliente?.bairro} />
                <Item label="Cidade" valor={proxima.cliente?.cidade} />
                <Item label="Estado" valor={proxima.cliente?.estado} />
                <Item label="Pedido" valor={`#${proxima.pedido?.numero}`} />
                <Item label="Valor" valor={formatBRL(proxima.pedido?.total ?? 0)} />
                <div>
                  <dt className="text-xs text-slate-500">Pagamento</dt>
                  <dd className="mt-0.5">
                    {proxima.valor_receber > 0 ? (
                      <Badge tone="amber">A receber {formatBRL(proxima.valor_receber)}</Badge>
                    ) : proxima.pedido?.tipo_venda === 'prazo' ? (
                      <Badge tone="blue">A prazo</Badge>
                    ) : (
                      <Badge tone="green">Pago</Badge>
                    )}
                  </dd>
                </div>
              </dl>
              {proxima.cliente && (
                <a
                  href={`tel:${onlyDigits(proxima.cliente.telefone)}`}
                  className="tabular mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                >
                  <Phone className="h-4 w-4 text-brand-600" /> Ligar para {proxima.cliente.telefone}
                </a>
              )}
              {proxima.cliente?.latitude != null && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5" /> Localização aproximada pelo bairro — confirme o endereço com o cliente.
                </p>
              )}
              <div className="mt-5">
                <AcoesEntrega entrega={proxima} detalhes={() => navigate(`/motorista/entregas/${proxima.id}`)} />
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<PartyPopper className="h-6 w-6 text-emerald-500" />}
                title="Rota concluída!"
                description="Todas as entregas de hoje foram finalizadas. Bom trabalho!"
              />
            </Card>
          )}

          {q.data.outras.length > 0 && (
            <p className="text-center text-xs text-slate-500">
              Você tem mais {q.data.outras.length} rota(s) hoje: {q.data.outras.map((r) => <StatusBadge key={r.id} map={ROTA_STATUS} value={r.status} />)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Item({ label, valor }: { label: string; valor?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="truncate font-medium">{valor ?? '—'}</dd>
    </div>
  );
}
