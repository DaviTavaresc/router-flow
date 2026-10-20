import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Users } from 'lucide-react';
import { useSessao } from '@/app/session';
import { useAcao } from '@/app/hooks';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Table, TableSkeleton, Td, Th, Toggle, Tr } from '@/components/ui';
import { formatData } from '@/lib/format';
import { PERFIL } from '@/lib/labels';
import { atualizarUsuario, criarUsuario, listarUsuarios } from '@/services/api/empresa';
import { MODO_DEMO } from '@/services/data';
import type { NovoUsuario } from '@/services/auth';
import type { Perfil } from '@/types';

export default function Usuarios() {
  const { usuario: eu } = useSessao();
  const q = useQuery({ queryKey: ['usuarios'], queryFn: listarUsuarios });
  const [novo, setNovo] = useState(false);
  const atualizar = useAcao(({ id, patch }: { id: string; patch: { perfil?: Perfil; ativo?: boolean } }) => atualizarUsuario(id, patch), {
    sucesso: 'Usuário atualizado',
  });

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Acesso ao sistema por perfil: administrador, vendedor e motorista."
        actions={
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setNovo(true)}>
            Novo usuário
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {(
          [
            ['admin', 'Acesso completo, incluindo financeiro, rotas, configurações e usuários.'],
            ['vendedor', 'Cadastra clientes e pedidos; consulta pedidos e entregas.'],
            ['motorista', 'App de entregas: rota do dia, confirmação, recebimento e ocorrências.'],
          ] as [Perfil, string][]
        ).map(([p, d]) => (
          <Card key={p} className="p-4">
            <p className="text-sm font-semibold">{PERFIL[p]}</p>
            <p className="mt-1 text-xs text-slate-500">{d}</p>
          </Card>
        ))}
      </div>
      <Card>
        {q.isLoading ? (
          <TableSkeleton />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="Nenhum usuário" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Usuário</Th>
                <Th>Perfil</Th>
                <Th>Criado em</Th>
                <Th>Ativo</Th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar nome={u.nome} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900 dark:text-white">
                          {u.nome} {u.id === eu.id && <Badge tone="blue" dot={false}>Você</Badge>}
                        </p>
                        <p className="truncate text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Select
                      value={u.perfil}
                      disabled={u.id === eu.id}
                      onChange={(e) => atualizar.mutate({ id: u.id, patch: { perfil: e.target.value as Perfil } })}
                      className="w-40"
                      aria-label="Perfil"
                    >
                      {(Object.keys(PERFIL) as Perfil[]).map((p) => (
                        <option key={p} value={p}>
                          {PERFIL[p]}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>{formatData(u.created_at.slice(0, 10))}</Td>
                  <Td>
                    {u.id === eu.id ? (
                      <Badge tone="green">Ativo</Badge>
                    ) : (
                      <Toggle checked={u.ativo} onChange={(v) => atualizar.mutate({ id: u.id, patch: { ativo: v } })} />
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <NovoUsuarioModal open={novo} onClose={() => setNovo(false)} />
    </>
  );
}

function NovoUsuarioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const vazio: NovoUsuario = { nome: '', email: '', perfil: 'vendedor', senha: '' };
  const [form, setForm] = useState<NovoUsuario>(vazio);
  const criar = useAcao(criarUsuario, {
    sucesso: (u) => `Usuário ${u.nome} criado`,
    onSuccess: () => {
      setForm(vazio);
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Novo usuário"
      description={MODO_DEMO ? 'Modo local: o acesso é criado neste navegador.' : 'A pessoa entra com este e-mail e senha. Se a confirmação de e-mail estiver ativa no Supabase, ela precisa confirmar antes.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => criar.mutate(form)} loading={criar.isPending}>
            Criar usuário
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" required>
          {(id) => <Input id={id} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />}
        </Field>
        <Field label="E-mail" required>
          {(id) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label="Perfil">
          {(id) => (
            <Select id={id} value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}>
              {(Object.keys(PERFIL) as Perfil[]).map((p) => (
                <option key={p} value={p}>
                  {PERFIL[p]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Senha inicial" hint="Mínimo de 6 caracteres. Motoristas: vincule o usuário no cadastro do motorista.">
          {(id) => <Input id={id} type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />}
        </Field>
      </div>
    </Modal>
  );
}
