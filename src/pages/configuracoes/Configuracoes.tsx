import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Crosshair, Database, Map, Moon, Package, Pencil, Plus, Route as RouteIcon, Sun, Trash2 } from 'lucide-react';
import { useSessao, useSession } from '@/app/session';
import { useTheme } from '@/app/theme';
import { useAcao } from '@/app/hooks';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  MoneyInput,
  Select,
  Skeleton,
  Table,
  TableSkeleton,
  Tabs,
  Td,
  Th,
  Toggle,
  Tr,
  useConfirm,
  useToast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import { UFS } from '@/lib/labels';
import { MODO_DEMO } from '@/services/data';
import { apagarTodosDados, localizarPartida, salvarEmpresa, type EmpresaForm } from '@/services/api/empresa';
import { excluirProduto, listarProdutos, salvarProduto, type ProdutoForm } from '@/services/api/pedidos';
import type { Produto } from '@/types';

const RouteMap = lazy(() => import('@/components/map/RouteMap'));

type Aba = 'empresa' | 'rotas' | 'produtos' | 'integracoes' | 'aparencia';

export default function Configuracoes() {
  const [aba, setAba] = useState<Aba>('empresa');
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-slate-500">Empresa, parâmetros de rota, catálogo e integrações.</p>
      </div>
      <Tabs
        className="mb-6"
        value={aba}
        onChange={setAba}
        items={[
          { value: 'empresa', label: 'Empresa' },
          { value: 'rotas', label: 'Rotas e partida' },
          { value: 'produtos', label: 'Produtos' },
          { value: 'integracoes', label: 'Integrações' },
          { value: 'aparencia', label: 'Aparência' },
        ]}
      />
      {aba === 'empresa' && <AbaEmpresa />}
      {aba === 'rotas' && <AbaRotas />}
      {aba === 'produtos' && <AbaProdutos />}
      {aba === 'integracoes' && <AbaIntegracoes />}
      {aba === 'aparencia' && <AbaAparencia />}
    </>
  );
}

