import type {
  EntregaStatus,
  FormaPagamento,
  GeoPrecisao,
  MotivoOcorrencia,
  MotoristaStatus,
  ParcelaStatus,
  PedidoStatus,
  Perfil,
  RotaStatus,
} from '@/types';

export type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan';

interface Label {
  label: string;
  tone: Tone;
}

export const PERFIL: Record<Perfil, string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  motorista: 'Motorista',
};

export const PEDIDO_STATUS: Record<PedidoStatus, Label> = {
  novo: { label: 'Novo', tone: 'blue' },
  preparando: { label: 'Preparando', tone: 'violet' },
  pronto: { label: 'Pronto para entrega', tone: 'cyan' },
  em_rota: { label: 'Em rota', tone: 'amber' },
  entregue: { label: 'Entregue', tone: 'green' },
  cancelado: { label: 'Cancelado', tone: 'red' },
};

export const ENTREGA_STATUS: Record<EntregaStatus, Label> = {
  pendente: { label: 'Pendente', tone: 'neutral' },
  em_rota: { label: 'Em rota', tone: 'amber' },
  entregue: { label: 'Entregue', tone: 'green' },
  nao_entregue: { label: 'Não entregue', tone: 'red' },
  reagendada: { label: 'Reagendada', tone: 'violet' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
};

export const ROTA_STATUS: Record<RotaStatus, Label> = {
  planejada: { label: 'Planejada', tone: 'blue' },
  em_andamento: { label: 'Em andamento', tone: 'amber' },
  concluida: { label: 'Concluída', tone: 'green' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
};

export const MOTORISTA_STATUS: Record<MotoristaStatus, Label> = {
  disponivel: { label: 'Disponível', tone: 'green' },
  em_rota: { label: 'Em rota', tone: 'amber' },
  indisponivel: { label: 'Indisponível', tone: 'neutral' },
};

export const PARCELA_STATUS: Record<ParcelaStatus, Label> = {
  pendente: { label: 'Pendente', tone: 'amber' },
  pago: { label: 'Pago', tone: 'green' },
  vencido: { label: 'Vencido', tone: 'red' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
};

export const FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  cartao: 'Cartão',
  boleto: 'Boleto',
  outro: 'Outro',
};

export const FORMAS_AVISTA: FormaPagamento[] = ['pix', 'dinheiro', 'debito', 'credito'];
export const FORMAS_RECEBIMENTO_ENTREGA: FormaPagamento[] = ['pix', 'dinheiro', 'cartao', 'outro'];
export const FORMAS_PRAZO: FormaPagamento[] = ['boleto', 'pix', 'dinheiro', 'outro'];

export const MOTIVO_OCORRENCIA: Record<MotivoOcorrencia, string> = {
  cliente_ausente: 'Cliente ausente',
  local_nao_encontrado: 'Localização não encontrada',
  cliente_recusou: 'Cliente recusou',
  problema_pagamento: 'Problema com pagamento',
  problema_veiculo: 'Problema com veículo',
  outro: 'Outro',
};

export const GEO_PRECISAO: Record<GeoPrecisao, Label> = {
  exata: { label: 'Localização exata', tone: 'green' },
  bairro: { label: 'Aproximada (bairro)', tone: 'blue' },
  cidade: { label: 'Aproximada (cidade)', tone: 'amber' },
  pendente: { label: 'Sem localização', tone: 'red' },
};

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/**
 * Paleta categórica das rotas (ordem fixa, validada para daltonismo nos pares adjacentes).
 * A cor acompanha o motorista, não a posição da rota na lista.
 */
export const CORES_ROTA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

/** Cor estável por motorista (ordem determinística pelo id) */
export function corDoMotorista(motoristaId: string, motoristas: { id: string }[]): string {
  const idx = [...motoristas].sort((a, b) => a.id.localeCompare(b.id)).findIndex((m) => m.id === motoristaId);
  return CORES_ROTA[(idx < 0 ? 0 : idx) % CORES_ROTA.length];
}
