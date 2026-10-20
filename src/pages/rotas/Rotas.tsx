import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ChevronDown, Info, MapPinOff, Package, RotateCcw, Route as RouteIcon, Save, Timer, TriangleAlert, Truck, UserPlus, WandSparkles } from 'lucide-react';
import { useSessao } from '@/app/session';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, Skeleton, StatusBadge, useConfirm, useToast } from '@/components/ui';
import type { MapRoute, MapStop } from '@/components/map/types';
import { entregaParaStop } from '@/components/map/adapters';
import { cn } from '@/lib/cn';
import { amanhaISO, hojeISO } from '@/lib/dates';
import { formatDataExtenso, formatDuracao, formatKm } from '@/lib/format';
import { ENTREGA_STATUS, MOTORISTA_STATUS } from '@/lib/labels';
import { carregarPlanejamento, otimizar, planoExistente, salvarPlano } from '@/services/api/planejamento';
import { ListaDroppable, ParadaItem, RotaCard } from './RotaCard';
import { POOL, usePlano } from './usePlano';

const RouteMap = lazy(() => import('@/components/map/RouteMap'));

export default function Rotas() {
  const { empresa } = useSessao();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const data = params.get('data') ?? hojeISO();
  const q = useQuery({ queryKey: ['planejamento', data], queryFn: () => carregarPlanejamento(data, empresa.id) });
  const d = q.data;
  const api = usePlano();
  const { plano, alterado } = api;

  const [selEntregas, setSelEntregas] = useState<Set<string>>(new Set());
  const [selMotoristas, setSelMotoristas] = useState<Set<string>>(new Set());
  const [destaque, setDestaque] = useState<string | null>(null);
  const [otimizando, setOtimizando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [painelAberto, setPainelAberto] = useState(true);

  // Inicializa o plano a partir das rotas salvas (sem sobrescrever edições em andamento)
  useEffect(() => {
    if (!d || api.alterado) return;
    const p = planoExistente(d);
    api.definir(p);
    setAvisos([]);
    setSelEntregas(new Set(d.disponiveis.map((e) => e.id)));
    const comRota = new Set(p.rotas.filter((r) => !r.bloqueada).map((r) => r.motoristaId));
    setSelMotoristas(new Set(d.motoristas.filter((m) => m.status === 'disponivel' || comRota.has(m.id)).map((m) => m.id)));
    setPainelAberto(p.rotas.filter((r) => !r.bloqueada).length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  // Aviso ao sair com alterações não salvas
  useEffect(() => {
    if (!alterado) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [alterado]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const trocarData = async (nova: string) => {
    if (nova === data) return;
    if (alterado && !(await confirm({ title: 'Descartar alterações?', description: 'O plano atual não foi salvo.', confirmLabel: 'Descartar' }))) return;
    api.definir(null);
    setParams({ data: nova });
  };

  const descartar = async () => {
    if (!d) return;
    if (await confirm({ title: 'Descartar alterações?', description: 'As rotas voltarão ao último estado salvo.', confirmLabel: 'Descartar' })) {
      api.definir(planoExistente(d));
      setAvisos([]);
    }
  };

  const executarOtimizacao = async () => {
    if (!d || !plano) return;
    if (!selEntregas.size) return toast.error('Selecione as entregas', 'Marque ao menos uma entrega para otimizar.');
    if (!selMotoristas.size) return toast.error('Selecione os motoristas', 'Marque ao menos um motorista disponível.');
    const editaveis = plano.rotas.filter((r) => !r.bloqueada && r.paradas.length);
    if (editaveis.length && !(await confirm({ title: 'Substituir rotas planejadas?', description: 'A otimização vai redistribuir as entregas selecionadas e substituir as rotas ainda não iniciadas.', confirmLabel: 'Otimizar', tone: 'primary' })))
      return;
    setOtimizando(true);
    try {
      const [novo] = await Promise.all([
        otimizar(d, [...selEntregas], [...selMotoristas], plano.rotas.filter((r) => r.bloqueada)),
        new Promise((r) => setTimeout(r, 450)),
      ]);
      api.definir(novo, true);
      setAvisos(novo.avisos);
      setPainelAberto(false);
      const usadas = novo.rotas.filter((r) => !r.bloqueada && r.paradas.length);
      toast.success('Rotas otimizadas', `${usadas.reduce((s, r) => s + r.paradas.length, 0)} entregas distribuídas em ${usadas.length} rota(s). Revise e salve.`);
    } catch (e) {
      toast.fromError(e, 'Falha na otimização');
    } finally {
      setOtimizando(false);
    }
  };

  const salvar = async () => {
    if (!plano) return;
    setSalvando(true);
    try {
      await salvarPlano(data, plano, empresa);
      api.definir(plano, false);
      await qc.invalidateQueries();
      toast.success('Rotas salvas', 'Os motoristas já podem visualizar suas rotas.');
    } catch (e) {
      toast.fromError(e, 'Não foi possível salvar as rotas');
    } finally {
      setSalvando(false);
    }
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !plano || !d) return;
    const de = api.containerDe(plano, String(active.id));
    const para = api.containerDe(plano, String(over.id));
    if (!de || !para || de === para) return;
    if (para !== POOL && plano.rotas.find((r) => r.motoristaId === para)?.bloqueada) return;
    const lista = para === POOL ? plano.naoAtribuidas : plano.rotas.find((r) => r.motoristaId === para)!.paradas;
    const idx = lista.findIndex((e) => e.id === over.id);
    api.mover(d, String(active.id), para, idx >= 0 ? idx : lista.length);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || !plano || !d) return;
    const c = api.containerDe(plano, String(active.id));
    if (!c || c === POOL || c !== api.containerDe(plano, String(over.id))) return;
    const lista = plano.rotas.find((r) => r.motoristaId === c)!.paradas;
    const de = lista.findIndex((e) => e.id === active.id);
    const para = lista.findIndex((e) => e.id === over.id);
    if (de >= 0 && para >= 0 && de !== para) api.reordenarDentro(d, c, de, para);
  };

  const mapa = useMemo(() => {
    if (!plano) return { rotas: [] as MapRoute[], avulsos: [] as MapStop[] };
    return {
      rotas: plano.rotas
        .filter((r) => r.paradas.length)
        .map((r) => ({
          id: r.motoristaId,
          nome: r.nome.replace(/^Rota /, ''),
          cor: r.cor,
          paradas: r.paradas.map((p, i) => entregaParaStop(p, i + 1)).filter((x): x is MapStop => !!x),
        })),
      avulsos: plano.naoAtribuidas.map((e) => entregaParaStop(e, null)).filter((x): x is MapStop => !!x),
    };
  }, [plano]);

  if (q.isLoading || (d && !plano)) return <PageSkeleton />;
  if (q.error || !d || !plano) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const editaveis = plano.rotas.filter((r) => !r.bloqueada);
  const destinos = editaveis.map((r) => ({ id: r.motoristaId, nome: r.nome.replace(/^Rota /, '') }));
  const totalKm = plano.rotas.reduce((s, r) => s + r.distanciaKm, 0);
  const maiorTempo = Math.max(0, ...plano.rotas.map((r) => r.tempoMin));
  const totalParadas = plano.rotas.reduce((s, r) => s + r.paradas.length, 0);
  const semCoord = d.disponiveis.filter((e) => e.cliente?.latitude == null);
  const motoristasSemRota = d.motoristas.filter((m) => !plano.rotas.some((r) => r.motoristaId === m.id));
  const toggle = (set: Set<string>, id: string, v: boolean) => {
    const n = new Set(set);
    if (v) n.add(id);
    else n.delete(id);
    return n;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rotas"
        description={<span className="capitalize">{formatDataExtenso(data)}</span>}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/70">
              {[
                { l: 'Hoje', v: hojeISO() },
                { l: 'Amanhã', v: amanhaISO() },
              ].map((o) => (
                <button
                  key={o.l}
                  onClick={() => trocarData(o.v)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium',
                    data === o.v ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <Input type="date" value={data} onChange={(e) => e.target.value && trocarData(e.target.value)} className="w-40" aria-label="Data das rotas" />
            {alterado && (
              <>
                <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={descartar} disabled={salvando}>
                  Descartar
                </Button>
                <Button icon={<Save className="h-4 w-4" />} onClick={salvar} loading={salvando}>
                  Salvar rotas
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Seleção para otimização */}
      <Card>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <button onClick={() => setPainelAberto((v) => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={painelAberto}>
            <ChevronDown className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform', painelAberto && 'rotate-180')} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Otimização automática</span>
              <span className="block text-xs text-slate-500">
                {selEntregas.size} de {d.disponiveis.length} entrega(s) · {selMotoristas.size} motorista(s) selecionado(s)
              </span>
            </span>
          </button>
          {!painelAberto && (
            <Button icon={<WandSparkles className="h-4 w-4" />} loading={otimizando} onClick={executarOtimizacao} disabled={!d.disponiveis.length}>
              Otimizar rotas
            </Button>
          )}
        </div>
        {painelAberto && (
          <div className="border-t border-slate-100 dark:border-slate-800">
            <div className="grid divide-y divide-slate-100 md:grid-cols-[1.4fr_1fr] md:divide-x md:divide-y-0 dark:divide-slate-800">
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Entregas do dia</p>
                  {d.disponiveis.length > 0 && (
                    <Checkbox
                      checked={selEntregas.size === d.disponiveis.length}
                      indeterminate={selEntregas.size > 0 && selEntregas.size < d.disponiveis.length}
                      onChange={(v) => setSelEntregas(new Set(v ? d.disponiveis.map((e) => e.id) : []))}
                      label={<span className="text-xs">Todas</span>}
                    />
                  )}
                </div>
                {d.disponiveis.length === 0 ? (
                  <EmptyState icon={<Package className="h-6 w-6" />} title="Nenhuma entrega pendente" description="Não há entregas pendentes para esta data." className="py-8" />
                ) : (
                  <ul className="scroll-thin max-h-72 space-y-0.5 overflow-y-auto pr-1">
                    {d.disponiveis.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <Checkbox checked={selEntregas.has(e.id)} onChange={(v) => setSelEntregas((s) => toggle(s, e.id, v))} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.cliente?.nome}</p>
                          <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                            {e.cliente?.latitude == null && <MapPinOff className="h-3 w-3 text-red-500" />}
                            {e.cliente?.bairro} · #{e.pedido?.numero} · {Math.round(d.pesoPorPedido[e.pedido_id] ?? 0)} kg
                          </p>
                        </div>
                        {e.status === 'reagendada' && <Badge tone="violet">Reagendada</Badge>}
                        {e.rota && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.rota.cor }} title="Já roteirizada" />}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Motoristas</p>
                <ul className="space-y-0.5">
                  {d.motoristas.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <Checkbox checked={selMotoristas.has(m.id)} onChange={(v) => setSelMotoristas((s) => toggle(s, m.id, v))} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.nome}</p>
                        <p className="truncate text-xs text-slate-500">
                          {m.veiculo ? `${m.veiculo.modelo} · ${m.veiculo.capacidade_kg ?? '—'} kg` : 'Sem veículo'}
                        </p>
                      </div>
                      <StatusBadge map={MOTORISTA_STATUS} value={m.status} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <p className="flex items-start gap-2 text-xs text-slate-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Agrupa por proximidade geográfica, equilibra o tempo entre motoristas e respeita a capacidade dos veículos. Partida:{' '}
                {empresa.partida_descricao}.
              </p>
              <Button icon={<WandSparkles className="h-4 w-4" />} loading={otimizando} onClick={executarOtimizacao} disabled={!d.disponiveis.length} className="shrink-0">
                Otimizar rotas
              </Button>
            </div>
          </div>
        )}
      </Card>

      {(avisos.length > 0 || semCoord.length > 0) && (
        <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {[...new Set([...avisos, ...(semCoord.length ? [`${semCoord.length} cliente(s) sem localização: revise o bairro no cadastro.`] : [])])].map((a) => (
            <p key={a} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {a}
            </p>
          ))}
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumo icon={<RouteIcon className="h-4 w-4" />} label="Rotas" valor={plano.rotas.filter((r) => r.paradas.length).length} />
        <Resumo icon={<Package className="h-4 w-4" />} label="Entregas roteirizadas" valor={`${totalParadas}/${totalParadas + plano.naoAtribuidas.length}`} />
        <Resumo icon={<Truck className="h-4 w-4" />} label="Distância total" valor={formatKm(totalKm)} />
        <Resumo icon={<Timer className="h-4 w-4" />} label="Maior jornada" valor={formatDuracao(maiorTempo)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(380px,1fr)_1.25fr]">
        <div className="order-2 space-y-4 xl:order-1">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragOver={onDragOver} onDragEnd={onDragEnd}>
            {plano.rotas.length === 0 && plano.naoAtribuidas.length === 0 && (
              <Card>
                <EmptyState icon={<RouteIcon className="h-6 w-6" />} title="Nada para planejar" description="Não há entregas para esta data." />
              </Card>
            )}
            {plano.rotas.map((r) => (
              <RotaCard
                key={r.motoristaId}
                rota={r}
                destinos={[...destinos]}
                destaque={destaque === r.motoristaId}
                onDestacar={() => setDestaque((x) => (x === r.motoristaId ? null : r.motoristaId))}
                onMover={(id, dest) => api.mover(d, id, dest)}
                onReordenar={(de, para) => api.reordenarDentro(d, r.motoristaId, de, para)}
                onOtimizarOrdem={() => api.otimizarOrdemRota(d, r.motoristaId)}
                onRemoverRota={() => api.removerRota(d, r.motoristaId)}
                onHoverParada={() => undefined}
              />
            ))}

            {(plano.naoAtribuidas.length > 0 || plano.rotas.length > 0) && (
              <Card>
                <CardHeader
                  title="Sem rota"
                  description={plano.naoAtribuidas.length ? 'Arraste para uma rota ou use "Adicionar…"' : 'Todas as entregas estão roteirizadas'}
                  action={<Badge>{plano.naoAtribuidas.length}</Badge>}
                />
                <div className="p-2">
                  <ListaDroppable id={POOL} itens={plano.naoAtribuidas.map((e) => e.id)} vazio="Solte aqui para remover da rota">
                    {plano.naoAtribuidas.map((e, i) => (
                      <ParadaItem
                        key={e.id}
                        e={e}
                        indice={i}
                        total={plano.naoAtribuidas.length}
                        cor={null}
                        bloqueada={false}
                        destinos={destinos}
                        container={POOL}
                        onMover={(dest) => api.mover(d, e.id, dest)}
                      />
                    ))}
                  </ListaDroppable>
                </div>
              </Card>
            )}
          </DndContext>

          {motoristasSemRota.length > 0 && (
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-slate-400" />
              <select
                value=""
                onChange={(e) => e.target.value && api.adicionarMotorista(d, e.target.value)}
                className="h-9 flex-1 rounded-lg border border-dashed border-slate-300 bg-transparent px-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"
                aria-label="Adicionar rota para motorista"
              >
                <option value="">Adicionar rota manual para um motorista…</option>
                {motoristasSemRota.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} ({MOTORISTA_STATUS[m.status].label})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="order-1 xl:order-2">
          <div className="xl:sticky xl:top-24">
            <Suspense fallback={<Skeleton className="h-[360px] w-full rounded-xl xl:h-[calc(100vh-8rem)]" />}>
              <RouteMap
                className="h-[360px] sm:h-[440px] xl:h-[calc(100vh-8rem)]"
                partida={{ lat: empresa.partida_lat, lng: empresa.partida_lng, titulo: empresa.partida_descricao }}
                rotas={mapa.rotas}
                avulsos={mapa.avulsos}
                destaque={destaque}
              />
            </Suspense>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {(['entregue', 'nao_entregue'] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <Badge tone={ENTREGA_STATUS[s].tone}>{ENTREGA_STATUS[s].label}</Badge>
                  {s === 'entregue' ? 'marcador esmaecido' : 'marcador “!”'}
                </span>
              ))}
              <span>Distâncias e tempos são estimativas.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Resumo({ icon, label, valor }: { icon: ReactNode; label: string; valor: ReactNode }) {
  return (
    <Card className="flex items-center gap-3 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-500">{label}</p>
        <p className="tabular truncate text-base font-semibold">{valor}</p>
      </div>
    </Card>
  );
}
