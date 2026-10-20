import { useEffect, useState } from 'react';
import { Button, Field, Input, Modal } from '@/components/ui';
import { amanhaISO, hojeISO } from '@/lib/dates';

/** Modal simples para escolher uma data (gerar entrega, reagendar...). */
export function EscolherDataModal({
  open,
  titulo,
  descricao,
  rotulo = 'Data',
  confirmar = 'Confirmar',
  carregando,
  onClose,
  onConfirm,
}: {
  open: boolean;
  titulo: string;
  descricao?: string;
  rotulo?: string;
  confirmar?: string;
  carregando?: boolean;
  onClose: () => void;
  onConfirm: (data: string) => void;
}) {
  const [data, setData] = useState(amanhaISO());
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (open) {
      setData(amanhaISO());
      setErro('');
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      persistent={carregando}
      title={titulo}
      description={descricao}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={carregando}>
            Cancelar
          </Button>
          <Button
            loading={carregando}
            onClick={() => {
              if (!data || data < hojeISO()) return setErro('Escolha hoje ou uma data futura.');
              onConfirm(data);
            }}
          >
            {confirmar}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { l: 'Hoje', d: hojeISO() },
            { l: 'Amanhã', d: amanhaISO() },
          ].map((o) => (
            <Button key={o.l} size="sm" variant={data === o.d ? 'primary' : 'outline'} onClick={() => setData(o.d)}>
              {o.l}
            </Button>
          ))}
        </div>
        <Field label={rotulo} error={erro}>
          {(id) => <Input id={id} type="date" min={hojeISO()} value={data} onChange={(e) => { setData(e.target.value); setErro(''); }} invalid={!!erro} />}
        </Field>
      </div>
    </Modal>
  );
}
