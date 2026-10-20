import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth, type ConfiguracaoInicial, type Sessao } from '@/services/auth';
import type { Empresa } from '@/types';
import { useToast } from '@/components/ui';

interface SessionApi {
  sessao: Sessao | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<Sessao>;
  configurarInicial: (dados: ConfiguracaoInicial) => Promise<Sessao>;
  sair: () => Promise<void>;
  atualizarEmpresa: (e: Empresa) => void;
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    auth
      .restaurar()
      .then(setSessao)
      .finally(() => setCarregando(false));
  }, []);

  const sair = useCallback(async () => {
    await auth.sair();
    qc.clear();
    setSessao(null);
  }, [qc]);

  // Controle de sessão: encerra automaticamente quando expira
  useEffect(() => {
    if (!sessao) return;
    const t = setInterval(() => {
      if (new Date(sessao.expiraEm).getTime() < Date.now()) {
        sair();
        toast.info('Sessão expirada', 'Faça login novamente para continuar.');
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [sessao, sair, toast]);

  const entrar = useCallback(
    async (email: string, senha: string) => {
      const s = await auth.entrar(email, senha);
      qc.clear();
      setSessao(s);
      return s;
    },
    [qc],
  );

  const configurarInicial = useCallback(
    async (dados: ConfiguracaoInicial) => {
      const s = await auth.configurarInicial(dados);
      qc.clear();
      setSessao(s);
      return s;
    },
    [qc],
  );

  const atualizarEmpresa = useCallback((empresa: Empresa) => setSessao((s) => (s ? { ...s, empresa } : s)), []);

  const value = useMemo(
    () => ({ sessao, carregando, entrar, configurarInicial, sair, atualizarEmpresa }),
    [sessao, carregando, entrar, configurarInicial, sair, atualizarEmpresa],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession fora do SessionProvider');
  return ctx;
}

/** Sessão garantida (usar apenas dentro de rotas protegidas) */
export function useSessao(): Sessao {
  const { sessao } = useSession();
  if (!sessao) throw new Error('Sessão ausente');
  return sessao;
}
