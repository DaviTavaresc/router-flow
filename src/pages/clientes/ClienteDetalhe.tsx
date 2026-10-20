import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Pencil, Phone, Plus, ShoppingCart, Trash2, Truck } from 'lucide-react';
import { useSessao } from '@/app/session';
import { pode } from '@/app/permissions';
import { useAcao } from '@/app/hooks';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InfoList,
  PageSkeleton,
  Skeleton,
  StatCard,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  Tr,
  useConfirm,
} from '@/components/ui';
import { detalheCliente, excluirCliente } from '@/services/api/clientes';
import { ENTREGA_STATUS, GEO_PRECISAO, PEDIDO_STATUS } from '@/lib/labels';
import { formatBRL, formatData, onlyDigits } from '@/lib/format';
import { ClienteFormModal } from './ClienteFormModal';

const RouteMap = lazy(() => import('@/components/map/RouteMap'));

export default function ClienteDetalhe() {
  const { id = '' } = useParams();
  const { usuario } = useSessao();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [editar, setEditar] = useState(false);
  const [aba, setAba] = useState<'pedidos' | 'entregas'>('pedidos');
  const q = useQuery({ queryKey: ['cliente', id], queryFn: () => detalheCliente(id) });
  const excluir = useAcao(excluirCliente, { sucesso: 'Cliente excluído', onSuccess: () => navigate('/clientes') });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { cliente, pedidos, entregas, totalComprado, emAberto, vencido } = q.data;
  const geo = GEO_PRECISAO[cliente.geo_precisao];
  const tel = onlyDigits(cliente.telefone);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/clientes" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Clientes
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{cliente.nome}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin className="h-4 w-4" /> {cliente.bairro}, {cliente.cidade} - {cliente.estado}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {pode(usuario.perfil, 'pedido.criar') && (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/pedidos/novo?cliente=${cliente.id}`)}>
                Novo pedido
              </Button>
            )}
            {pode(usuario.perfil, 'cliente.editar') && (
              <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditar(true)}>
                Editar
              </Button>
            )}
            {pode(usuario.perfil, 'cliente.excluir') && (
              <Button
                variant="outline"
                icon={<Trash2 className="h-4 w-4" />}
                className="hover:text-red-600"
                loading={excluir.isPending}
                onClick={async () => {
                  if (await confirm({ title: 'Excluir cliente?', description: `${cliente.nome} será removido permanentemente.`, confirmLabel: 'Excluir' }))
                    excluir.mutate(cliente.id);
                }}
              >
                Excluir
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total comprado" value={formatBRL(totalComprado)} tone="blue" />
        <StatCard label="Em aberto" value={formatBRL(emAberto)} tone="amber" hint={vencido > 0 ? <span className="text-red-600">{formatBRL(vencido)} vencido</span> : undefined} />
        <StatCard label="Pedidos" value={pedidos.length} tone="violet" />
        <StatCard label="Entregas realizadas" value={entregas.filter((e) => e.status === 'entregue').length} tone="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Dados do cliente" />
          <div className="p-5">
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: 'Nome', value: cliente.nome },
                {
                  label: 'Telefone',
                  value: (
                    <span className="flex items-center gap-3">
                      <a href={`tel:${tel}`} className="tabular inline-flex items-center gap-1.5 text-brand-600 hover:underline dark:text-brand-400">
                        <Phone className="h-3.5 w-3.5" /> {cliente.telefone}
                      </a>
                      <a href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">
                        WhatsApp
                      </a>
                    </span>
                  ),
                },
                { label: 'Bairro', value: cliente.bairro },
                { label: 'Cidade', value: cliente.cidade },
                { label: 'Estado', value: cliente.estado },
              ]}
            />
          </div>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Localização aproximada" action={<Badge tone={geo.tone}>{geo.label}</Badge>} />
          <div className="p-3">
            {cliente.latitude != null && cliente.longitude != null ? (
              <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
                <RouteMap
                  className="h-64"
                  legenda={false}
                  avulsos={[{ id: cliente.id, lat: cliente.latitude, lng: cliente.longitude, titulo: cliente.nome, subtitulo: cliente.bairro }]}
                />
              </Suspense>
            ) : (
              <EmptyState
                icon={<MapPin className="h-6 w-6" />}
                title="Localização não identificada"
                description="Verifique o bairro, a cidade e o estado. Sem localização o cliente não entra na otimização de rotas."
              />
            )}
            <p className="px-2 pt-2 text-xs text-slate-500">
              A posição é estimada pelo bairro (centro aproximado) e não representa o endereço exato.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <Tabs
            value={aba}
            onChange={setAba}
            items={[
              { value: 'pedidos', label: 'Histórico de pedidos', count: pedidos.length },
              { value: 'entregas', label: 'Histórico de entregas', count: entregas.length },
            ]}
          />
        </div>
        {aba === 'pedidos' ? (
          pedidos.length === 0 ? (
            <EmptyState icon={<ShoppingCart className="h-6 w-6" />} title="Nenhum pedido" description="Este cliente ainda não possui pedidos." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Pedido</Th>
                  <Th>Venda</Th>
                  <Th>Entrega prevista</Th>
                  <Th>Pagamento</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <Tr key={p.id} onClick={() => navigate(`/pedidos/${p.id}`)}>
                    <Td className="font-medium text-slate-900 dark:text-white">#{p.numero}</Td>
                    <Td>{formatData(p.data_venda)}</Td>
                    <Td>{formatData(p.data_entrega)}</Td>
                    <Td>{p.tipo_venda === 'prazo' ? `A prazo · ${p.parcelas_qtd}x` : 'À vista'}</Td>
                    <Td className="tabular text-right">{formatBRL(p.total)}</Td>
                    <Td>
                      <StatusBadge map={PEDIDO_STATUS} value={p.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )
        ) : entregas.length === 0 ? (
          <EmptyState icon={<Truck className="h-6 w-6" />} title="Nenhuma entrega" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Pedido</Th>
                <Th>Motorista</Th>
                <Th>Horário</Th>
                <Th className="text-right">Recebido</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {entregas.map((e) => (
                <Tr key={e.id}>
                  <Td>{formatData(e.data)}</Td>
                  <Td>#{e.pedido?.numero}</Td>
                  <Td>{e.motorista?.nome ?? '—'}</Td>
                  <Td>{e.entregue_em ? new Date(e.entregue_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</Td>
                  <Td className="tabular text-right">{e.valor_recebido ? formatBRL(e.valor_recebido) : '—'}</Td>
                  <Td>
                    <StatusBadge map={ENTREGA_STATUS} value={e.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ClienteFormModal open={editar} cliente={cliente} onClose={() => setEditar(false)} />
    </div>
  );
}
