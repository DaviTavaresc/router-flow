import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, Package, Pencil, Route as RouteIcon, XCircle } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, ErrorState, InfoList, PageSkeleton, StatCard, StatusBadge, Table, Td, Th, Tr } from '@/components/ui';
import { corDoMotorista, MOTORISTA_STATUS, ROTA_STATUS } from '@/lib/labels';
import { formatData, formatDuracao, formatKm } from '@/lib/format';
import { detalheMotorista, listarMotoristas } from '@/services/api/motoristas';
import { MotoristaFormModal } from './MotoristaFormModal';

export default function MotoristaDetalhe() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['motorista', id], queryFn: () => detalheMotorista(id) });
  const todos = useQuery({ queryKey: ['motoristas'], queryFn: listarMotoristas });
  const [editar, setEditar] = useState(false);

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { motorista, veiculo, rotas, stats } = q.data;
  const lista = todos.data?.find((m) => m.id === id) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/motoristas" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Motoristas
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar nome={motorista.nome} cor={corDoMotorista(motorista.id, todos.data ?? [motorista])} className="h-14 w-14 text-base" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{motorista.nome}</h1>
              <div className="mt-1">
                <StatusBadge map={MOTORISTA_STATUS} value={motorista.status} />
              </div>
            </div>
          </div>
          <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditar(true)} disabled={!lista}>
            Editar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Total de entregas" value={stats.total} icon={<Package />} tone="blue" />
        <StatCard label="Concluídas" value={stats.concluidas} icon={<CheckCircle2 />} tone="green" />
        <StatCard label="Pendentes" value={stats.pendentes} icon={<Clock />} tone="amber" />
        <StatCard label="Não entregues" value={stats.naoEntregues} icon={<XCircle />} tone="red" />
        <StatCard label="Distância percorrida" value={formatKm(stats.distanciaPercorrida)} icon={<RouteIcon />} tone="violet" hint="Rotas concluídas (estimada)" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Cadastro" />
          <div className="p-5">
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: 'Telefone', value: motorista.telefone || '—' },
                { label: 'E-mail', value: motorista.email || '—' },
                { label: 'CPF', value: motorista.cpf || '—' },
                { label: 'Veículo', value: veiculo ? `${veiculo.tipo} · ${veiculo.modelo}` : '—' },
                { label: 'Placa', value: veiculo?.placa || '—' },
                { label: 'Capacidade', value: veiculo?.capacidade_kg != null ? `${veiculo.capacidade_kg} kg` : '—' },
                { label: 'Usuário vinculado', value: motorista.usuario_id ? 'Sim' : 'Não' },
              ]}
            />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Histórico de rotas" description={`${rotas.length} rota(s)`} />
          {rotas.length === 0 ? (
            <EmptyState icon={<RouteIcon className="h-6 w-6" />} title="Nenhuma rota ainda" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th className="text-right">Entregas</Th>
                  <Th className="text-right">Concluídas</Th>
                  <Th className="text-right">Distância</Th>
                  <Th className="text-right">Tempo</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rotas.map((r) => (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap">{formatData(r.data)}</Td>
                    <Td className="tabular text-right">{r.paradas.length}</Td>
                    <Td className="tabular text-right">{r.paradas.filter((p) => p.status === 'entregue').length}</Td>
                    <Td className="tabular text-right">{formatKm(r.distancia_km)}</Td>
                    <Td className="tabular text-right">{formatDuracao(r.tempo_min)}</Td>
                    <Td>
                      <StatusBadge map={ROTA_STATUS} value={r.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
      <MotoristaFormModal open={editar} motorista={lista} onClose={() => setEditar(false)} />
    </div>
  );
}
