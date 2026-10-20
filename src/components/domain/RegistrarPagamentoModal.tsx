import { useEffect, useState } from 'react';
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea } from '@/components/ui';
import { useAcao } from '@/app/hooks';
import { hojeISO } from '@/lib/dates';
import { formatBRL, formatData, round2 } from '@/lib/format';
import { FORMA_PAGAMENTO } from '@/lib/labels';
import { registrarPagamento } from '@/services/api/financeiro';
import type { FormaPagamento, Parcela } from '@/types';

/** Registro manual de pagamento de uma parcela (aceita pagamento parcial). */
export function RegistrarPagamentoModal({
  parcela,
  contexto,
  onClose,
}: {
  parcela: Parcela | null;
  contexto?: string;
  onClose: () => void;
}) {
  const saldo = parcela ? round2(parcela.valor - parcela.valor_pago) : 0;
  const [valor, setValor] = useState(saldo);
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const acao = useAcao(registrarPagamento, { sucesso: 'Pagamento registrado', onSuccess: onClose });

  useEffect(() => {
    if (parcela) {
      setValor(round2(parcela.valor - parcela.valor_pago));
      setForma(parcela.forma_pagamento && parcela.forma_pagamento !== 'cartao' ? parcela.forma_pagamento : 'pix');
      setData(hojeISO());
      setObs('');
      setErro('');
    }
  }, [parcela]);

  const salvar = () => {
    if (valor <= 0 || valor > saldo + 0.009) return setErro(`Informe um valor entre R$ 0,01 e ${formatBRL(saldo)}.`);
    if (!data) return setErro('Informe a data do pagamento.');
    acao.mutate({ parcela_id: parcela!.id, valor, forma, data, observacao: obs.trim() });
  };

  return (
    <Modal
      open={!!parcela}
      onClose={onClose}
      persistent={acao.isPending}
      size="sm"
      title="Registrar pagamento"
      description={parcela && `${contexto ? `${contexto} · ` : ''}Parcela ${parcela.numero}/${parcela.total_parcelas} · vence ${formatData(parcela.vencimento)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={acao.isPending}>
            Cancelar
          </Button>
          <Button variant="success" onClick={salvar} loading={acao.isPending}>
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/60">
          <span className="text-slate-500">Saldo da parcela</span>
          <span className="tabular font-semibold">{formatBRL(saldo)}</span>
        </div>
        <Field label="Valor recebido" error={erro} hint={valor < saldo ? 'Pagamento parcial: a parcela continuará pendente.' : undefined}>
          {(id) => <MoneyInput id={id} value={valor} onValueChange={(v) => { setValor(v); setErro(''); }} invalid={!!erro} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Forma">
            {(id) => (
              <Select id={id} value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
                {(['pix', 'dinheiro', 'debito', 'credito', 'boleto', 'outro'] as FormaPagamento[]).map((f) => (
                  <option key={f} value={f}>
                    {FORMA_PAGAMENTO[f]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Data">
            {(id) => <Input id={id} type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} />}
          </Field>
        </div>
        <Field label="Observação">
          {(id) => <Textarea id={id} rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}
