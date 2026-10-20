import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui';

/**
 * Mutação padrão do app: exibe toast de sucesso/erro e invalida o cache
 * (todas as telas se atualizam — dashboard, financeiro, rotas...).
 */
export function useAcao<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { sucesso?: string | ((r: TResult) => string); erro?: string; invalidar?: QueryKey[]; onSuccess?: (r: TResult) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      if (opts.invalidar) await Promise.all(opts.invalidar.map((k) => qc.invalidateQueries({ queryKey: k })));
      else await qc.invalidateQueries();
      if (opts.sucesso) toast.success(typeof opts.sucesso === 'function' ? opts.sucesso(r) : opts.sucesso);
      opts.onSuccess?.(r);
    },
    onError: (e) => toast.fromError(e, opts.erro ?? 'Não foi possível concluir a operação'),
  });
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return m;
}
