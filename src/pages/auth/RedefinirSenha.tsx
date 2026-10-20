import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button, Field, Input, useToast } from '@/components/ui';
import { auth } from '@/services/auth';
import { AuthShell } from './AuthShell';

export default function RedefinirSenha() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) return setErro('A senha deve ter ao menos 6 caracteres.');
    if (senha !== confirmacao) return setErro('As senhas não conferem.');
    setErro(null);
    setEnviando(true);
    try {
      await auth.redefinirSenha(senha, params.get('token'));
      toast.success('Senha redefinida', 'Entre com sua nova senha.');
      await auth.sair();
      navigate('/login', { replace: true });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Criar nova senha</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Escolha uma senha com pelo menos 6 caracteres.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <Field label="Nova senha">
          {(id) => <Input id={id} type="password" leftIcon={<Lock className="h-4 w-4" />} value={senha} onChange={(e) => setSenha(e.target.value)} />}
        </Field>
        <Field label="Confirmar senha" error={erro}>
          {(id) => (
            <Input id={id} type="password" leftIcon={<Lock className="h-4 w-4" />} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} invalid={!!erro} />
          )}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={enviando}>
          Salvar nova senha
        </Button>
      </form>
    </AuthShell>
  );
}
