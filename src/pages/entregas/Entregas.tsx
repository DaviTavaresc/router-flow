import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { addMonths, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, List, PackageCheck } from 'lucide-react';
import { useSessao } from '@/app/session';
import { pode } from '@/app/permissions';
import { useAcao, useDebounced } from '@/app/hooks';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, SearchInput, Select, StatusBadge, Table, TableSkeleton, Tabs, Td, Th, Tr } from '@/components/ui';
import { ConfirmarEntregaModal, FalhaEntregaModal } from '@/components/domain/EntregaModals';
import { EscolherDataModal } from '@/components/domain/EscolherDataModal';
import { cn } from '@/lib/cn';
import { amanhaISO, hojeISO, intervaloDias, semanaAtual, toISODate } from '@/lib/dates';
import { formatBRL, formatData, formatDiaSemanaCurto, formatHora, normalizar } from '@/lib/format';
import { ENTREGA_STATUS } from '@/lib/labels';
import { listarEntregas, reagendarEntrega } from '@/services/api/entregas';
import type { EntregaStatus, EntregaView } from '@/types';

type Periodo = 'hoje' | 'amanha' | 'semana' | 'data';
type Visao = 'lista' | 'calendario';

export default function Entregas() {
  const { usuario } = useSessao();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['entregas'], queryFn: listarEntregas });
  const [visao, setVisao] = useState<Visao>('lista');
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [dataEspecifica, setDataEspecifica] = useState(hojeISO());
  const [status, setStatus] = useState<'' | EntregaStatus>('');
  const [motorista, setMotorista] = useState('');
  const [busca, setBusca] = useState('');
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const [confirmar, setConfirmar] = useState<EntregaView | null>(null);
  const [falha, setFalha] = useState<EntregaView | null>(null);
  const [reagendar, setReagendar] = useState<EntregaView | null>(null);
  const buscaDeb = useDebounced(busca);
  const gerencia = pode(usuario.perfil, 'entrega.gerenciar');
  const reagendarAcao = useAcao(({ id, data }: { id: string; data: string }) => reagendarEntrega(id, data), {
    sucesso: 'Entrega reagendada',
    onSuccess: () => setReagendar(null),
  });

  const intervalo = useMemo(() => {
    if (periodo === 'hoje') return { inicio: hojeISO(), fim: hojeISO() };
    if (periodo === 'amanha') return { inicio: amanhaISO(), fim: amanhaISO() };
    if (periodo === 'semana') return semanaAtual();
    return { inicio: dataEspecifica, fim: dataEspecifica };
  }, [periodo, dataEspecifica]);

  const dados = q.data ?? [];
  const motoristas = useMemo(() => {
    const m = new Map<string, string>();
    dados.forEach((e) => e.motorista && m.set(e.motorista.id, e.motorista.nome));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [dados]);

  const doPeriodo = dados.filter((e) => e.data >= intervalo.inicio && e.data <= intervalo.fim);
  const filtradas = doPeriodo.filter((e) => {
    const t = normalizar(buscaDeb).replace('#', '');
    return (
      (!status || e.status === status) &&
      (!motorista || (motorista === '__sem' ? !e.motorista : e.motorista?.id === motorista)) &&
      (!t || normalizar(e.cliente?.nome ?? '').includes(t) || normalizar(e.cliente?.bairro ?? '').includes(t) || String(e.pedido?.numero ?? '').includes(t))
    );
  });

  const contagem = (s: EntregaStatus[]) => doPeriodo.filter((e) => s.includes(e.status)).length;
  const multiDia = intervalo.inicio !== intervalo.fim;

  const abrirDia = (iso: string) => {
    setDataEspecifica(iso);
    setPeriodo(iso === hojeISO() ? 'hoje' : iso === amanhaISO() ? 'amanha' : 'data');
    setVisao('lista');
  };

  return (
    <>
      <PageHeader
        title="Entregas"
        description="Planejamento por dia e acompanhamento das entregas."
        actions={
          <Tabs
            value={visao}
            onChange={setVisao}
            items={[
              { value: 'lista', label: <span className="inline-flex items-center gap-1.5"><List className="h-4 w-4" /> Lista</span> },
              { value: 'calendario', label: <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> Calendário</span> },
            ]}
          />
        }
      />

      {visao === 'calendario' ? (
        <Calendario entregas={dados} mes={mes} onMes={setMes} onDia={abrirDia} carregando={q.isLoading} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Tabs
              value={periodo}
              onChange={setPeriodo}
              items={[
                { value: 'hoje', label: 'Hoje' },
                { value: 'amanha', label: 'Amanhã' },
                { value: 'semana', label: 'Semana' },
                { value: 'data', label: 'Data específica' },
              ]}
            />
            {periodo === 'data' && <Input type="date" value={dataEspecifica} onChange={(e) => setDataEspecifica(e.target.value)} className="w-44" aria-label="Data" />}
            <p className="text-sm text-slate-500">
              {multiDia ? `${formatData(intervalo.inicio)} a ${formatData(intervalo.fim)}` : formatData(intervalo.inicio)}
            </p>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: 'Total', v: doPeriodo.filter((e) => e.status !== 'cancelada').length, t: '' as const },
              { l: 'Pendentes', v: contagem(['pendente', 'reagendada']), t: 'pendente' as const },
              { l: 'Em rota', v: contagem(['em_rota']), t: 'em_rota' as const },
              { l: 'Entregues', v: contagem(['entregue']), t: 'entregue' as const },
            ].map((k) => (
              <button
                key={k.l}
                onClick={() => setStatus(k.t)}
                className={cn(
                  'rounded-xl border bg-white p-4 text-left transition-colors dark:bg-slate-900',
                  status === k.t ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800',
                )}
              >
                <p className="text-xs text-slate-500">{k.l}</p>
                <p className="tabular mt-1 text-2xl font-semibold">{k.v}</p>
              </button>
            ))}
          </div>

          <Card>
            <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3 dark:border-slate-800">
              <SearchInput value={busca} onChange={setBusca} placeholder="Cliente, bairro ou nº do pedido" />
              <Select value={status} onChange={(e) => setStatus(e.target.value as EntregaStatus | '')} aria-label="Status">
                <option value="">Todos os status</option>
                {(Object.keys(ENTREGA_STATUS) as EntregaStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {ENTREGA_STATUS[s].label}
                  </option>
                ))}
              </Select>
              <Select value={motorista} onChange={(e) => setMotorista(e.target.value)} aria-label="Motorista">
                <option value="">Todos os motoristas</option>
                <option value="__sem">Sem rota</option>
                {motoristas.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
              </Select>
            </div>
            {q.isLoading ? (
              <TableSkeleton />
            ) : q.error ? (
              <ErrorState error={q.error} onRetry={() => q.refetch()} />
            ) : filtradas.length === 0 ? (
              <EmptyState
                icon={<PackageCheck className="h-6 w-6" />}
                title="Nenhuma entrega no período"
                description="Entregas são geradas automaticamente a partir dos pedidos com data de entrega."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    {multiDia && <Th>Data</Th>}
                    <Th>Cliente</Th>
                    <Th>Pedido</Th>
                    <Th>Motorista / parada</Th>
                    <Th>Status</Th>
                    <Th>Saída / entrega</Th>
                    <Th className="text-right">Valor</Th>
                    {gerencia && <Th className="text-right">Ações</Th>}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((e) => {
                    const aberta = ['pendente', 'em_rota', 'reagendada'].includes(e.status);
                    return (
                      <Tr key={e.id} onClick={() => navigate(`/pedidos/${e.pedido_id}`)}>
                        {multiDia && <Td className="whitespace-nowrap capitalize">{formatDiaSemanaCurto(e.data)}</Td>}
                        <Td>
                          <p className="max-w-[200px] truncate font-medium text-slate-900 dark:text-white">{e.cliente?.nome}</p>
                          <p className="text-xs text-slate-500">{e.cliente?.bairro}</p>
                        </Td>
                        <Td>#{e.pedido?.numero}</Td>
                        <Td>
                          {e.motorista ? (
                            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: e.rota?.cor }}>
                                {e.ordem}
                              </span>
                              {e.motorista.nome}
                            </span>
                          ) : (
                            <span className="text-slate-400">Sem rota</span>
                          )}
                        </Td>
                        <Td>
                          <StatusBadge map={ENTREGA_STATUS} value={e.status} />
                        </Td>
                        <Td className="tabular whitespace-nowrap text-xs">
                          {e.saida_em ? formatHora(e.saida_em) : '—'} / {e.entregue_em ? formatHora(e.entregue_em) : '—'}
                        </Td>
                        <Td className="tabular whitespace-nowrap text-right">
                          {e.valor_recebido > 0 ? (
                            <span className="text-emerald-600">{formatBRL(e.valor_recebido)}</span>
                          ) : e.valor_receber > 0 ? (
                            <span className="text-amber-700 dark:text-amber-400">{formatBRL(e.valor_receber)}</span>
                          ) : (
                            '—'
                          )}
                        </Td>
                        {gerencia && (
                          <Td className="text-right" onClick={(ev) => ev.stopPropagation()}>
                            <div className="inline-flex gap-1">
                              {aberta && (
                                <>
                                  <Button size="icon-sm" variant="ghost" title="Registrar entrega" aria-label="Registrar entrega" onClick={() => setConfirmar(e)}>
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                  </Button>
                                  <Button size="icon-sm" variant="ghost" title="Não entregue" aria-label="Não entregue" onClick={() => setFalha(e)}>
                                    <CircleAlert className="h-4 w-4 text-red-500" />
                                  </Button>
                                </>
                              )}
                              {(e.status === 'nao_entregue' || ((e.status === 'pendente' || e.status === 'reagendada') && e.rota?.status !== 'em_andamento')) && (
                                <Button size="icon-sm" variant="ghost" title="Reagendar" aria-label="Reagendar" onClick={() => setReagendar(e)}>
                                  <CalendarPlus className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </Td>
                        )}
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      <ConfirmarEntregaModal entrega={confirmar} onClose={() => setConfirmar(null)} />
      <FalhaEntregaModal entrega={falha} onClose={() => setFalha(null)} />
      <EscolherDataModal
        open={!!reagendar}
        titulo="Reagendar entrega"
        descricao={reagendar ? `${reagendar.cliente?.nome} · Pedido #${reagendar.pedido?.numero}` : undefined}
        rotulo="Nova data"
        carregando={reagendarAcao.isPending}
        onClose={() => setReagendar(null)}
        onConfirm={(data) => reagendar && reagendarAcao.mutate({ id: reagendar.id, data })}
      />
    </>
  );
}

function Calendario({
  entregas,
  mes,
  onMes,
  onDia,
  carregando,
}: {
  entregas: EntregaView[];
  mes: Date;
  onMes: (d: Date) => void;
  onDia: (iso: string) => void;
  carregando: boolean;
}) {
  const inicio = toISODate(startOfWeek(startOfMonth(mes), { weekStartsOn: 0 }));
  const fim = toISODate(endOfWeek(endOfMonth(mes), { weekStartsOn: 0 }));
  const dias = intervaloDias(inicio, fim);
  const hoje = hojeISO();
  const porDia = useMemo(() => {
    const m = new Map<string, EntregaView[]>();
    for (const e of entregas) {
      if (e.status === 'cancelada') continue;
      m.set(e.data, [...(m.get(e.data) ?? []), e]);
    }
    return m;
  }, [entregas]);

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <h3 className="font-semibold capitalize">{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</h3>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => onMes(addMonths(mes, -1))} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onMes(startOfMonth(new Date()))}>
            Hoje
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => onMes(addMonths(mes, 1))} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {carregando ? (
        <TableSkeleton rows={5} cols={7} />
      ) : (
        <div className="grid grid-cols-7">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
            <div key={d} className="border-b border-slate-100 py-2 text-center text-xs font-medium text-slate-500 dark:border-slate-800">
              {d}
            </div>
          ))}
          {dias.map((iso) => {
            const lista = porDia.get(iso) ?? [];
            const foraDoMes = parseISO(iso).getMonth() !== mes.getMonth();
            const entregues = lista.filter((e) => e.status === 'entregue').length;
            const abertas = lista.filter((e) => ['pendente', 'em_rota', 'reagendada'].includes(e.status)).length;
            const falhas = lista.filter((e) => e.status === 'nao_entregue').length;
            return (
              <button
                key={iso}
                onClick={() => onDia(iso)}
                className={cn(
                  'flex min-h-[72px] flex-col items-start gap-1 border-b border-r border-slate-100 p-1.5 text-left transition-colors hover:bg-brand-50/60 sm:min-h-[96px] sm:p-2 dark:border-slate-800 dark:hover:bg-brand-500/5',
                  foraDoMes && 'bg-slate-50/60 text-slate-400 dark:bg-slate-900/40',
                )}
              >
                <span
                  className={cn(
                    'tabular flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                    iso === hoje && 'bg-brand-600 text-white',
                  )}
                >
                  {Number(iso.slice(8))}
                </span>
                {lista.length > 0 && (
                  <div className="flex w-full flex-col gap-0.5 text-[10px] sm:text-[11px]">
                    <span className="tabular font-semibold text-slate-700 dark:text-slate-200">{lista.length} entrega(s)</span>
                    <span className="hidden flex-wrap gap-1 sm:flex">
                      {entregues > 0 && <Badge tone="green" className="px-1.5 text-[10px]">{entregues}</Badge>}
                      {abertas > 0 && <Badge tone="amber" className="px-1.5 text-[10px]">{abertas}</Badge>}
                      {falhas > 0 && <Badge tone="red" className="px-1.5 text-[10px]">{falhas}</Badge>}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-3 px-5 py-3 text-xs text-slate-500">
        <Badge tone="green">Entregues</Badge>
        <Badge tone="amber">Pendentes / em rota</Badge>
        <Badge tone="red">Não entregues</Badge>
      </div>
    </Card>
  );
}
