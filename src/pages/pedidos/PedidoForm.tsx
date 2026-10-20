import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CreditCard, Lock, Package, Plus, Trash2, UserPlus } from 'lucide-react';
import { Button, Card, CardHeader, Checkbox, ErrorState, Field, Input, MoneyInput, PageSkeleton, Select, Textarea, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { amanhaISO, hojeISO, somarDias } from '@/lib/dates';
import { formatBRL, formatData, round2 } from '@/lib/format';
import { FORMA_PAGAMENTO, FORMAS_AVISTA, FORMAS_PRAZO, PEDIDO_STATUS } from '@/lib/labels';
import { listarClientes } from '@/services/api/clientes';
import { detalhePedido, listarProdutos, salvarPedido } from '@/services/api/pedidos';
import { calcularTotais, gerarParcelas } from '@/services/domain/financeiro';
import type { FormaPagamento, PedidoStatus, TipoVenda } from '@/types';
import { ClienteFormModal } from '../clientes/ClienteFormModal';
import { ClienteCombobox } from './ClienteCombobox';

interface ItemForm {
  key: string;
  produto_id: string | null;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  peso_kg: number;
}

interface FormState {
  cliente_id: string;
  data_venda: string;
  data_entrega: string;
  status: PedidoStatus;
  observacoes: string;
  desconto: number;
  tipo_venda: TipoVenda;
  forma_pagamento: FormaPagamento | null;
  receber_na_entrega: boolean;
  parcelas_qtd: number;
  intervalo_dias: number;
  primeiro_vencimento: string;
  gerar_entrega: boolean;
}

let seqItem = 0;
const novoItem = (): ItemForm => ({ key: `i${++seqItem}`, produto_id: null, descricao: '', quantidade: 1, valor_unitario: 0, peso_kg: 0 });

export default function PedidoForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const editando = !!id;

  const clientes = useQuery({ queryKey: ['clientes'], queryFn: listarClientes });
  const produtos = useQuery({ queryKey: ['produtos'], queryFn: listarProdutos });
  const detalhe = useQuery({ queryKey: ['pedido', id], queryFn: () => detalhePedido(id!), enabled: editando });

  const [form, setForm] = useState<FormState>(() => ({
    cliente_id: params.get('cliente') ?? '',
    data_venda: hojeISO(),
    data_entrega: amanhaISO(),
    status: 'novo',
    observacoes: '',
    desconto: 0,
    tipo_venda: 'avista',
    forma_pagamento: 'pix',
    receber_na_entrega: true,
    parcelas_qtd: 3,
    intervalo_dias: 30,
    primeiro_vencimento: somarDias(hojeISO(), 30),
    gerar_entrega: true,
  }));
  const [itens, setItens] = useState<ItemForm[]>([novoItem()]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [novoCliente, setNovoCliente] = useState(false);
  const [carregado, setCarregado] = useState(!editando);

  // Preenche o formulário na edição
  useEffect(() => {
    if (!editando || carregado || !detalhe.data) return;
    const { pedido: p, itens: it } = detalhe.data;
    setForm({
      cliente_id: p.cliente_id,
      data_venda: p.data_venda,
      data_entrega: p.data_entrega ?? '',
      status: p.status,
      observacoes: p.observacoes,
      desconto: p.desconto,
      tipo_venda: p.tipo_venda,
      forma_pagamento: p.forma_pagamento,
      receber_na_entrega: p.receber_na_entrega,
      parcelas_qtd: p.parcelas_qtd,
      intervalo_dias: p.intervalo_dias || 30,
      primeiro_vencimento: p.primeiro_vencimento ?? somarDias(p.data_venda, 30),
      gerar_entrega: true,
    });
    setItens(it.map((i) => ({ key: `i${++seqItem}`, produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario, peso_kg: i.peso_kg })));
    setCarregado(true);
  }, [editando, carregado, detalhe.data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErros((e) => ({ ...e, [k]: '' }));
  };
  const setItem = (key: string, patch: Partial<ItemForm>) => {
    setItens((l) => l.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    setErros((e) => ({ ...e, itens: '' }));
  };

  const totais = useMemo(() => calcularTotais(itens, form.desconto), [itens, form.desconto]);
  const pesoTotal = itens.reduce((s, i) => s + i.peso_kg * i.quantidade, 0);
  const parcelas = useMemo(
    () =>
      form.tipo_venda === 'prazo' && totais.total > 0 && form.primeiro_vencimento && form.parcelas_qtd >= 1
        ? gerarParcelas(totais.total, form.parcelas_qtd, form.primeiro_vencimento, form.intervalo_dias)
        : [],
    [form.tipo_venda, totais.total, form.parcelas_qtd, form.primeiro_vencimento, form.intervalo_dias],
  );

  const temPagamentos = (detalhe.data?.pagamentos.length ?? 0) > 0;
  const bloqueado = editando && detalhe.data && ['entregue', 'cancelado'].includes(detalhe.data.pedido.status);

  const validar = () => {
    const e: Record<string, string> = {};
    if (!form.cliente_id) e.cliente_id = 'Selecione o cliente.';
    if (!form.data_venda) e.data_venda = 'Informe a data da venda.';
    if (form.data_entrega && form.data_entrega < form.data_venda) e.data_entrega = 'A entrega não pode ser antes da venda.';
    if (!itens.length || itens.some((i) => !i.descricao.trim() || i.quantidade <= 0)) e.itens = 'Informe produto e quantidade em todas as linhas.';
    else if (totais.subtotal <= 0) e.itens = 'O pedido precisa ter valor.';
    if (form.desconto > totais.subtotal) e.desconto = 'O desconto não pode ser maior que o subtotal.';
    if (form.tipo_venda === 'avista' && !form.forma_pagamento) e.forma_pagamento = 'Selecione a forma de pagamento.';
    if (form.tipo_venda === 'prazo') {
      if (form.parcelas_qtd < 1 || form.parcelas_qtd > 36) e.parcelas_qtd = 'Entre 1 e 36 parcelas.';
      if (!form.primeiro_vencimento) e.primeiro_vencimento = 'Informe o primeiro vencimento.';
    }
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validar()) {
      toast.error('Verifique os campos destacados');
      return;
    }
    setSalvando(true);
    try {
      const pedido = await salvarPedido({
        id: id ?? null,
        pedido: {
          cliente_id: form.cliente_id,
          data_venda: form.data_venda,
          data_entrega: form.data_entrega || null,
          desconto: form.desconto,
          observacoes: form.observacoes.trim(),
          status: form.status,
          tipo_venda: form.tipo_venda,
          forma_pagamento: form.forma_pagamento,
          receber_na_entrega: form.receber_na_entrega,
          parcelas_qtd: form.parcelas_qtd,
          intervalo_dias: form.intervalo_dias,
          primeiro_vencimento: form.tipo_venda === 'prazo' ? form.primeiro_vencimento : null,
        },
        itens: itens.map(({ produto_id, descricao, quantidade, valor_unitario, peso_kg }) => ({ produto_id, descricao, quantidade, valor_unitario, peso_kg })),
        gerar_entrega: form.gerar_entrega,
      });
      await qc.invalidateQueries();
      toast.success(editando ? 'Pedido atualizado' : `Pedido #${pedido.numero} criado`);
      navigate(`/pedidos/${pedido.id}`, { replace: true });
    } catch (err) {
      toast.fromError(err, 'Não foi possível salvar o pedido');
    } finally {
      setSalvando(false);
    }
  };

  if (editando && (detalhe.isLoading || !carregado)) {
    if (detalhe.error) return <ErrorState error={detalhe.error} onRetry={() => detalhe.refetch()} />;
    return <PageSkeleton />;
  }
  if (bloqueado) {
    return (
      <ErrorState error={new Error('Pedidos entregues ou cancelados não podem ser editados.')} onRetry={() => navigate(`/pedidos/${id}`)} />
    );
  }

  const produtosAtivos = (produtos.data ?? []).filter((p) => p.ativo || itens.some((i) => i.produto_id === p.id));

  return (
    <form onSubmit={onSubmit} noValidate>
      <Link to={editando ? `/pedidos/${id}` : '/pedidos'} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> {editando ? `Pedido #${detalhe.data?.pedido.numero}` : 'Pedidos'}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{editando ? `Editar pedido #${detalhe.data?.pedido.numero}` : 'Novo pedido'}</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Cliente e datas */}
          <Card>
            <CardHeader title="Cliente e entrega" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Cliente" required error={erros.cliente_id} className="sm:col-span-2">
                {(fid) => (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <ClienteCombobox id={fid} clientes={clientes.data ?? []} value={form.cliente_id} onChange={(v) => set('cliente_id', v)} invalid={!!erros.cliente_id} />
                    </div>
                    <Button variant="outline" size="icon" onClick={() => setNovoCliente(true)} title="Cadastrar cliente" aria-label="Cadastrar cliente">
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Field>
              <Field label="Data da venda" required error={erros.data_venda}>
                {(fid) => <Input id={fid} type="date" value={form.data_venda} onChange={(e) => set('data_venda', e.target.value)} invalid={!!erros.data_venda} />}
              </Field>
              <Field label="Data prevista para entrega" error={erros.data_entrega} hint="Deixe vazio se ainda não houver data.">
                {(fid) => <Input id={fid} type="date" value={form.data_entrega} min={form.data_venda} onChange={(e) => set('data_entrega', e.target.value)} invalid={!!erros.data_entrega} />}
              </Field>
              <Field label="Status do pedido">
                {(fid) => (
                  <Select id={fid} value={form.status} onChange={(e) => set('status', e.target.value as PedidoStatus)} disabled={['em_rota', 'entregue', 'cancelado'].includes(form.status)}>
                    {(['novo', 'preparando', 'pronto'] as PedidoStatus[]).concat(['novo', 'preparando', 'pronto'].includes(form.status) ? [] : [form.status]).map((s) => (
                      <option key={s} value={s}>
                        {PEDIDO_STATUS[s].label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="flex items-end pb-2">
                {!editando || !detalhe.data?.entregas.length ? (
                  <Checkbox checked={form.gerar_entrega} onChange={(v) => set('gerar_entrega', v)} label="Gerar entrega automaticamente" />
                ) : (
                  <p className="text-xs text-slate-500">A entrega vinculada será atualizada com a nova data.</p>
                )}
              </div>
            </div>
          </Card>

          {/* Produtos */}
          <Card>
            <CardHeader
              title="Produtos"
              description={erros.itens ? <span className="text-red-600">{erros.itens}</span> : `${itens.length} item(ns)`}
              action={
                <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setItens((l) => [...l, novoItem()])} disabled={temPagamentos}>
                  Adicionar
                </Button>
              }
            />
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {itens.map((item) => {
                const livre = !item.produto_id;
                return (
                  <div key={item.key} className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-[1fr_90px_140px_110px_40px] sm:items-end">
                    <div className="col-span-2 space-y-2 sm:col-span-1">
                      <label className="text-xs font-medium text-slate-500">Produto</label>
                      <Select
                        value={item.produto_id ?? (item.descricao ? '__livre' : '')}
                        disabled={temPagamentos}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '__livre' || !v) return setItem(item.key, { produto_id: null, descricao: '', valor_unitario: 0, peso_kg: 0 });
                          const p = produtos.data?.find((x) => x.id === v);
                          if (p) setItem(item.key, { produto_id: p.id, descricao: p.nome, valor_unitario: p.preco, peso_kg: p.peso_kg });
                        }}
                      >
                        <option value="">Selecione um produto</option>
                        {produtosAtivos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome} — {formatBRL(p.preco)}
                          </option>
                        ))}
                        <option value="__livre">Outro (descrição livre)</option>
                      </Select>
                      {livre && (
                        <Input placeholder="Descrição do produto" value={item.descricao} onChange={(e) => setItem(item.key, { descricao: e.target.value })} disabled={temPagamentos} />
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500">Qtd.</label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={item.quantidade}
                        onChange={(e) => setItem(item.key, { quantidade: Math.max(0, Number(e.target.value)) })}
                        className="tabular"
                        disabled={temPagamentos}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500">Valor unitário</label>
                      <MoneyInput value={item.valor_unitario} onValueChange={(v) => setItem(item.key, { valor_unitario: v })} disabled={temPagamentos} />
                    </div>
                    <div className="space-y-2 sm:text-right">
                      <label className="text-xs font-medium text-slate-500">Total</label>
                      <p className="tabular flex h-10 items-center text-sm font-semibold sm:justify-end">{formatBRL(round2(item.quantidade * item.valor_unitario))}</p>
                    </div>
                    <div className="col-span-2 flex justify-end sm:col-span-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remover item"
                        disabled={itens.length === 1 || temPagamentos}
                        onClick={() => setItens((l) => l.filter((i) => i.key !== item.key))}
                        className="hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Pagamento */}
          <Card>
            <CardHeader
              title="Forma da venda"
              description={temPagamentos ? 'Bloqueado: o pedido já possui pagamentos registrados.' : undefined}
              action={temPagamentos && <Lock className="h-4 w-4 text-slate-400" />}
            />
            <fieldset disabled={temPagamentos} className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-3">
                {(['avista', 'prazo'] as TipoVenda[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      set('tipo_venda', t);
                      set('forma_pagamento', t === 'avista' ? 'pix' : 'boleto');
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-4 text-left transition-colors',
                      form.tipo_venda === t
                        ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-500/10'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700',
                    )}
                  >
                    {t === 'avista' ? <CreditCard className="h-5 w-5 text-brand-600" /> : <CalendarDays className="h-5 w-5 text-brand-600" />}
                    <span>
                      <span className="block text-sm font-semibold">{t === 'avista' ? 'À vista' : 'A prazo'}</span>
                      <span className="block text-xs text-slate-500">{t === 'avista' ? 'PIX, dinheiro ou cartão' : 'Parcelas com vencimento'}</span>
                    </span>
                  </button>
                ))}
              </div>

              {form.tipo_venda === 'avista' ? (
                <>
                  <Field label="Forma de pagamento" error={erros.forma_pagamento}>
                    {() => (
                      <div className="flex flex-wrap gap-2">
                        {FORMAS_AVISTA.map((f) => (
                          <Chip key={f} ativo={form.forma_pagamento === f} onClick={() => set('forma_pagamento', f)}>
                            {FORMA_PAGAMENTO[f]}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </Field>
                  <Field label="Recebimento">
                    {() => (
                      <div className="flex flex-wrap gap-2">
                        <Chip ativo={!form.receber_na_entrega} onClick={() => set('receber_na_entrega', false)}>
                          Pago no ato da venda
                        </Chip>
                        <Chip ativo={form.receber_na_entrega} onClick={() => set('receber_na_entrega', true)}>
                          Receber na entrega
                        </Chip>
                      </div>
                    )}
                  </Field>
                </>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Parcelas" error={erros.parcelas_qtd}>
                      {(fid) => (
                        <Input id={fid} type="number" min={1} max={36} value={form.parcelas_qtd} onChange={(e) => set('parcelas_qtd', Math.floor(Number(e.target.value)))} invalid={!!erros.parcelas_qtd} className="tabular" />
                      )}
                    </Field>
                    <Field label="1º vencimento" error={erros.primeiro_vencimento}>
                      {(fid) => <Input id={fid} type="date" value={form.primeiro_vencimento} onChange={(e) => set('primeiro_vencimento', e.target.value)} invalid={!!erros.primeiro_vencimento} />}
                    </Field>
                    <Field label="Intervalo">
                      {(fid) => (
                        <Select id={fid} value={form.intervalo_dias} onChange={(e) => set('intervalo_dias', Number(e.target.value))}>
                          <option value={7}>Semanal (7 dias)</option>
                          <option value={15}>Quinzenal (15 dias)</option>
                          <option value={30}>Mensal</option>
                        </Select>
                      )}
                    </Field>
                  </div>
                  <Field label="Forma prevista">
                    {() => (
                      <div className="flex flex-wrap gap-2">
                        {FORMAS_PRAZO.map((f) => (
                          <Chip key={f} ativo={form.forma_pagamento === f} onClick={() => set('forma_pagamento', f)}>
                            {FORMA_PAGAMENTO[f]}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </Field>
                  {parcelas.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                        {parcelas.length} parcela(s) de {formatBRL(parcelas[0].valor)} — geradas automaticamente
                      </p>
                      <ul className="scroll-thin max-h-56 divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-slate-800">
                        {parcelas.map((p) => (
                          <li key={p.numero} className="flex justify-between px-4 py-2">
                            <span className="text-slate-500">
                              {p.numero}/{p.total_parcelas}
                            </span>
                            <span className="tabular">{formatData(p.vencimento)}</span>
                            <span className="tabular font-medium">{formatBRL(p.valor)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </fieldset>
          </Card>
        </div>

        {/* Resumo */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader title="Resumo" />
            <div className="space-y-4 p-5">
              <Linha label="Subtotal" valor={formatBRL(totais.subtotal)} />
              <Field label="Desconto" error={erros.desconto}>
                {(fid) => <MoneyInput id={fid} value={form.desconto} onValueChange={(v) => set('desconto', v)} disabled={temPagamentos} invalid={!!erros.desconto} />}
              </Field>
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                <span className="text-sm font-medium">Total</span>
                <span className="tabular text-2xl font-semibold tracking-tight">{formatBRL(totais.total)}</span>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Package className="h-3.5 w-3.5" /> Peso estimado: <span className="tabular">{pesoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg</span>
              </p>
              <Field label="Observações">
                {(fid) => <Textarea id={fid} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} placeholder="Instruções para separação ou entrega" />}
              </Field>
              <Button type="submit" className="w-full" size="lg" loading={salvando}>
                {editando ? 'Salvar alterações' : 'Criar pedido'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate(-1)} disabled={salvando}>
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ClienteFormModal open={novoCliente} onClose={() => setNovoCliente(false)} onSaved={(c) => set('cliente_id', c.id)} />
    </form>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        ativo
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {children}
    </button>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="tabular font-medium">{valor}</span>
    </div>
  );
}