function useFormEmpresa() {
  const { empresa } = useSessao();
  const { atualizarEmpresa } = useSession();
  const { id: _id, created_at: _c, updated_at: _u, ...inicial } = empresa;
  const [form, setForm] = useState<EmpresaForm>(inicial);
  const salvar = useAcao((f: EmpresaForm) => salvarEmpresa(empresa.id, f), { sucesso: 'Configurações salvas', onSuccess: atualizarEmpresa });
  const set = <K extends keyof EmpresaForm>(k: K, v: EmpresaForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  return { form, set, salvar };
}

function AbaEmpresa() {
  const { form, set, salvar } = useFormEmpresa();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Dados da empresa" description="Cada empresa enxerga apenas os próprios dados." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nome da empresa" required className="sm:col-span-2">
            {(id) => <Input id={id} value={form.nome} onChange={(e) => set('nome', e.target.value)} />}
          </Field>
          <Field label="Cidade" hint="Valor padrão no cadastro de clientes.">
            {(id) => <Input id={id} value={form.cidade} onChange={(e) => set('cidade', e.target.value)} />}
          </Field>
          <Field label="Estado">
            {(id) => (
              <Select id={id} value={form.estado} onChange={(e) => set('estado', e.target.value)}>
                {UFS.map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Button onClick={() => salvar.mutate(form)} loading={salvar.isPending}>
              Salvar
            </Button>
          </div>
        </div>
      </Card>
      {MODO_DEMO && (
        <Card>
          <CardHeader title="Armazenamento local" description="Neste modo, os dados ficam salvos apenas neste navegador." />
          <div className="space-y-4 p-5">
            <p className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
              <Database className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
              Para usar em vários aparelhos (ex.: motoristas no celular), configure o banco Supabase. Abaixo você pode apagar tudo e recomeçar do zero.
            </p>
            <Button
              variant="danger"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Apagar todos os dados?',
                  description: 'Empresa, usuários, clientes, pedidos, rotas e pagamentos serão apagados permanentemente deste navegador. Você voltará à configuração inicial.',
                  confirmLabel: 'Apagar tudo',
                });
                if (!ok) return;
                await apagarTodosDados();
                qc.clear();
                toast.success('Dados apagados');
                window.location.assign('/primeiro-acesso');
              }}
            >
              Apagar todos os dados
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function AbaRotas() {
  const { form, set, salvar } = useFormEmpresa();
  const toast = useToast();
  const [busca, setBusca] = useState({ bairro: '', cidade: form.cidade, estado: form.estado });
  const [localizando, setLocalizando] = useState(false);

  const localizar = async () => {
    setLocalizando(true);
    try {
      const r = await localizarPartida(busca.bairro, busca.cidade, busca.estado);
      set('partida_lat', r.lat);
      set('partida_lng', r.lng);
      toast.success('Ponto de partida localizado', r.precisao === 'cidade' ? 'Precisão aproximada pela cidade.' : 'Precisão aproximada pelo bairro.');
    } catch (e) {
      toast.fromError(e, 'Não foi possível localizar');
    } finally {
      setLocalizando(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Ponto de partida" description="Local de onde os motoristas saem (depósito, loja ou centro de distribuição)." />
        <div className="space-y-4 p-5">
          <Field label="Descrição">
            {(id) => <Input id={id} value={form.partida_descricao} onChange={(e) => set('partida_descricao', e.target.value)} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px]">
            <Input placeholder="Bairro" value={busca.bairro} onChange={(e) => setBusca((b) => ({ ...b, bairro: e.target.value }))} aria-label="Bairro" />
            <Input placeholder="Cidade" value={busca.cidade} onChange={(e) => setBusca((b) => ({ ...b, cidade: e.target.value }))} aria-label="Cidade" />
            <Select value={busca.estado} onChange={(e) => setBusca((b) => ({ ...b, estado: e.target.value }))} aria-label="UF">
              {UFS.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </Select>
          </div>
          <Button variant="outline" icon={<Crosshair className="h-4 w-4" />} onClick={localizar} loading={localizando}>
            Localizar
          </Button>
          <Suspense fallback={<Skeleton className="h-56 w-full rounded-xl" />}>
            <RouteMap className="h-56" legenda={false} partida={{ lat: form.partida_lat, lng: form.partida_lng, titulo: form.partida_descricao }} />
          </Suspense>
          <p className="tabular text-xs text-slate-500">
            Coordenadas técnicas: {form.partida_lat.toFixed(5)}, {form.partida_lng.toFixed(5)}
          </p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Parâmetros de estimativa" description="Usados no cálculo de distância e tempo enquanto não há API de rotas integrada." />
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Velocidade média (km/h)">
              {(id) => <Input id={id} type="number" min={5} max={120} value={form.velocidade_media_kmh} onChange={(e) => set('velocidade_media_kmh', Number(e.target.value))} className="tabular" />}
            </Field>
            <Field label="Tempo por parada (min)">
              {(id) => <Input id={id} type="number" min={0} max={120} value={form.tempo_parada_min} onChange={(e) => set('tempo_parada_min', Number(e.target.value))} className="tabular" />}
            </Field>
            <Field label="Fator de rota" hint="Multiplica a distância em linha reta (ruas não são retas). Típico: 1,3 a 1,4.">
              {(id) => <Input id={id} type="number" step={0.05} min={1} max={3} value={form.fator_rota} onChange={(e) => set('fator_rota', Number(e.target.value))} className="tabular" />}
            </Field>
            <Field label="App de navegação">
              {(id) => (
                <Select id={id} value={form.app_navegacao} onChange={(e) => set('app_navegacao', e.target.value as 'google' | 'waze')}>
                  <option value="google">Google Maps</option>
                  <option value="waze">Waze</option>
                </Select>
              )}
            </Field>
          </div>
          <Toggle checked={form.considerar_retorno} onChange={(v) => set('considerar_retorno', v)} label="Considerar retorno ao ponto de partida" />
          <Button icon={<RouteIcon className="h-4 w-4" />} onClick={() => salvar.mutate(form)} loading={salvar.isPending}>
            Salvar parâmetros
          </Button>
        </div>
      </Card>
    </div>
  );
}

function AbaProdutos() {
  const q = useQuery({ queryKey: ['produtos'], queryFn: listarProdutos });
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ open: boolean; p: Produto | null }>({ open: false, p: null });
  const excluir = useAcao(excluirProduto, { sucesso: 'Produto excluído' });
  const alternar = useAcao((p: Produto) => salvarProduto(p.id, { nome: p.nome, unidade: p.unidade, preco: p.preco, peso_kg: p.peso_kg, ativo: !p.ativo }), {
    sucesso: 'Produto atualizado',
  });

  return (
    <Card>
      <CardHeader
        title="Catálogo de produtos"
        description="O peso é usado para respeitar a capacidade dos veículos."
        action={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true, p: null })}>
            Novo produto
          </Button>
        }
      />
      {q.isLoading ? (
        <TableSkeleton />
      ) : !q.data?.length ? (
        <EmptyState icon={<Package className="h-6 w-6" />} title="Nenhum produto" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Produto</Th>
              <Th>Unidade</Th>
              <Th className="text-right">Preço</Th>
              <Th className="text-right">Peso</Th>
              <Th>Ativo</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {q.data.map((p) => (
              <Tr key={p.id}>
                <Td className={cn('font-medium', !p.ativo && 'text-slate-400 line-through')}>{p.nome}</Td>
                <Td>{p.unidade}</Td>
                <Td className="tabular text-right">{formatBRL(p.preco)}</Td>
                <Td className="tabular text-right">{p.peso_kg.toLocaleString('pt-BR')} kg</Td>
                <Td>
                  <Toggle checked={p.ativo} onChange={() => alternar.mutate(p)} />
                </Td>
                <Td className="text-right">
                  <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setModal({ open: true, p })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Excluir"
                    className="hover:text-red-600"
                    onClick={async () => {
                      if (await confirm({ title: 'Excluir produto?', description: `${p.nome} será removido do catálogo.`, confirmLabel: 'Excluir' })) excluir.mutate(p.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <ProdutoModal open={modal.open} produto={modal.p} onClose={() => setModal({ open: false, p: null })} />
    </Card>
  );
}

function ProdutoModal({ open, produto, onClose }: { open: boolean; produto: Produto | null; onClose: () => void }) {
  const vazio: ProdutoForm = { nome: '', unidade: 'un', preco: 0, peso_kg: 0, ativo: true };
  const [form, setForm] = useState<ProdutoForm>(vazio);
  const salvar = useAcao((f: ProdutoForm) => salvarProduto(produto?.id ?? null, f), { sucesso: 'Produto salvo', onSuccess: onClose });
  useEffect(() => {
    if (open) setForm(produto ? { nome: produto.nome, unidade: produto.unidade, preco: produto.preco, peso_kg: produto.peso_kg, ativo: produto.ativo } : vazio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, produto]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={produto ? 'Editar produto' : 'Novo produto'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate(form)} loading={salvar.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" required className="sm:col-span-2">
          {(id) => <Input id={id} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />}
        </Field>
        <Field label="Unidade">
          {(id) => <Input id={id} value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />}
        </Field>
        <Field label="Preço">
          {(id) => <MoneyInput id={id} value={form.preco} onValueChange={(v) => setForm({ ...form, preco: v })} />}
        </Field>
        <Field label="Peso (kg)" className="sm:col-span-2">
          {(id) => <Input id={id} type="number" min={0} step={0.1} value={form.peso_kg} onChange={(e) => setForm({ ...form, peso_kg: Number(e.target.value) })} className="tabular" />}
        </Field>
      </div>
    </Modal>
  );
}

function AbaIntegracoes() {
  const env = import.meta.env;
  const itens = [
    {
      icon: Database,
      nome: 'Banco de dados',
      status: MODO_DEMO ? 'Modo demonstração (navegador)' : 'Supabase / PostgreSQL',
      ativo: !MODO_DEMO,
      detalhe: 'VITE_DATA_SOURCE=supabase + VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY',
    },
    {
      icon: Map,
      nome: 'Mapa',
      status: env.VITE_MAPBOX_TOKEN ? 'Mapbox' : 'OpenStreetMap (Leaflet)',
      ativo: true,
      detalhe: 'VITE_MAPBOX_TOKEN para tiles Mapbox. Google Maps: nova implementação de RouteMap.',
    },
    {
      icon: Crosshair,
      nome: 'Geocodificação',
      status: env.VITE_GEOCODER === 'nominatim' ? 'Gazetteer local + Nominatim (OSM)' : 'Gazetteer local (aproximado)',
      ativo: env.VITE_GEOCODER === 'nominatim',
      detalhe: 'Interface Geocoder em src/services/geo — pronta para Mapbox/Google Geocoding.',
    },
    {
      icon: RouteIcon,
      nome: 'Distâncias e otimização',
      status: 'Estimativa (linha reta × fator) + heurística local',
      ativo: false,
      detalhe: 'Interfaces DistanceProvider / RouteOptimizer — prontas para OSRM, VROOM, Google Route Optimization.',
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {itens.map((i) => (
        <Card key={i.nome} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <i.icon className="h-5 w-5" />
              </span>
              <span>
                <p className="font-semibold">{i.nome}</p>
                <p className="text-sm text-slate-500">{i.status}</p>
              </span>
            </span>
            <Badge tone={i.ativo ? 'green' : 'neutral'}>{i.ativo ? 'Integrado' : 'Padrão'}</Badge>
          </div>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">{i.detalhe}</p>
        </Card>
      ))}
    </div>
  );
}

function AbaAparencia() {
  const { tema, definir } = useTheme();
  return (
    <Card className="max-w-xl">
      <CardHeader title="Tema" description="Preferência salva neste dispositivo." />
      <div className="grid grid-cols-2 gap-3 p-5">
        {(['light', 'dark'] as const).map((t) => (
          <button
            key={t}
            onClick={() => definir(t)}
            className={cn(
              'flex items-center gap-3 rounded-xl border p-4 text-left',
              tema === t ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200 dark:border-slate-700',
            )}
          >
            {t === 'light' ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5 text-brand-400" />}
            <span className="font-medium">{t === 'light' ? 'Claro' : 'Escuro'}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-5 pb-5 text-xs text-slate-500">
        <Building2 className="h-3.5 w-3.5" /> RouteFlow · Gestão inteligente de entregas
      </div>
    </Card>
  );
}
