import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CircleDollarSign, HandCoins, Receipt, TriangleAlert, Wallet } from 'lucide-react';
import { useSessao } from '@/app/session';
import { pode } from '@/app/permissions';
import { useDebounced } from '@/app/hooks';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  SearchInput,
  Skeleton,
  StatCard,
  StatusBadge,
  Table,
  TableSkeleton,
  Tabs,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { RegistrarPagamentoModal } from '@/components/domain/RegistrarPagamentoModal';
import { formatBRL, formatData, normalizar, round2 } from '@/lib/format';
import { FORMA_PAGAMENTO, PARCELA_STATUS } from '@/lib/labels';
import { listarPagamentos, listarParcelas, resumoFinanceiro } from '@/services/api/financeiro';
import type { ParcelaStatus, ParcelaView } from '@/types';

const POR_PAGINA = 15;
type FiltroStatus = 'abertas' | ParcelaStatus | 'todas';

export default function Financeiro() {
  const { usuario } = useSessao();
  const resumo = useQuery({ queryKey: ['financeiro', 'resumo'], queryFn: resumoFinanceiro });
  const parcelas = useQuery({ queryKey: ['financeiro', 'parcelas'], queryFn: listarParcelas });
  const pagamentos = useQuery({ queryKey: ['financeiro', 'pagamentos'], queryFn: listarPagamentos });
  const [aba, setAba] = useState<'receber' | 'recebimentos'>('receber');
  const [filtro, setFiltro] = useState<FiltroStatus>('abertas');
  const [busca, setBusca] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pagina, setPagina] = useState(1);
  const [pagar, setPagar] = useState<ParcelaView | null>(null);
  const buscaDeb = useDebounced(busca);

  const lista = parcelas.data ?? [];
  const filtradas = useMemo(() => {
    const t = normalizar(buscaDeb).replace('#', '');
    return lista.filter(
      (p) =>
        (filtro === 'todas' ||
          (filtro === 'abertas' ? p.status_efetivo === 'pendente' || p.status_efetivo === 'vencido' : p.status_efetivo === filtro)) &&
        (!t || normalizar(p.cliente?.nome ?? '').includes(t) || String(p.pedido?.numero ?? '').includes(t)) &&
        (!de || p.vencimento >= de) &&
        (!ate || p.vencimento <= ate),
    );
  }, [lista, filtro, buscaDeb, de, ate]);
  const somaFiltrada = round2(filtradas.reduce((s, p) => s + (p.status === 'pendente' ? p.valor - p.valor_pago : 0), 0));
  const count = (f: (p: ParcelaView) => boolean) => lista.filter(f).length;
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(filtradas.length / POR_PAGINA)));

  const r = resumo.data;
  return (
    <>
      <PageHeader title="Financeiro" description="Vendas, recebimentos e contas a receber." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {resumo.isLoading || !r ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Total vendido" value={formatBRL(r.totalVendido)} icon={<Receipt />} tone="blue" />
            <StatCard label="Total recebido" value={formatBRL(r.totalRecebido)} icon={<HandCoins />} tone="green" />
            <StatCard label="Total a receber" value={formatBRL(r.totalAReceber)} icon={<Wallet />} tone="amber" />
            <StatCard
              label="Total vencido"
              value={formatBRL(r.totalVencido)}
              icon={<TriangleAlert />}
              tone="red"
              hint={`${r.qtdVencidas} parcela(s) vencida(s)`}
            />
          </>
        )}
      </div>

      <Tabs
        className="mb-4"
        value={aba}
        onChange={setAba}
        items={[
          { value: 'receber', label: 'Contas a receber' },
          { value: 'recebimentos', label: 'Recebimentos', count: pagamentos.data?.length },
        ]}
      />

      {aba === 'receber' ? (
        <Card>
          <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800">
            <Tabs
              value={filtro}
              onChange={(v) => {
                setFiltro(v);
                setPagina(1);
              }}
              items={[
                { value: 'abertas', label: 'Em aberto', count: count((p) => p.status === 'pendente') },
                { value: 'vencido', label: 'Vencidas', count: count((p) => p.status_efetivo === 'vencido') },
                { value: 'pendente', label: 'A vencer', count: count((p) => p.status_efetivo === 'pendente') },
                { value: 'pago', label: 'Pagas', count: count((p) => p.status === 'pago') },
                { value: 'cancelado', label: 'Canceladas', count: count((p) => p.status === 'cancelado') },
                { value: 'todas', label: 'Todas', count: lista.length },
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-[1fr_170px_170px]">
              <SearchInput value={busca} onChange={(v) => { setBusca(v); setPagina(1); }} placeholder="Cliente ou nº do pedido" />
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Vencimento a partir de" title="Vencimento a partir de" />
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Vencimento até" title="Vencimento até" />
            </div>
          </div>
          {parcelas.isLoading ? (
            <TableSkeleton />
          ) : parcelas.error ? (
            <ErrorState error={parcelas.error} onRetry={() => parcelas.refetch()} />
          ) : filtradas.length === 0 ? (
            <EmptyState icon={<CircleDollarSign className="h-6 w-6" />} title="Nenhuma parcela encontrada" description="Ajuste os filtros para ver outras parcelas." />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>Pedido</Th>
                    <Th>Parcela</Th>
                    <Th className="text-right">Valor</Th>
                    <Th>Vencimento</Th>
                    <Th>Status</Th>
                    <Th>Forma de pagamento</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {filtradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA).map((p) => (
                    <Tr key={p.id}>
                      <Td className="max-w-[220px] truncate font-medium text-slate-900 dark:text-white">{p.cliente?.nome}</Td>
                      <Td>
                        <Link to={`/pedidos/${p.pedido_id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                          #{p.pedido?.numero}
                        </Link>
                      </Td>
                      <Td className="tabular">
                        {p.numero}/{p.total_parcelas}
                      </Td>
                      <Td className="tabular whitespace-nowrap text-right">
                        {formatBRL(p.valor)}
                        {p.valor_pago > 0 && p.status === 'pendente' && <p className="text-xs text-slate-500">pago {formatBRL(p.valor_pago)}</p>}
                      </Td>
                      <Td className="whitespace-nowrap">{formatData(p.vencimento)}</Td>
                      <Td>
                        <StatusBadge map={PARCELA_STATUS} value={p.status_efetivo} />
                      </Td>
                      <Td className="whitespace-nowrap">{p.forma_pagamento ? FORMA_PAGAMENTO[p.forma_pagamento] : '—'}</Td>
                      <Td className="text-right">
                        {p.status === 'pendente' && pode(usuario.perfil, 'pagamento.registrar') && (
                          <Button size="sm" variant="outline" icon={<HandCoins className="h-3.5 w-3.5" />} onClick={() => setPagar(p)}>
                            Registrar pagamento
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-sm dark:border-slate-800">
                <span className="text-slate-500">
                  Saldo em aberto no filtro: <strong className="tabular text-slate-900 dark:text-white">{formatBRL(somaFiltrada)}</strong>
                </span>
              </div>
              <Pagination page={paginaAtual} pageSize={POR_PAGINA} total={filtradas.length} onPage={setPagina} />
            </>
          )}
        </Card>
      ) : (
        <Card>
          {pagamentos.isLoading ? (
            <TableSkeleton />
          ) : pagamentos.error ? (
            <ErrorState error={pagamentos.error} onRetry={() => pagamentos.refetch()} />
          ) : !pagamentos.data?.length ? (
            <EmptyState icon={<HandCoins className="h-6 w-6" />} title="Nenhum recebimento registrado" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Cliente</Th>
                  <Th>Pedido</Th>
                  <Th>Forma</Th>
                  <Th>Origem</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {pagamentos.data.slice(0, 200).map((p) => (
                  <Tr key={p.id}>
                    <Td className="whitespace-nowrap">{formatData(p.data)}</Td>
                    <Td className="max-w-[220px] truncate">{p.cliente?.nome}</Td>
                    <Td>
                      <Link to={`/pedidos/${p.pedido_id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                        #{p.pedido?.numero}
                      </Link>
                    </Td>
                    <Td>{FORMA_PAGAMENTO[p.forma]}</Td>
                    <Td className="text-xs text-slate-500">{p.entrega_id ? 'Recebido na entrega' : p.observacao || 'Registro manual'}</Td>
                    <Td className="tabular text-right font-medium">{formatBRL(p.valor)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      <RegistrarPagamentoModal parcela={pagar} contexto={pagar ? `${pagar.cliente?.nome} · Pedido #${pagar.pedido?.numero}` : undefined} onClose={() => setPagar(null)} />
    </>
  );
}
