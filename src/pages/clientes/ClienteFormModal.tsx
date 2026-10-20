import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessao } from '@/app/session';
import { Button, Field, Input, Modal, Select, useToast } from '@/components/ui';
import { isTelefoneValido, maskTelefone } from '@/lib/format';
import { UFS } from '@/lib/labels';
import { listarClientes, salvarCliente, type ClienteForm } from '@/services/api/clientes';
import type { Cliente } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  cliente?: Cliente | null;
  onSaved?: (c: Cliente) => void;
}

/**
 * Cadastro de cliente propositalmente simples: Nome, Telefone, Bairro, Cidade e Estado.
 * A geolocalização é calculada automaticamente (dado técnico, não exibido).
 */
export function ClienteFormModal({ open, onClose, cliente, onSaved }: Props) {
  const { empresa } = useSessao();
  const toast = useToast();
  const qc = useQueryClient();
  const vazio: ClienteForm = { nome: '', telefone: '', bairro: '', cidade: empresa.cidade, estado: empresa.estado };
  const [form, setForm] = useState<ClienteForm>(vazio);
  const [erros, setErros] = useState<Partial<Record<keyof ClienteForm, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const clientes = useQuery({ queryKey: ['clientes'], queryFn: listarClientes, enabled: open });

  useEffect(() => {
    if (open) {
      setForm(cliente ? { nome: cliente.nome, telefone: cliente.telefone, bairro: cliente.bairro, cidade: cliente.cidade, estado: cliente.estado } : vazio);
      setErros({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cliente]);

  const bairros = useMemo(() => [...new Set((clientes.data ?? []).map((c) => c.bairro))].sort(), [clientes.data]);
  const cidades = useMemo(() => [...new Set((clientes.data ?? []).map((c) => c.cidade))].sort(), [clientes.data]);

  const set = <K extends keyof ClienteForm>(k: K, v: ClienteForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErros((e) => ({ ...e, [k]: undefined }));
  };

  const validar = () => {
    const e: typeof erros = {};
    if (form.nome.trim().length < 3) e.nome = 'Informe o nome (mínimo 3 caracteres).';
    if (!isTelefoneValido(form.telefone)) e.telefone = 'Telefone inválido.';
    if (!form.bairro.trim()) e.bairro = 'Informe o bairro.';
    if (!form.cidade.trim()) e.cidade = 'Informe a cidade.';
    if (!form.estado) e.estado = 'Selecione o estado.';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validar()) return;
    setSalvando(true);
    try {
      const salvo = await salvarCliente(cliente?.id ?? null, form);
      await qc.invalidateQueries();
      if (salvo.geo_precisao === 'pendente') {
        toast.info('Cliente salvo', 'Não foi possível localizar o bairro. Ele ficará fora da otimização de rotas até ser localizado.');
      } else {
        toast.success(cliente ? 'Cliente atualizado' : 'Cliente cadastrado');
      }
      onSaved?.(salvo);
      onClose();
    } catch (err) {
      toast.fromError(err, 'Não foi possível salvar o cliente');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent={salvando}
      title={cliente ? 'Editar cliente' : 'Novo cliente'}
      description="Cadastro rápido — a localização é identificada automaticamente pelo bairro."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form="form-cliente" loading={salvando}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="form-cliente" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Nome" required error={erros.nome} className="sm:col-span-2">
          {(id) => <Input id={id} value={form.nome} onChange={(e) => set('nome', e.target.value)} invalid={!!erros.nome} placeholder="Nome do cliente ou estabelecimento" />}
        </Field>
        <Field label="Telefone" required error={erros.telefone} className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              inputMode="tel"
              value={form.telefone}
              onChange={(e) => set('telefone', maskTelefone(e.target.value))}
              invalid={!!erros.telefone}
              placeholder="(00) 00000-0000"
            />
          )}
        </Field>
        <Field label="Bairro" required error={erros.bairro} className="sm:col-span-2">
          {(id) => (
            <>
              <Input id={id} list="rf-bairros" value={form.bairro} onChange={(e) => set('bairro', e.target.value)} invalid={!!erros.bairro} autoComplete="off" />
              <datalist id="rf-bairros">
                {bairros.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Cidade" required error={erros.cidade}>
          {(id) => (
            <>
              <Input id={id} list="rf-cidades" value={form.cidade} onChange={(e) => set('cidade', e.target.value)} invalid={!!erros.cidade} />
              <datalist id="rf-cidades">
                {cidades.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Estado" required error={erros.estado}>
          {(id) => (
            <Select id={id} value={form.estado} onChange={(e) => set('estado', e.target.value)} invalid={!!erros.estado}>
              <option value="">Selecione</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Modal>
  );
}
