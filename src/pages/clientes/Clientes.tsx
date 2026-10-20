import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MapPin, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useSessao } from '@/app/session';
import { pode } from '@/app/permissions';
import { useAcao, useDebounced } from '@/app/hooks';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Table,
  TableSkeleton,
  Td,
  Th,
  Tr,
  useConfirm,
} from '@/components/ui';
import { excluirCliente, listarClientes } from '@/services/api/clientes';
import { GEO_PRECISAO } from '@/lib/labels';
import { normalizar, onlyDigits } from '@/lib/format';
import type { Cliente } from '@/types';
import { ClienteFormModal } from './ClienteFormModal';

const POR_PAGINA = 10;

export default function Clientes() {
  const { usuario } = useSessao();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['clientes'], queryFn: listarClientes });
  const [busca, setBusca] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; cliente: Cliente | null }>({ open: false, cliente: null });
  const buscaDeb = useDebounced(busca);
  const excluir = useAcao(excluirCliente, { sucesso: 'Cliente excluído' });

  const dados = q.data ?? [];
  const opcoes = useMemo(
    () => ({
      bairros: [...new Set(dados.filter((c) => !cidade || c.cidade === cidade).map((c) => c.bairro))].sort(),
      cidades: [...new Set(dados.filter((c) => !estado || c.estado === estado).map((c) => c.cidade))].sort(),
      estados: [...new Set(dados.map((c) => c.estado))].sort(),
    }),
    [dados, cidade, estado],
  );

  const filtrados = useMemo(() => {
    const termo = normalizar(buscaDeb);
    const dig = onlyDigits(buscaDeb);
    return dados.filter(
      (c) =>
        (!termo || normalizar(c.nome).includes(termo) || (dig.length >= 3 && onlyDigits(c.telefone).includes(dig))) &&
        (!bairro || c.bairro === bairro) &&
        (!cidade || c.cidade === cidade) &&
        (!estado || c.estado === estado),
    );
  }, [dados, buscaDeb, bairro, cidade, estado]);

  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(filtrados.length / POR_PAGINA)));
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);
  const temFiltro = !!(busca || bairro || cidade || estado);

  const onExcluir = async (c: Cliente) => {
    const ok = await confirm({
      title: 'Excluir cliente?',
      description: (
        <>
          <strong>{c.nome}</strong> será removido permanentemente. Clientes com pedidos não podem ser excluídos.
        </>
      ),
      confirmLabel: 'Excluir',
    });
    if (ok) excluir.mutate(c.id);
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        description={q.data ? `${dados.length} cliente(s) cadastrado(s)` : 'Cadastro de clientes'}
        actions={
          pode(usuario.perfil, 'cliente.criar') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true, cliente: null })}>
              Novo cliente
            </Button>
          )
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_120px] dark:border-slate-800">
          <SearchInput value={busca} onChange={(v) => { setBusca(v); setPagina(1); }} placeholder="Buscar por nome ou telefone" />
          <Select value={bairro} onChange={(e) => { setBairro(e.target.value); setPagina(1); }} aria-label="Filtrar por bairro">
            <option value="">Todos os bairros</option>
            {opcoes.bairros.map((b) => <option key={b}>{b}</option>)}
          </Select>
          <Select value={cidade} onChange={(e) => { setCidade(e.target.value); setBairro(''); setPagina(1); }} aria-label="Filtrar por cidade">
            <option value="">Todas as cidades</option>
            {opcoes.cidades.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select value={estado} onChange={(e) => { setEstado(e.target.value); setCidade(''); setBairro(''); setPagina(1); }} aria-label="Filtrar por estado">
            <option value="">UF</option>
            {opcoes.estados.map((uf) => <option key={uf}>{uf}</option>)}
          </Select>
        </div>

        {q.isLoading ? (
          <TableSkeleton />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : filtrados.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={temFiltro ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            description={temFiltro ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro cliente para começar a vender e entregar.'}
            action={
              temFiltro ? (
                <Button variant="outline" onClick={() => { setBusca(''); setBairro(''); setCidade(''); setEstado(''); }}>
                  Limpar filtros
                </Button>
              ) : (
                pode(usuario.perfil, 'cliente.criar') && <Button onClick={() => setModal({ open: true, cliente: null })}>Novo cliente</Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Telefone</Th>
                  <Th>Bairro</Th>
                  <Th>Cidade / UF</Th>
                  <Th>Localização</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c) => (
                  <Tr key={c.id} onClick={() => navigate(`/clientes/${c.id}`)}>
                    <Td className="font-medium text-slate-900 dark:text-white">{c.nome}</Td>
                    <Td className="tabular whitespace-nowrap">{c.telefone}</Td>
                    <Td>{c.bairro}</Td>
                    <Td className="whitespace-nowrap">
                      {c.cidade} - {c.estado}
                    </Td>
                    <Td>
                      <Badge tone={GEO_PRECISAO[c.geo_precisao].tone} dot={false}>
                        <MapPin className="h-3 w-3" /> {GEO_PRECISAO[c.geo_precisao].label}
                      </Badge>
                    </Td>
                    <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex gap-1">
                        {pode(usuario.perfil, 'cliente.editar') && (
                          <Button variant="ghost" size="icon-sm" aria-label="Editar" title="Editar" onClick={() => setModal({ open: true, cliente: c })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {pode(usuario.perfil, 'cliente.excluir') && (
                          <Button variant="ghost" size="icon-sm" aria-label="Excluir" title="Excluir" onClick={() => onExcluir(c)} className="hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={paginaAtual} pageSize={POR_PAGINA} total={filtrados.length} onPage={setPagina} />
          </>
        )}
      </Card>

      <ClienteFormModal open={modal.open} cliente={modal.cliente} onClose={() => setModal({ open: false, cliente: null })} />
    </>
  );
}
