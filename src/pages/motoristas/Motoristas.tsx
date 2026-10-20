import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Pencil, Phone, Plus, Trash2, Truck, Weight } from 'lucide-react';
import { useAcao } from '@/app/hooks';
import { Avatar, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, Tabs, useConfirm } from '@/components/ui';
import { corDoMotorista, MOTORISTA_STATUS } from '@/lib/labels';
import { excluirMotorista, listarMotoristas, type MotoristaLista } from '@/services/api/motoristas';
import type { MotoristaStatus } from '@/types';
import { MotoristaFormModal } from './MotoristaFormModal';

export default function Motoristas() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['motoristas'], queryFn: listarMotoristas });
  const [filtro, setFiltro] = useState<'todos' | MotoristaStatus>('todos');
  const [modal, setModal] = useState<{ open: boolean; m: MotoristaLista | null }>({ open: false, m: null });
  const excluir = useAcao(excluirMotorista, { sucesso: 'Motorista excluído' });

  const dados = q.data ?? [];
  const lista = dados.filter((m) => filtro === 'todos' || m.status === filtro);

  return (
    <>
      <PageHeader
        title="Motoristas"
        description="Equipe de entrega, veículos e capacidade."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true, m: null })}>
            Novo motorista
          </Button>
        }
      />
      <Tabs
        className="mb-4"
        value={filtro}
        onChange={setFiltro}
        items={[
          { value: 'todos', label: 'Todos', count: dados.length },
          ...(Object.keys(MOTORISTA_STATUS) as MotoristaStatus[]).map((s) => ({
            value: s,
            label: MOTORISTA_STATUS[s].label,
            count: dados.filter((m) => m.status === s).length,
          })),
        ]}
      />
      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : lista.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Truck className="h-6 w-6" />}
            title="Nenhum motorista"
            description="Cadastre motoristas para distribuir as rotas."
            action={<Button onClick={() => setModal({ open: true, m: null })}>Novo motorista</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((m) => (
            <Card key={m.id} className="group cursor-pointer p-5 transition-shadow hover:shadow-md" onClick={() => navigate(`/motoristas/${m.id}`)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar nome={m.nome} cor={corDoMotorista(m.id, dados)} className="h-11 w-11" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 dark:text-white">{m.nome}</p>
                    <p className="tabular flex items-center gap-1 text-xs text-slate-500">
                      <Phone className="h-3 w-3" /> {m.telefone}
                    </p>
                  </div>
                </div>
                <StatusBadge map={MOTORISTA_STATUS} value={m.status} />
              </div>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                {m.veiculo ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Truck className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">
                        {m.veiculo.modelo} <span className="text-slate-500">· {m.veiculo.placa}</span>
                      </span>
                    </span>
                    {m.veiculo.capacidade_kg != null && (
                      <span className="tabular flex shrink-0 items-center gap-1 text-xs text-slate-500">
                        <Weight className="h-3.5 w-3.5" /> {m.veiculo.capacidade_kg} kg
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-500">Sem veículo cadastrado</span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">{m.usuario_id ? 'Com acesso ao app' : 'Sem acesso ao app'}</span>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setModal({ open: true, m })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Excluir"
                    className="hover:text-red-600"
                    onClick={async () => {
                      if (await confirm({ title: 'Excluir motorista?', description: `${m.nome} será removido. Motoristas com rotas não podem ser excluídos.`, confirmLabel: 'Excluir' }))
                        excluir.mutate(m.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <MotoristaFormModal open={modal.open} motorista={modal.m} onClose={() => setModal({ open: false, m: null })} />
    </>
  );
}
