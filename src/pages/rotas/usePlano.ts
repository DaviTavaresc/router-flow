import { useCallback, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { novaRotaVazia, recalcular, reordenar, type DadosPlanejamento, type Plano, type PlanoRota } from '@/services/api/planejamento';
import type { EntregaView } from '@/types';

export const POOL = '__pool';

/** Estado do rascunho do plano de rotas + operações de edição manual. */
export function usePlano() {
  const [plano, setPlanoState] = useState<Plano | null>(null);
  const [alterado, setAlterado] = useState(false);

  const definir = useCallback((p: Plano | null, marcarAlterado = false) => {
    setPlanoState(p);
    setAlterado(marcarAlterado);
  }, []);

  /** Aplica uma transformação e recalcula as rotas editáveis */
  const editar = useCallback((d: DadosPlanejamento, fn: (p: Plano) => Plano) => {
    setPlanoState((atual) => {
      if (!atual) return atual;
      const novo = fn(atual);
      return { ...novo, rotas: novo.rotas.map((r) => (r.bloqueada ? r : recalcular(r, d))) };
    });
    setAlterado(true);
  }, []);

  const containerDe = useCallback(
    (p: Plano, id: string): string | null => {
      if (id === POOL || p.rotas.some((r) => r.motoristaId === id)) return id;
      if (p.naoAtribuidas.some((e) => e.id === id)) return POOL;
      return p.rotas.find((r) => r.paradas.some((x) => x.id === id))?.motoristaId ?? null;
    },
    [],
  );

  /** Move uma parada para outra rota (ou para "sem rota") na posição indicada */
  const mover = useCallback(
    (d: DadosPlanejamento, entregaId: string, destino: string, indice?: number) =>
      editar(d, (p) => {
        const origem = containerDe(p, entregaId);
        if (!origem) return p;
        let item: EntregaView | undefined;
        const semItem = (lista: EntregaView[]) => {
          const i = lista.findIndex((e) => e.id === entregaId);
          if (i < 0) return lista;
          item = lista[i];
          return lista.filter((_, k) => k !== i);
        };
        let rotas = p.rotas.map((r) => (r.motoristaId === origem ? { ...r, paradas: semItem(r.paradas) } : r));
        let pool = origem === POOL ? semItem(p.naoAtribuidas) : p.naoAtribuidas;
        if (!item) return p;
        const inserir = (lista: EntregaView[]) => {
          const l = [...lista];
          l.splice(indice ?? l.length, 0, item!);
          return l;
        };
        if (destino === POOL) pool = inserir(pool);
        else rotas = rotas.map((r) => (r.motoristaId === destino ? { ...r, paradas: inserir(r.paradas) } : r));
        return { ...p, rotas, naoAtribuidas: pool };
      }),
    [editar, containerDe],
  );

  const reordenarDentro = useCallback(
    (d: DadosPlanejamento, motoristaId: string, de: number, para: number) =>
      editar(d, (p) => ({
        ...p,
        rotas: p.rotas.map((r) => (r.motoristaId === motoristaId ? { ...r, paradas: arrayMove(r.paradas, de, para) } : r)),
      })),
    [editar],
  );

  const otimizarOrdemRota = useCallback(
    (d: DadosPlanejamento, motoristaId: string) =>
      editar(d, (p) => ({ ...p, rotas: p.rotas.map((r) => (r.motoristaId === motoristaId ? reordenar(r, d) : r)) })),
    [editar],
  );

  const adicionarMotorista = useCallback(
    (d: DadosPlanejamento, motoristaId: string) =>
      editar(d, (p) => {
        if (p.rotas.some((r) => r.motoristaId === motoristaId)) return p;
        const r = novaRotaVazia(motoristaId, d);
        return r ? { ...p, rotas: [...p.rotas, r] } : p;
      }),
    [editar],
  );

  const removerRota = useCallback(
    (d: DadosPlanejamento, motoristaId: string) =>
      editar(d, (p) => {
        const r = p.rotas.find((x) => x.motoristaId === motoristaId);
        if (!r || r.bloqueada) return p;
        return { ...p, rotas: p.rotas.filter((x) => x !== r), naoAtribuidas: [...p.naoAtribuidas, ...r.paradas] };
      }),
    [editar],
  );

  return { plano, alterado, definir, mover, reordenarDentro, otimizarOrdemRota, adicionarMotorista, removerRota, containerDe, setPlanoBruto: setPlanoState };
}

export type PlanoApi = ReturnType<typeof usePlano>;
export type { PlanoRota };
