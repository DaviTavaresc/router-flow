import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CalendarPlus, CircleAlert, HandCoins, MapPin, Pencil, Truck } from 'lucide-react';
import { useSessao } from '@/app/session';
import { pode } from '@/app/permissions';
import { useAcao } from '@/app/hooks';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageSkeleton, Select, StatusBadge, Table, Td, Th, Tr, useConfirm } from '@/components/ui';
import { EscolherDataModal } from '@/components/domain/EscolherDataModal';
import { RegistrarPagamentoModal } from '@/components/domain/RegistrarPagamentoModal';
import { alterarStatusPedido, detalhePedido, gerarEntrega } from '@/services/api/pedidos';
import { reagendarEntrega } from '@/services/api/entregas';
import { ENTREGA_STATUS, FORMA_PAGAMENTO, MOTIVO_OCORRENCIA, PARCELA_STATUS, PEDIDO_STATUS } from '@/lib/labels';
import { formatBRL, formatData, formatDataHora, round2 } from '@/lib/format';
import type { Parcela, PedidoStatus } from '@/types';

export default function PedidoDetalhe() {
  const { id = '' } = useParams();
  const { usuario } = useSessao();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['pedido', id], queryFn: () => detalhePedido(id) });
  const [pagar, setPagar] = useState<Parcela | null>(null);
  const [modalEntrega, setModalEntrega] = useState<'gerar' | 'reagendar' | null>(null);

  const status = useAcao(({ s }: { s: PedidoStatus }) => alterarStatusPedido(id, s), { sucesso: 'Status atualizado' });
  const gerar = useAcao((data: string) => gerarEntrega(id, data), { sucesso: 'Entrega gerada', onSuccess: () => setModalEntrega(null) });
  const reagendar = useAcao(({ entregaId, data }: { entregaId: string; data: string }) => reagendarEntrega(entregaId, data), {
    sucesso: 'Entrega reagendada',
    onSuccess: () => setModalEntrega(null),
  });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { pedido, cliente, itens, parcelas, pagamentos, entregas, ocorrencias } = q.data;

  const finalizado = pedido.status === 'entregue' || pedido.status === 'cancelado';
  const entregaAtiva = entregas.find((e) => !['cancelada', 'nao_entregue'].includes(e.status));
  const ultima = entregas[entregas.length - 1];
  const isAdmin = usuario.perfil === 'admin';
  const recebido = round2(pagamentos.reduce((s, p) => s + p.valor, 0));
  const emAberto = round2(parcelas.filter((p) => p.status === 'pendente').reduce((s, p) => s + p.valor - p.valor_pago, 0));

  const cancelar = async () => {
    const ok = await confirm({
      title: `Cancelar pedido #${pedido.numero}?`,
      description: 'A entrega será cancelada e as parcelas pendentes também. Esta ação não pode ser desfeita.',
      confirmLabel: 'Cancelar pedido',
      cancelLabel: 'Voltar',
    });
    if (ok) status.mutate({ s: 'cancelado' });
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/pedidos" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Pedidos
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Pedido #{pedido.numero}</h1>
              <StatusBadge map={PEDIDO_STATUS} value={pedido.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Vendido em {formatData(pedido.data_venda)} ·{' '}
              {cliente && (
                <Link to={`/clientes/${cliente.id}`} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                  {cliente.nome}
                </Link>
              )}
            </p>
          </div>
          {!finalizado && pode(usuario.perfil, 'pedido.status') && (
            <div className="flex flex-wrap items-center gap-2">
              {['novo', 'preparando', 'pronto'].includes(pedido.status) && (
                <Select
                  aria-label="Alterar status"
                  value={pedido.status}
                  onChange={(e) => status.mutate({ s: e.target.value as PedidoStatus })}
                  className="w-48"
                  disabled={status.isPending}
                >
                  {(['novo', 'preparando', 'pronto'] as PedidoStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {PEDIDO_STATUS[s].label}
                    </option>
                  ))}
                </Select>
              )}
              {pode(usuario.perfil, 'pedido.editar') && (
                <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/pedidos/${pedido.id}/editar`)}>
                  Editar
                </Button>
              )}
              <Button variant="outline" icon={<Ban className="h-4 w-4" />} className="hover:text-red-600" onClick={cancelar} loading={status.isPending}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Produtos" />
            <Table>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th className="text-right">Qtd.</Th>
                  <Th className="text-right">Valor unit.</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <Tr key={i.id}>
                    <Td className="font-medium text-slate-900 dark:text-white">{i.descricao}</Td>
                    <Td className="tabular text-right">{i.quantidade}</Td>
                    <Td className="tabular text-right">{formatBRL(i.valor_unitario)}</Td>
                    <Td className="tabular text-right">{formatBRL(i.total)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="space-y-1.5 border-t border-slate-100 px-5 py-4 text-sm dark:border-slate-800">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="tabular">{formatBRL(pedido.subtotal)}</span>
              </div>
              {pedido.desconto > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Desconto</span>
                  <span className="tabular">− {formatBRL(pedido.desconto)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular">{formatBRL(pedido.total)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Pagamento"
              description={
                pedido.tipo_venda === 'prazo'
                  ? `A prazo · ${pedido.parcelas_qtd}x ${pedido.forma_pagamento ? `· ${FORMA_PAGAMENTO[pedido.forma_pagamento]}` : ''}`
                  : `À vista · ${pedido.forma_pagamento ? FORMA_PAGAMENTO[pedido.forma_pagamento] : ''} · ${pedido.receber_na_entrega ? 'receber na entrega' : 'pago na venda'}`
              }
              action={
                <div className="flex gap-4 text-right text-xs">
                  <div>
                    <p className="text-slate-500">Recebido</p>
                    <p className="tabular text-sm font-semibold text-emerald-600">{formatBRL(recebido)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Em aberto</p>
                    <p className="tabular text-sm font-semibold text-amber-600">{formatBRL(emAberto)}</p>
                  </div>
                </div>
              }
            />
            <Table>
              <thead>
                <tr>
                  <Th>Parcela</Th>
                  <Th>Vencimento</Th>
                  <Th className="text-right">Valor</Th>
                  <Th className="text-right">Pago</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {parcelas.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      {p.numero}/{p.total_parcelas}
                    </Td>
                    <Td>{formatData(p.vencimento)}</Td>
                    <Td className="tabular text-right">{formatBRL(p.valor)}</Td>
                    <Td className="tabular text-right">
                      {p.valor_pago ? formatBRL(p.valor_pago) : '—'}
                      {p.pago_em && <p className="text-xs text-slate-500">{formatData(p.pago_em)}</p>}
                    </Td>
                    <Td>
                      <StatusBadge map={PARCELA_STATUS} value={p.status_efetivo} />
                    </Td>
                    <Td className="text-right">
                      {p.status === 'pendente' && pode(usuario.perfil, 'pagamento.registrar') && (
                        <Button size="sm" variant="outline" icon={<HandCoins className="h-3.5 w-3.5" />} onClick={() => setPagar(p)}>
                          Receber
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {pagamentos.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Recebimentos</p>
                <ul className="space-y-1.5 text-sm">
                  {pagamentos.map((pg) => (
                    <li key={pg.id} className="flex flex-wrap justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">
                        {formatData(pg.data)} · {FORMA_PAGAMENTO[pg.forma]}
                        {pg.observacao && <span className="text-slate-400"> · {pg.observacao}</span>}
                      </span>
                      <span className="tabular font-medium">{formatBRL(pg.valor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Entrega"
              action={
                isAdmin && !finalizado && !entregaAtiva ? (
                  ultima?.status === 'nao_entregue' ? (
                    <Button size="sm" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setModalEntrega('reagendar')}>
                      Reagendar
                    </Button>
                  ) : (
                    <Button size="sm" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setModalEntrega('gerar')}>
                      Gerar entrega
                    </Button>
                  )
                ) : null
              }
            />
            {entregas.length === 0 ? (
              <EmptyState
                icon={<Truck className="h-6 w-6" />}
                title="Sem entrega"
                description={pedido.data_entrega ? `Prevista para ${formatData(pedido.data_entrega)}` : 'Nenhuma data de entrega definida.'}
              />
            ) : (
              <ol className="space-y-4 p-5">
                {entregas.map((e) => (
                  <li key={e.id} className="relative border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{formatData(e.data)}</p>
                      <StatusBadge map={ENTREGA_STATUS} value={e.status} />
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                      {e.motorista && (
                        <p className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: e.rota?.cor }} />
                          {e.motorista.nome} · parada {e.ordem}
                        </p>
                      )}
                      {e.entregue_em && <p>Entregue em {formatDataHora(e.entregue_em)}</p>}
                      {e.valor_receber > 0 && <p>A receber na entrega: {formatBRL(e.valor_receber)}</p>}
                      {e.valor_recebido > 0 && <p className="text-emerald-600">Recebido: {formatBRL(e.valor_recebido)}</p>}
                      {e.observacoes && <p className="italic">“{e.observacoes}”</p>}
                      {ocorrencias
                        .filter((o) => o.entrega_id === e.id)
                        .map((o) => (
                          <p key={o.id} className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                            <CircleAlert className="h-3.5 w-3.5" /> {MOTIVO_OCORRENCIA[o.motivo]}
                            {o.observacao && ` — ${o.observacao}`}
                          </p>
                        ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          {cliente && (
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cliente</p>
              <p className="mt-1 font-medium">{cliente.nome}</p>
              <p className="tabular text-sm text-slate-500">{cliente.telefone}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                <MapPin className="h-4 w-4 text-slate-400" /> {cliente.bairro}, {cliente.cidade} - {cliente.estado}
              </p>
            </Card>
          )}
          {pedido.observacoes && (
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Observações</p>
              <p className="mt-1 whitespace-pre-line text-sm">{pedido.observacoes}</p>
            </Card>
          )}
          {pedido.tipo_venda === 'avista' && pedido.receber_na_entrega && emAberto > 0 && (
            <Badge tone="amber" className="w-full justify-center py-2">
              Motorista deve cobrar {formatBRL(emAberto)} na entrega
            </Badge>
          )}
        </div>
      </div>

      <RegistrarPagamentoModal parcela={pagar} contexto={`Pedido #${pedido.numero}`} onClose={() => setPagar(null)} />
      <EscolherDataModal
        open={modalEntrega !== null}
        titulo={modalEntrega === 'reagendar' ? 'Reagendar entrega' : 'Gerar entrega'}
        descricao={modalEntrega === 'reagendar' ? 'Uma nova entrega será criada para a data escolhida.' : 'Escolha a data da entrega.'}
        rotulo="Data da entrega"
        carregando={gerar.isPending || reagendar.isPending}
        onClose={() => setModalEntrega(null)}
        onConfirm={(data) => (modalEntrega === 'reagendar' && ultima ? reagendar.mutate({ entregaId: ultima.id, data }) : gerar.mutate(data))}
      />
    </div>
  );
}
