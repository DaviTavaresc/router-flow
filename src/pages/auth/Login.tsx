import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useSession } from '@/app/session';
import { rotaInicial } from '@/app/permissions';
import { Button, Field, Input } from '@/components/ui';
import { MODO_DEMO } from '@/services/data';
import { auth } from '@/services/auth';
import { AuthShell } from './AuthShell';

export default function Login() {
  const { entrar } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Primeiro acesso: sem nenhum usuário cadastrado, vai para a configuração inicial
  useEffect(() => {
    auth.precisaConfiguracaoInicial().then((precisa) => precisa && navigate('/primeiro-acesso', { replace: true }));
  }, [navigate]);

  const autenticar = async (e: string, s: string) => {
    setErro(null);
    if (!e.trim() || !s) {
      setErro('Informe e-mail e senha.');
      return;
    }
    setEnviando(true);
    try {
      const sessao = await entrar(e.trim(), s);
      const destino = (location.state as { from?: string } | null)?.from;
      const inicial = rotaInicial(sessao.usuario.perfil);
      // só respeita o "from" se for da mesma área do perfil
      const ok = destino && (sessao.usuario.perfil === 'motorista' ? destino.startsWith('/motorista') : !destino.startsWith('/motorista'));
      navigate(ok ? destino! : inicial, { replace: true });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  };

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    autenticar(email, senha);
  };

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Acesse sua conta para gerenciar as entregas.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <Field label="E-mail">
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com"
              leftIcon={<Mail className="h-4 w-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Senha">
          {(id) => (
            <div className="relative">
              <Input
                id={id}
                type={mostrar ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                leftIcon={<Lock className="h-4 w-4" />}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setMostrar((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:text-slate-600"
                aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </Field>
        <div className="flex justify-end">
          <Link to="/recuperar-senha" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
            Esqueceu a senha?
          </Link>
        </div>
        {erro && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {erro}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={enviando}>
          Entrar
        </Button>
      </form>

      {!MODO_DEMO && (
        <p className="mt-6 text-center text-sm text-slate-500">
          Nova empresa?{' '}
          <Link to="/primeiro-acesso" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Criar conta
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
