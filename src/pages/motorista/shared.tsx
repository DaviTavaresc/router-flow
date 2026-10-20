import { useState } from 'react';
import { CircleAlert, CheckCircle2, Navigation } from 'lucide-react';
import { useSessao } from '@/app/session';
import { Button } from '@/components/ui';
import { ConfirmarEntregaModal, FalhaEntregaModal } from '@/components/domain/EntregaModals';
import { urlNavegacao, type AppNavegacao } from '@/services/geo';
import type { EntregaView } from '@/types';

export function abrirNavegacao(e: EntregaView, app: AppNavegacao) {
  const c = e.cliente;
  const url = urlNavegacao(app, {
    coords: c?.latitude != null && c?.longitude != null ? { lat: c.latitude, lng: c.longitude } : null,
    descricao: c ? `${c.bairro}, ${c.cidade} - ${c.estado}` : '',
  });
  window.open(url, '_blank', 'noopener');
}

/** Botões de ação de uma entrega (grandes, para uso com uma mão durante a rota). */
export function AcoesEntrega({ entrega, onConcluida, detalhes }: { entrega: EntregaView; onConcluida?: () => void; detalhes?: () => void }) {
  const { empresa } = useSessao();
  const [confirmar, setConfirmar] = useState<EntregaView | null>(null);
  const [falha, setFalha] = useState<EntregaView | null>(null);
  const outro: AppNavegacao = empresa.app_navegacao === 'google' ? 'waze' : 'google';
  const aberta = ['pendente', 'em_rota', 'reagendada'].includes(entrega.status);

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <Button size="lg" className="flex-1" icon={<Navigation className="h-5 w-5" />} onClick={() => abrirNavegacao(entrega, empresa.app_navegacao)}>
          Iniciar navegação
        </Button>
        <Button size="lg" variant="outline" onClick={() => abrirNavegacao(entrega, outro)} title={`Abrir no ${outro === 'waze' ? 'Waze' : 'Google Maps'}`}>
          {outro === 'waze' ? 'Waze' : 'Maps'}
        </Button>
      </div>
      {detalhes && (
        <Button size="lg" variant="outline" className="w-full" onClick={detalhes}>
          Ver detalhes
        </Button>
      )}
      {aberta && (
        <>
          <Button size="lg" variant="success" className="h-14 w-full text-base" icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setConfirmar(entrega)}>
            Confirmar entrega
          </Button>
          <Button size="lg" variant="ghost" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10" icon={<CircleAlert className="h-5 w-5" />} onClick={() => setFalha(entrega)}>
            Não foi possível entregar
          </Button>
        </>
      )}
      <ConfirmarEntregaModal entrega={confirmar} onClose={() => setConfirmar(null)} onDone={onConcluida} />
      <FalhaEntregaModal entrega={falha} onClose={() => setFalha(null)} onDone={onConcluida} />
    </div>
  );
}
