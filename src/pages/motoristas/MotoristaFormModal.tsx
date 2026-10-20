import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Input, Modal, Select } from '@/components/ui';
import { useAcao } from '@/app/hooks';
import { isCPFValido, isTelefoneValido, maskCPF, maskPlaca, maskTelefone } from '@/lib/format';
import { MOTORISTA_STATUS } from '@/lib/labels';
import { listarUsuarios } from '@/services/api/empresa';
import { salvarMotorista, type MotoristaForm, type MotoristaLista } from '@/services/api/motoristas';
import type { MotoristaStatus } from '@/types';

const VAZIO: MotoristaForm = {
  nome: '',
  telefone: '',
  email: '',
  cpf: '',
  status: 'disponivel',
  usuario_id: null,
  veiculo_tipo: 'Utilitário',
  veiculo_modelo: '',
  veiculo_placa: '',
  veiculo_capacidade: null,
};

export function MotoristaFormModal({ open, motorista, onClose }: { open: boolean; motorista: MotoristaLista | null; onClose: () => void }) {
  const [form, setForm] = useState<MotoristaForm>(VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof MotoristaForm, string>>>({});
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: listarUsuarios, enabled: open });
  const salvar = useAcao((f: MotoristaForm) => salvarMotorista(motorista?.id ?? null, f), {
    sucesso: motorista ? 'Motorista atualizado' : 'Motorista cadastrado',
    onSuccess: onClose,
  });

  useEffect(() => {
    if (!open) return;
    setErros({});
    setForm(
      motorista
        ? {
            nome: motorista.nome,
            telefone: motorista.telefone,
            email: motorista.email,
            cpf: motorista.cpf,
            status: motorista.status,
            usuario_id: motorista.usuario_id,
            veiculo_tipo: motorista.veiculo?.tipo ?? 'Utilitário',
            veiculo_modelo: motorista.veiculo?.modelo ?? '',
            veiculo_placa: motorista.veiculo?.placa ?? '',
            veiculo_capacidade: motorista.veiculo?.capacidade_kg ?? null,
          }
        : VAZIO,
    );
  }, [open, motorista]);

  const set = <K extends keyof MotoristaForm>(k: K, v: MotoristaForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErros((e) => ({ ...e, [k]: undefined }));
  };

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    const e: typeof erros = {};
    if (form.nome.trim().length < 3) e.nome = 'Informe o nome.';
    if (!isTelefoneValido(form.telefone)) e.telefone = 'Telefone inválido.';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'E-mail inválido.';
    if (form.cpf && !isCPFValido(form.cpf)) e.cpf = 'CPF inválido.';
    if (form.veiculo_capacidade != null && form.veiculo_capacidade < 0) e.veiculo_capacidade = 'Capacidade inválida.';
    setErros(e);
    if (Object.keys(e).length) return;
    salvar.mutate(form);
  };

  const usuariosMotorista = (usuarios.data ?? []).filter((u) => u.perfil === 'motorista');

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      persistent={salvar.isPending}
      title={motorista ? 'Editar motorista' : 'Novo motorista'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-motorista" loading={salvar.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="form-motorista" onSubmit={onSubmit} className="space-y-6" noValidate>
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Dados pessoais</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" required error={erros.nome} className="sm:col-span-2">
              {(id) => <Input id={id} value={form.nome} onChange={(e) => set('nome', e.target.value)} invalid={!!erros.nome} />}
            </Field>
            <Field label="Telefone" required error={erros.telefone}>
              {(id) => <Input id={id} inputMode="tel" value={form.telefone} onChange={(e) => set('telefone', maskTelefone(e.target.value))} invalid={!!erros.telefone} placeholder="(00) 00000-0000" />}
            </Field>
            <Field label="CPF" error={erros.cpf}>
              {(id) => <Input id={id} inputMode="numeric" value={form.cpf} onChange={(e) => set('cpf', maskCPF(e.target.value))} invalid={!!erros.cpf} placeholder="000.000.000-00" />}
            </Field>
            <Field label="E-mail" error={erros.email}>
              {(id) => <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!erros.email} />}
            </Field>
            <Field label="Status">
              {(id) => (
                <Select id={id} value={form.status} onChange={(e) => set('status', e.target.value as MotoristaStatus)}>
                  {(Object.keys(MOTORISTA_STATUS) as MotoristaStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {MOTORISTA_STATUS[s].label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Usuário vinculado" hint="Permite que o motorista acesse o app com sua rota." className="sm:col-span-2">
              {(id) => (
                <Select id={id} value={form.usuario_id ?? ''} onChange={(e) => set('usuario_id', e.target.value || null)}>
                  <option value="">Sem acesso ao sistema</option>
                  {usuariosMotorista.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} ({u.email})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Veículo</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo">
              {(id) => (
                <Select id={id} value={form.veiculo_tipo} onChange={(e) => set('veiculo_tipo', e.target.value)}>
                  {['Moto', 'Carro', 'Utilitário', 'Van', 'Caminhonete', 'Caminhão'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Modelo">
              {(id) => <Input id={id} value={form.veiculo_modelo} onChange={(e) => set('veiculo_modelo', e.target.value)} placeholder="Ex.: Fiat Fiorino" />}
            </Field>
            <Field label="Placa">
              {(id) => <Input id={id} value={form.veiculo_placa} onChange={(e) => set('veiculo_placa', maskPlaca(e.target.value))} placeholder="ABC-1D23" />}
            </Field>
            <Field label="Capacidade (kg)" error={erros.veiculo_capacidade} hint="Usada para respeitar a carga na otimização.">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  value={form.veiculo_capacidade ?? ''}
                  onChange={(e) => set('veiculo_capacidade', e.target.value === '' ? null : Number(e.target.value))}
                  invalid={!!erros.veiculo_capacidade}
                  className="tabular"
                />
              )}
            </Field>
          </div>
        </section>
      </form>
    </Modal>
  );
}
