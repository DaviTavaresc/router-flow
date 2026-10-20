import type { CSSProperties, ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, Lock, MapPinOff, Package, Route as RouteIcon, Shuffle, Timer, Trash2, Weight, X } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDuracao, formatKm } from '@/lib/format';
import { ENTREGA_STATUS, ROTA_STATUS } from '@/lib/labels';
import type { PlanoRota } from '@/services/api/planejamento';
import type { EntregaView } from '@/types';
import { POOL } from './usePlano';

interface DestinoOpcao {
  id: string;
  nome: string;
}

interface ParadaProps {
  e: EntregaView;
  indice: number;
  total: number;
  cor: string | null;
  bloqueada: boolean;
  trechoKm?: number;
  destinos: DestinoOpcao[];
  container: string;
  onMover: (destino: string) => void;
  onSubir?: () => void;
  onDescer?: () => void;
  onHover?: (id: string | null) => void;
}

export function ParadaItem({ e, indice, total, cor, bloqueada, trechoKm, destinos, container, onMover, onSubir, onDescer, onHover }: ParadaProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: e.id, disabled: bloqueada });
  const semCoord = e.cliente?.latitude == null;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onMouseEnter={() => onHover?.(e.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        'group flex items-center gap-2 rounded-lg border border-transparent bg-white px-2 py-2 dark:bg-slate-900',
        isDragging ? 'z-10 border-brand-300 shadow-lg ring-2 ring-brand-500/20' : 'hover:border-slate-200 dark:hover:border-slate-700',
      )}
    >
      {!bloqueada ? (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:bg-slate-800"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="w-6" />
      )}
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
          cor ? 'text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
        )}
        style={cor ? { background: cor } : undefined}
      >
        {cor ? indice + 1 : '•'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{e.cliente?.nome}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
          {semCoord && <MapPinOff className="h-3 w-3 text-red-500" />}
          {e.cliente?.bairro} · #{e.pedido?.numero}
          {trechoKm != null && cor && <span className="tabular">· +{formatKm(trechoKm)}</span>}
        </p>
      </div>
      {bloqueada ? (
        <Badge tone={ENTREGA_STATUS[e.status].tone} dot={false} className="text-[10px]">
          {ENTREGA_STATUS[e.status].label}
        </Badge>
      ) : (
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          {onSubir && (
            <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={onSubir} disabled={indice === 0} aria-label="Subir">
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDescer && (
            <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={onDescer} disabled={indice === total - 1} aria-label="Descer">
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          )}
          <select
            aria-label="Mover para"
            value=""
            onChange={(ev) => ev.target.value && onMover(ev.target.value)}
            className="h-7 max-w-[92px] rounded-md border border-slate-200 bg-white px-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="">{container === POOL ? 'Adicionar…' : 'Mover…'}</option>
            {destinos
              .filter((d) => d.id !== container)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
          </select>
          {container !== POOL && (
            <Button variant="ghost" size="icon-sm" className="h-7 w-7 hover:text-red-600" onClick={() => onMover(POOL)} aria-label="Remover da rota">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function ListaDroppable({ id, itens, children, vazio }: { id: string; itens: string[]; children: ReactNode; vazio: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <SortableContext id={id} items={itens} strategy={verticalListSortingStrategy}>
      <ul
        ref={setNodeRef}
        className={cn('min-h-14 space-y-1 rounded-lg p-1 transition-colors', isOver && 'bg-brand-50 ring-2 ring-dashed ring-brand-300 dark:bg-brand-500/10')}
      >
        {children}
        {itens.length === 0 && <li className="flex h-12 items-center justify-center text-xs text-slate-400">{vazio}</li>}
      </ul>
    </SortableContext>
  );
}

export function RotaCard({
  rota,
  destinos,
  destaque,
  onDestacar,
  onMover,
  onReordenar,
  onOtimizarOrdem,
  onRemoverRota,
  onHoverParada,
}: {
  rota: PlanoRota;
  destinos: DestinoOpcao[];
  destaque: boolean;
  onDestacar: () => void;
  onMover: (entregaId: string, destino: string) => void;
  onReordenar: (de: number, para: number) => void;
  onOtimizarOrdem: () => void;
  onRemoverRota: () => void;
  onHoverParada: (id: string | null) => void;
}) {
  const excede = rota.capacidadeKg != null && rota.cargaKg > rota.capacidadeKg;
  return (
    <Card className={cn('overflow-hidden transition-shadow', destaque && 'ring-2 ring-offset-0')} style={destaque ? ({ '--tw-ring-color': rota.cor } as CSSProperties) : undefined}>
      <div className="h-1" style={{ background: rota.cor }} />
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3">
        <button onClick={onDestacar} className="flex min-w-0 items-center gap-2 text-left" title="Destacar no mapa">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: rota.cor }} />
          <span className="truncate font-semibold text-slate-900 dark:text-white">{rota.nome.replace(/^Rota /, '')}</span>
          {rota.bloqueada ? (
            <Badge tone={rota.status === 'concluida' ? 'green' : 'amber'}>
              <Lock className="h-3 w-3" /> {rota.status !== 'rascunho' ? ROTA_STATUS[rota.status].label : ''}
            </Badge>
          ) : rota.status === 'planejada' ? (
            <Badge tone="blue">Salva</Badge>
          ) : (
            <Badge tone="violet">Rascunho</Badge>
          )}
        </button>
        {!rota.bloqueada && (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onOtimizarOrdem} title="Reotimizar ordem das paradas" aria-label="Reotimizar ordem" disabled={rota.paradas.length < 3}>
              <Shuffle className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onRemoverRota} title="Remover rota (entregas voltam para 'sem rota')" aria-label="Remover rota" className="hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 pt-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Package className="h-3.5 w-3.5" /> <span className="tabular">{rota.paradas.length}</span> entregas
        </span>
        <span className="inline-flex items-center gap-1">
          <RouteIcon className="h-3.5 w-3.5" /> <span className="tabular">{formatKm(rota.distanciaKm)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Timer className="h-3.5 w-3.5" /> <span className="tabular">{formatDuracao(rota.tempoMin)}</span>
        </span>
        <span className={cn('inline-flex items-center gap-1', excede && 'font-medium text-red-600')}>
          <Weight className="h-3.5 w-3.5" />
          <span className="tabular">
            {Math.round(rota.cargaKg)}
            {rota.capacidadeKg != null && `/${rota.capacidadeKg}`} kg
          </span>
          {excede && '· acima da capacidade'}
        </span>
      </div>
      <div className="border-t border-slate-100 p-2 dark:border-slate-800">
        <ListaDroppable id={rota.motoristaId} itens={rota.paradas.map((p) => p.id)} vazio="Arraste entregas para esta rota">
          {rota.paradas.map((p, i) => (
            <ParadaItem
              key={p.id}
              e={p}
              indice={i}
              total={rota.paradas.length}
              cor={rota.cor}
              bloqueada={rota.bloqueada}
              trechoKm={rota.trechos[i]?.distanciaKm}
              destinos={destinos}
              container={rota.motoristaId}
              onMover={(dest) => onMover(p.id, dest)}
              onSubir={() => onReordenar(i, i - 1)}
              onDescer={() => onReordenar(i, i + 1)}
              onHover={onHoverParada}
            />
          ))}
        </ListaDroppable>
      </div>
    </Card>
  );
}
