import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Button, Field, Input, Modal, MoneyInput, Textarea, Toggle } from '@/components/ui';
import { useAcao } from '@/app/hooks';
import { cn } from '@/lib/cn';
import { amanhaISO, hojeISO } from '@/lib/dates';
import { formatBRL } from '@/lib/format';
import { FORMA_PAGAMENTO, FORMAS_RECEBIMENTO_ENTREGA, MOTIVO_OCORRENCIA } from '@/lib/labels';
import { confirmarEntrega, registrarFalhaEntrega } from '@/services/api/entregas';
import type { EntregaView, FormaPagamento, MotivoOcorrencia } from '@/types';

const horaAgora = () => new Date().toTimeString().slice(0, 5);

function Opcao({ ativo, onClick, children, className }: { ativo: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'rounded-xl border px-3 py-3 text-sm font-medium transition-colors',
        ativo ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Confirmação de entrega com registro de recebimento (usado pelo motorista e pelo admin). */
export function ConfirmarEntregaModal({ entrega, onClose, onDone }: { entrega: EntregaView | null; onClose: () => void; onDone?: () => void }) {
  const [hora, setHora] = useState(horaAgora());
  const [obs, setObs] = useState('');
  const [receber, setReceber] = useState(false);
  const [valor, setValor] = useState(0);
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [erro, setErro] = useState('');
  const acao = useAcao(confirmarEntrega, {
    sucesso: 'Entrega confirmada',
    onSuccess: () => {
      onClose();
      onDone?.();
    },
  });

  useEffect(() => {
    if (!entrega) return;
    setHora(horaAgora());
    setObs('');
    setReceber(entrega.valor_receber > 0);
    setValor(entrega.valor_receber);
    setForma(null);
    setErro('');
  }, [entrega]);

  const confirmar = () => {
    if (!entrega) return;
    if (receber && valor > 0 && !forma) return setErro('Selecione a forma de recebimento.');
    const [h, m] = hora.split(':').map(Number);
    const dt = new Date();
    dt.setHours(h || 0, m || 0, 0, 0);
    acao.mutate({
      entrega_id: entrega.id,
      horario: dt.toISOString(),
      observacao: obs.trim(),
      valor_recebido: receber ? valor : 0,
      forma: receber && valor > 0 ? forma : null,
    });
  };

  return (
    <Modal
      open={!!entrega}
      onClose={onClose}
      persistent={acao.isPending}
      title="Confirmar entrega"
      description={entrega ? `${entrega.cliente?.nome} · Pedido #${entrega.pedido?.numero}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={acao.isPending}>
            Voltar
          </Button>
          <Button variant="success" size="lg" icon={<CheckCircle2 className="h-5 w-5" />} onClick={confirmar} loading={acao.isPending}>
            Confirmar entrega
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Horário">
            {(id) => <Input id={id} type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="tabular" />}
          </Field>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
            <p className="text-xs text-slate-500">Valor a receber</p>
            <p className="tabular text-lg font-semibold">{entrega && entrega.valor_receber > 0 ? formatBRL(entrega.valor_receber) : 'Nada a receber'}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Toggle checked={receber} onChange={setReceber} label={entrega?.valor_receber ? 'Recebi o pagamento' : 'Registrar um recebimento'} />
          {receber && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FORMAS_RECEBIMENTO_ENTREGA.map((f) => (
                  <Opcao key={f} ativo={forma === f} onClick={() => { setForma(f); setErro(''); }}>
                    {FORMA_PAGAMENTO[f]}
                  </Opcao>
                ))}
              </div>
              <Field label="Valor recebido" error={erro}>
                {(id) => <MoneyInput id={id} value={valor} onValueChange={setValor} />}
              </Field>
              {entrega && valor < entrega.valor_receber && valor > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">Recebimento parcial: o restante ficará em aberto no financeiro.</p>
              )}
            </>
          )}
        </div>

        <Field label="Observação">
          {(id) => <Textarea id={id} rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: recebido pelo porteiro" />}
        </Field>
      </div>
    </Modal>
  );
}

const MOTIVOS = Object.keys(MOTIVO_OCORRENCIA) as MotivoOcorrencia[];

/** Registro de entrega não realizada, com motivo e reagendamento opcional. */
export function FalhaEntregaModal({ entrega, onClose, onDone }: { entrega: EntregaView | null; onClose: () => void; onDone?: () => void }) {
  const [motivo, setMotivo] = useState<MotivoOcorrencia | null>(null);
  const [obs, setObs] = useState('');
  const [reagendar, setReagendar] = useState(true);
  const [data, setData] = useState(amanhaISO());
  const [erro, setErro] = useState('');
  const acao = useAcao(registrarFalhaEntrega, {
    sucesso: 'Ocorrência registrada',
    onSuccess: () => {
      onClose();
      onDone?.();
    },
  });

  useEffect(() => {
    if (!entrega) return;
    setMotivo(null);
    setObs('');
    setReagendar(true);
    setData(amanhaISO());
    setErro('');
  }, [entrega]);

  const salvar = () => {
    if (!entrega) return;
    if (!motivo) return setErro('Selecione o motivo.');
    if (motivo === 'outro' && !obs.trim()) return setErro('Descreva o motivo na observação.');
    if (reagendar && (!data || data < hojeISO())) return setErro('Escolha uma data válida para o reagendamento.');
    acao.mutate({ entrega_id: entrega.id, motivo, observacao: obs.trim(), reagendar_para: reagendar ? data : null });
  };

  return (
    <Modal
      open={!!entrega}
      onClose={onClose}
      persistent={acao.isPending}
      title="Não foi possível entregar"
      description={entrega ? `${entrega.cliente?.nome} · Pedido #${entrega.pedido?.numero}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={acao.isPending}>
            Voltar
          </Button>
          <Button variant="danger" size="lg" icon={<CircleAlert className="h-5 w-5" />} onClick={salvar} loading={acao.isPending}>
            Registrar ocorrência
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Motivo</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {MOTIVOS.map((m) => (
              <Opcao key={m} ativo={motivo === m} onClick={() => { setMotivo(m); setErro(''); }} className="text-left">
                {MOTIVO_OCORRENCIA[m]}
              </Opcao>
            ))}
          </div>
        </div>
        <Field label="Observação" required={motivo === 'outro'}>
          {(id) => <Textarea id={id} rows={2} value={obs} onChange={(e) => { setObs(e.target.value); setErro(''); }} />}
        </Field>
        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <Toggle checked={reagendar} onChange={setReagendar} label="Reagendar entrega" />
          {reagendar && (
            <Field label="Nova data">
              {(id) => <Input id={id} type="date" min={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} />}
            </Field>
          )}
        </div>
        {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}
      </div>
    </Modal>
  );
}
