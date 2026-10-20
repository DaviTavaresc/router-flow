import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  HandCoins,
  Package,
  Plus,
  Route as RouteIcon,
  Timer,
  Truck,
  Wallet,
  TriangleAlert,
} from 'lucide-react';
import { useSessao } from '@/app/session';
import { pode, podeAcessar } from '@/app/permissions';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageSkeleton, StatCard, StatusBadge } from '@/components/ui';
import { BarrasHorizontais, EntregasPorDiaChart, Legenda, VendasChart } from '@/components/charts/Charts';
import { dadosDashboard } from '@/services/api/dashboard';
import { ENTREGA_STATUS, ROTA_STATUS } from '@/lib/labels';
import { formatBRL, formatDuracao, formatKm, primeiroNome } from '@/lib/format';

export default function Dashboard() {
  const { usuario } = useSessao();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: dadosDashboard, refetchInterval: 60_000 });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { kpis, financeiro, rotasHoje, entregasPorDia, vendasPorDia, statusEntregas } = q.data;
  const isAdmin = usuario.perfil === 'admin';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Olá, ${primeiroNome(usuario.nome)} 👋`}
        description="Acompanhe a operação de entregas de hoje."
        actions={
          <>
            {pode(usuario.perfil, 'pedido.criar') && (
              <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/pedidos/novo')}>
                Novo pedido
              </Button>
            )}
            {podeAcessar(usuario.perfil, 'rotas') && (
              <Button icon={<RouteIcon className="h-4 w-4" />} onClick={() => navigate('/rotas')}>
                Planejar rotas
              </Button>
            )}
          </>
        }
      />

      {isAdmin && Object.values(q.data.contagens).some((n) => n === 0) && <PrimeirosPassos contagens={q.data.contagens} />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Entregas de hoje" value={kpis.entregasHoje} icon={<Package />} tone="blue" />
        <StatCard
          label="Concluídas"
          value={kpis.concluidas}
          icon={<CheckCircle2 />}
          tone="green"
          hint={kpis.entregasHoje ? `${Math.round((kpis.concluidas / kpis.entregasHoje) * 100)}% do dia` : undefined}
        />
        <StatCard
          label="Pendentes"
          value={kpis.pendentes}
          icon={<Clock />}
          tone="neutral"
          hint={kpis.naoEntregues ? `${kpis.naoEntregues} não realizada(s)` : undefined}
        />
        <StatCard label="Em rota" value={kpis.emRota} icon={<Truck />} tone="amber" />
        <StatCard label="Vendas do dia" value={formatBRL(kpis.vendasDia)} icon={<DollarSign />} tone="violet" />
        <StatCard label="Recebido hoje" value={formatBRL(kpis.recebidoHoje)} icon={<HandCoins />} tone="green" />
        <StatCard
          label="A receber"
          value={formatBRL(kpis.aReceber)}
          icon={<Wallet />}
          tone="amber"
          hint={kpis.vencido ? <span className="text-red-600 dark:text-red-400">{formatBRL(kpis.vencido)} vencido</span> : 'Nenhum valor vencido'}
        />
        <StatCard label="Motoristas ativos" value={`${kpis.motoristasAtivos} de ${kpis.motoristasTotal}`} icon={<Truck />} tone="cyan" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Rotas de hoje"
            description={`${rotasHoje.length} rota(s) planejada(s)`}
            action={
              podeAcessar(usuario.perfil, 'rotas') && (
                <Link to="/rotas" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  Ver no mapa <ArrowRight className="h-4 w-4" />
                </Link>
              )
            }
          />
          {rotasHoje.length === 0 ? (
            <EmptyState
              icon={<RouteIcon className="h-6 w-6" />}
              title="Nenhuma rota para hoje"
              description="Selecione as entregas e os motoristas e deixe o RouteFlow distribuir as rotas."
              action={isAdmin && <Button onClick={() => navigate('/rotas')}>Planejar rotas</Button>}
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rotasHoje.map((r) => {
                const feitas = r.paradas.filter((p) => p.status === 'entregue' || p.status === 'nao_entregue').length;
                const pct = r.paradas.length ? (feitas / r.paradas.length) * 100 : 0;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                    <div className="flex min-w-[180px] flex-1 items-center gap-3">
                      <Avatar nome={r.motorista?.nome ?? r.nome} cor={r.cor} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{r.motorista?.nome ?? r.nome}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.cor }} />
                          </div>
                          <span className="tabular text-xs text-slate-500">
                            {feitas}/{r.paradas.length}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-5 text-sm text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1.5" title="Entregas">
                        <Package className="h-4 w-4 text-slate-400" />
                        <span className="tabular">{r.paradas.length}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5" title="Distância estimada">
                        <RouteIcon className="h-4 w-4 text-slate-400" />
                        <span className="tabular">{formatKm(r.distancia_km)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5" title="Tempo estimado">
                        <Timer className="h-4 w-4 text-slate-400" />
                        <span className="tabular">{formatDuracao(r.tempo_min)}</span>
                      </span>
                    </div>
                    <StatusBadge map={ROTA_STATUS} value={r.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Resumo financeiro" description="Mês atual" />
          <div className="space-y-4 p-5">
            <ResumoLinha label="Vendas" valor={financeiro.vendasMes} cor="bg-brand-500" />
            <ResumoLinha label="Recebido" valor={financeiro.recebidoMes} cor="bg-emerald-500" />
            <ResumoLinha label="A receber (total)" valor={financeiro.aReceber} cor="bg-amber-500" />
            {financeiro.vencido > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong className="tabular">{formatBRL(financeiro.vencido)}</strong> em parcelas vencidas.
                </span>
              </div>
            )}
            {podeAcessar(usuario.perfil, 'financeiro') && (
              <Button variant="outline" className="w-full" onClick={() => navigate('/financeiro')}>
                Abrir financeiro
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Entregas por dia"
            description="Últimos 14 dias"
            action={
              <Legenda
                itens={[
                  { cor: 'var(--series-1)', label: 'Entregues' },
                  { cor: 'var(--series-2)', label: 'Não entregues' },
                ]}
              />
            }
          />
          <div className="p-4">
            <EntregasPorDiaChart data={entregasPorDia} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Status das entregas" description="Últimos 30 dias" />
          <div className="p-5">
            <BarrasHorizontais
              itens={statusEntregas.map((s) => ({
                label: <Badge tone={ENTREGA_STATUS[s.status].tone}>{ENTREGA_STATUS[s.status].label}</Badge>,
                valor: s.total,
              }))}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Vendas por período" description="Últimos 30 dias" />
        <div className="p-4">
          <VendasChart data={vendasPorDia} />
        </div>
      </Card>
    </div>
  );
}

function PrimeirosPassos({ contagens }: { contagens: { clientes: number; motoristas: number; pedidos: number; rotas: number } }) {
  const passos = [
    { feito: false, titulo: 'Cadastre os usuários', texto: 'Vendedores e motoristas que vão acessar o sistema.', to: '/usuarios' },
    { feito: contagens.motoristas > 0, titulo: 'Cadastre os motoristas', texto: 'Veículo, capacidade e o usuário de acesso.', to: '/motoristas' },
    { feito: contagens.clientes > 0, titulo: 'Cadastre os clientes', texto: 'Nome, telefone, bairro, cidade e estado.', to: '/clientes' },
    { feito: contagens.pedidos > 0, titulo: 'Crie os pedidos', texto: 'Com a data de entrega, a entrega é gerada automaticamente.', to: '/pedidos/novo' },
    { feito: contagens.rotas > 0, titulo: 'Planeje as rotas', texto: 'Selecione entregas e motoristas e clique em Otimizar.', to: '/rotas' },
  ];
  return (
    <Card>
      <CardHeader title="Primeiros passos" description="Siga a ordem abaixo para começar a operar." />
      <ol className="grid gap-px overflow-hidden bg-slate-100 sm:grid-cols-5 dark:bg-slate-800">
        {passos.map((p, i) => (
          <li key={p.to} className="bg-white dark:bg-slate-900">
            <Link to={p.to} className="flex h-full gap-3 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${p.feito ? 'bg-emerald-500 text-white' : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'}`}
              >
                {p.feito ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 dark:text-white">{p.titulo}</span>
                <span className="block text-xs text-slate-500">{p.texto}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ResumoLinha({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <span className={`h-2 w-2 rounded-full ${cor}`} />
        {label}
      </span>
      <span className="tabular text-sm font-semibold text-slate-900 dark:text-white">{formatBRL(valor)}</span>
    </div>
  );
}
