import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, ShoppingCart } from 'lucide-react';
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
  Select,
  StatusBadge,
  Table,
  TableSkeleton,
  Tabs,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { listarPedidos } from '@/services/api/pedidos';
import { ENTREGA_STATUS, FORMA_PAGAMENTO, PEDIDO_STATUS } from '@/lib/labels';
import { formatBRL, formatData, normalizar } from '@/lib/format';
import type { PedidoStatus } from '@/types';

const POR_PAGINA = 12;
type Aba = 'todos' | 'abertos' | PedidoStatus;

export default function Pedidos() {
  const { usuario } = useSessao();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['pedidos'], queryFn: listarPedidos });
  const [aba, setAba] = useState<Aba>('abertos');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pagina, setPagina] = useState(1);
  const buscaDeb = useDebounced(busca);

  const dados = q.data ?? [];
  const abertos = (s: PedidoStatus) => !['entregue', 'cancelado'].includes(s);

  const filtrados = useMemo(() => {
    const t = normalizar(buscaDeb).replace('#', '');
    return dados.filter(
      (p) =>
        (aba === 'todos' || (aba === 'abertos' ? abertos(p.status) : p.status === aba)) &&
        (!t || String(p.numero).includes(t) || normalizar(p.cliente?.nome ?? '').includes(t)) &&
        (!tipo || p.tipo_venda === tipo) &&
        (!de || p.data_venda >= de) &&
        (!ate || p.data_venda <= ate),
    );
  }, [dados, aba, buscaDeb, tipo, de, ate]);

  const count = (f: (s: PedidoStatus) => boolean) => dados.filter((p) => f(p.status)).length;
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(filtrados.length / POR_PAGINA)));
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Vendas, condições de pagamento e status de entrega."
        actions={
          pode(usuario.perfil, 'pedido.criar') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/pedidos/novo')}>
              Novo pedido
            </Button>
          )
        }
      />
      <Tabs
        className="mb-4"
        value={aba}
        onChange={(v) => {
          setAba(v);
          setPagina(1);
        }}
        items={[
          { value: 'abertos', label: 'Em aberto', count: count(abertos) },
          { value: 'novo', label: 'Novos', count: count((s) => s === 'novo') },
          { value: 'preparando', label: 'Preparando', count: count((s) => s === 'preparando') },
          { value: 'pronto', label: 'Prontos', count: count((s) => s === 'pronto') },
          { value: 'em_rota', label: 'Em rota', count: count((s) => s === 'em_rota') },
          { value: 'entregue', label: 'Entregues', count: count((s) => s === 'entregue') },
          { value: 'cancelado', label: 'Cancelados', count: count((s) => s === 'cancelado') },
          { value: 'todos', label: 'Todos', count: dados.length },
        ]}
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_160px_160px_160px] dark:border-slate-800">
          <SearchInput value={busca} onChange={(v) => { setBusca(v); setPagina(1); }} placeholder="Buscar por nº do pedido ou cliente" />
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Forma da venda">
            <option value="">À vista e a prazo</option>
            <option value="avista">À vista</option>
            <option value="prazo">A prazo</option>
          </Select>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Vendas a partir de" title="Vendas a partir de" />
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Vendas até" title="Vendas até" />
        </div>
        {q.isLoading ? (
          <TableSkeleton />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : filtrados.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="h-6 w-6" />}
            title="Nenhum pedido encontrado"
            description="Ajuste os filtros ou crie um novo pedido."
            action={pode(usuario.perfil, 'pedido.criar') && <Button onClick={() => navigate('/pedidos/novo')}>Novo pedido</Button>}
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Pedido</Th>
                  <Th>Cliente</Th>
                  <Th>Venda</Th>
                  <Th>Entrega</Th>
                  <Th>Pagamento</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Em aberto</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => (
                  <Tr key={p.id} onClick={() => navigate(`/pedidos/${p.id}`)}>
                    <Td className="font-semibold text-slate-900 dark:text-white">#{p.numero}</Td>
                    <Td>
                      <p className="max-w-[220px] truncate font-medium text-slate-800 dark:text-slate-200">{p.cliente?.nome}</p>
                      <p className="text-xs text-slate-500">{p.cliente?.bairro}</p>
                    </Td>
                    <Td className="whitespace-nowrap">{formatData(p.data_venda)}</Td>
                    <Td className="whitespace-nowrap">
                      <p>{formatData(p.entrega?.data ?? p.data_entrega)}</p>
                      {p.entrega && <p className="text-xs text-slate-500">{ENTREGA_STATUS[p.entrega.status].label}</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {p.tipo_venda === 'prazo' ? (
                        <span>A prazo · {p.parcelas_qtd}x</span>
                      ) : (
                        <span>{p.forma_pagamento ? FORMA_PAGAMENTO[p.forma_pagamento] : 'À vista'}</span>
                      )}
                    </Td>
                    <Td className="tabular whitespace-nowrap text-right font-medium">{formatBRL(p.total)}</Td>
                    <Td className="tabular whitespace-nowrap text-right">{p.saldo > 0 ? <span className="text-amber-700 dark:text-amber-400">{formatBRL(p.saldo)}</span> : '—'}</Td>
                    <Td>
                      <StatusBadge map={PEDIDO_STATUS} value={p.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={paginaAtual} pageSize={POR_PAGINA} total={filtrados.length} onPage={setPagina} />
          </>
        )}
      </Card>
    </>
  );
}
