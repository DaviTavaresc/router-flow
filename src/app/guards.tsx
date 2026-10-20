import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import type { Perfil } from '@/types';
import { EmptyState, Spinner } from '@/components/ui';
import { podeAcessar, rotaInicial, type Modulo } from './permissions';
import { useSession } from './session';

export function TelaCarregando() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

/** Exige sessão; opcionalmente restringe por perfil (redireciona para a área correta). */
export function RequireAuth({ perfis, children }: { perfis?: Perfil[]; children: ReactNode }) {
  const { sessao, carregando } = useSession();
  const location = useLocation();
  if (carregando) return <TelaCarregando />;
  if (!sessao) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (perfis && !perfis.includes(sessao.usuario.perfil)) return <Navigate to={rotaInicial(sessao.usuario.perfil)} replace />;
  return <>{children}</>;
}

/** Restringe uma página a um módulo permitido ao perfil */
export function RequireModulo({ modulo, children }: { modulo: Modulo; children: ReactNode }) {
  const { sessao } = useSession();
  if (!podeAcessar(sessao?.usuario.perfil, modulo)) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-6 w-6" />}
        title="Acesso restrito"
        description="Seu perfil não tem permissão para acessar este módulo. Fale com o administrador."
      />
    );
  }
  return <>{children}</>;
}

/** Páginas públicas (login): se já estiver logado, vai para a home do perfil */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { sessao, carregando } = useSession();
  if (carregando) return <TelaCarregando />;
  if (sessao) return <Navigate to={rotaInicial(sessao.usuario.perfil)} replace />;
  return <>{children}</>;
}
