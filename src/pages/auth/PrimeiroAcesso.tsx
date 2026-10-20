import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Lock, Mail, MailCheck, User } from 'lucide-react';
import { useSession } from '@/app/session';
import { Button, Field, Input, Select, useToast } from '@/components/ui';
import { UFS } from '@/lib/labels';
import { auth, ConfirmacaoEmailPendente, type ConfiguracaoInicial } from '@/services/auth';
import { MODO_DEMO } from '@/services/data';
import { AuthShell } from './AuthShell';

/** Primeiro acesso: cria a empresa e o administrador principal. */
export default function PrimeiroAcesso() {
  const { configurarInicial } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState<ConfiguracaoInicial & { confirmacao: string }>({
    empresa: '',
    cidade: '',
    estado: '',
    bairroPartida: '',
    nome: '',
    email: '',
    senha: '',
    confirmacao: '',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [confirmarEmail, setConfirmarEmail] = useState(false);

  // No modo local, só faz sentido enquanto não houver nenhum usuário
  useEffect(() => {
    if (MODO_DEMO) auth.precisaConfiguracaoInicial().then((precisa) => !precisa && navigate('/login', { replace: true }));
  }, [navigate]);

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErros((e) => ({ ...e, [k]: '' }));
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!form.empresa.trim()) e.empresa = 'Informe o nome da empresa.';
    if (!form.cidade.trim()) e.cidade = 'Informe a cidade.';
    if (!form.estado) e.estado = 'Selecione o estado.';
    if (form.nome.trim().length < 3) e.nome = 'Informe o seu nome.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Informe um e-mail válido.';
    if (form.senha.length < 6) e.senha = 'Mínimo de 6 caracteres.';
    else if (form.senha !== form.confirmacao) e.confirmacao = 'As senhas não conferem.';
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const { confirmacao: _c, ...dados } = form;
      await configurarInicial(dados);
      toast.success('Tudo pronto!', 'Agora cadastre seus usuários, motoristas e clientes.');
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ConfirmacaoEmailPendente) setConfirmarEmail(true);
      else toast.fromError(err, 'Não foi possível concluir');
    } finally {
      setEnviando(false);
    }
  };

  if (confirmarEmail) {
    return (
      <AuthShell>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
          <MailCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Confirme seu e-mail</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Enviamos um link para <strong>{form.email}</strong>. Depois de confirmar, faça login: a empresa
          <strong> {form.empresa}</strong> será criada automaticamente.
        </p>
        <Link to="/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          Ir para o login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Configuração inicial</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Cadastre sua empresa e o administrador principal do sistema.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Empresa</p>
        <Field label="Nome da empresa" required error={erros.empresa}>
          {(id) => <Input id={id} leftIcon={<Building2 className="h-4 w-4" />} value={form.empresa} onChange={(e) => set('empresa', e.target.value)} invalid={!!erros.empresa} />}
        </Field>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <Field label="Cidade" required error={erros.cidade}>
            {(id) => <Input id={id} value={form.cidade} onChange={(e) => set('cidade', e.target.value)} invalid={!!erros.cidade} />}
          </Field>
          <Field label="UF" required error={erros.estado}>
            {(id) => (
              <Select id={id} value={form.estado} onChange={(e) => set('estado', e.target.value)} invalid={!!erros.estado}>
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Bairro de saída das entregas" hint="Depósito ou loja de onde os motoristas saem. Pode ajustar depois em Configurações.">
          {(id) => <Input id={id} value={form.bairroPartida} onChange={(e) => set('bairroPartida', e.target.value)} />}
        </Field>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Administrador</p>
        <Field label="Seu nome" required error={erros.nome}>
          {(id) => <Input id={id} leftIcon={<User className="h-4 w-4" />} value={form.nome} onChange={(e) => set('nome', e.target.value)} invalid={!!erros.nome} />}
        </Field>
        <Field label="E-mail" required error={erros.email}>
          {(id) => <Input id={id} type="email" autoComplete="email" leftIcon={<Mail className="h-4 w-4" />} value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!erros.email} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Senha" required error={erros.senha}>
            {(id) => <Input id={id} type="password" autoComplete="new-password" leftIcon={<Lock className="h-4 w-4" />} value={form.senha} onChange={(e) => set('senha', e.target.value)} invalid={!!erros.senha} />}
          </Field>
          <Field label="Confirmar senha" required error={erros.confirmacao}>
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={form.confirmacao} onChange={(e) => set('confirmacao', e.target.value)} invalid={!!erros.confirmacao} />}
          </Field>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={enviando}>
          Criar empresa e entrar
        </Button>
        {!MODO_DEMO && (
          <p className="text-center text-sm text-slate-500">
            Já tem conta?{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:underline">
              Entrar
            </Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
}
