import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck, Mail } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { auth } from '@/services/auth';
import { AuthShell } from './AuthShell';

export default function RecuperarSenha() {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ linkDemo?: string } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro('Informe um e-mail válido.');
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      setEnviado(await auth.solicitarRecuperacao(email.trim()));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AuthShell>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> Voltar para o login
      </Link>
      {enviado ? (
        <div>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
            <MailCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Verifique seu e-mail</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Se houver uma conta para <strong>{email}</strong>, você receberá um link para redefinir a senha.
          </p>
          {enviado.linkDemo && (
            <div className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              Modo local: não há envio real de e-mail.{' '}
              <Link to={enviado.linkDemo} className="font-medium underline">
                Abrir link de redefinição
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Recuperar senha</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Informe seu e-mail e enviaremos um link para criar uma nova senha.</p>
          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            <Field label="E-mail" error={erro}>
              {(id) => (
                <Input id={id} type="email" leftIcon={<Mail className="h-4 w-4" />} value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!erro} />
              )}
            </Field>
            <Button type="submit" className="w-full" size="lg" loading={enviando}>
              Enviar link
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
