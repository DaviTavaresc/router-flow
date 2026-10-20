/**
 * Mapa de rotas — implementação com Leaflet + OpenStreetMap.
 * Para Mapbox, defina VITE_MAPBOX_TOKEN (troca apenas a camada de tiles).
 * Para Google Maps / Mapbox GL, crie outra implementação de RouteMapProps.
 *
 * Os traçados são LINHAS RETAS entre paradas (aproximação visual); a geometria
 * real de ruas virá do provedor de rotas quando integrado.
 */
import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { cn } from '@/lib/cn';
import type { LatLng } from '@/services/geo';
import type { MapStop, RouteMapProps } from './types';

const MAPBOX = import.meta.env.VITE_MAPBOX_TOKEN;
const TILE = MAPBOX
  ? {
      url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX}`,
      attribution: '© Mapbox © OpenStreetMap',
    }
  : {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap',
    };

function iconeNumero(texto: string, cor: string, extra = '', tamanho = 26) {
  return L.divIcon({
    className: '',
    html: `<div class="rf-marker ${extra}" style="width:${tamanho}px;height:${tamanho}px;background:${cor}">${texto}</div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho / 2],
    popupAnchor: [0, -tamanho / 2],
  });
}

const iconeDeposito = L.divIcon({
  className: '',
  html: `<div class="rf-marker rf-marker--depot" style="width:30px;height:30px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/></svg></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

/**
 * Clientes do mesmo bairro compartilham a mesma coordenada aproximada.
 * Para que todos fiquem visíveis, espalhamos os marcadores sobrepostos em um
 * pequeno círculo — APENAS na exibição (os dados não são alterados).
 */
function espalhar<T extends LatLng>(pontos: T[]): (T & { exibir: LatLng })[] {
  const grupos = new Map<string, number>();
  const contagem = new Map<string, number>();
  for (const p of pontos) {
    const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  return pontos.map((p) => {
    const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const total = contagem.get(k)!;
    const i = grupos.get(k) ?? 0;
    grupos.set(k, i + 1);
    if (total === 1) return { ...p, exibir: { lat: p.lat, lng: p.lng } };
    const raio = 0.0011 + total * 0.00008;
    const ang = (2 * Math.PI * i) / total;
    return { ...p, exibir: { lat: p.lat + raio * Math.sin(ang), lng: p.lng + raio * Math.cos(ang) } };
  });
}

function AjustarLimites({ pontos, chave }: { pontos: LatLng[]; chave: string }) {
  const map = useMap();
  useEffect(() => {
    if (!pontos.length) return;
    if (pontos.length === 1) {
      map.setView([pontos[0].lat, pontos[0].lng], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, map]);
  useEffect(() => {
    // corrige tamanho quando o container muda (abas, modais)
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function PopupParada({ p }: { p: MapStop }) {
  return (
    <Popup>
      <div className="space-y-0.5">
        <p className="font-semibold">
          {p.ordem != null && <span className="mr-1 text-slate-500">#{p.ordem}</span>}
          {p.titulo}
        </p>
        {p.subtitulo && <p className="text-slate-500">{p.subtitulo}</p>}
        <p className="pt-1 text-[11px] text-slate-400">Localização aproximada</p>
      </div>
    </Popup>
  );
}

export function RouteMap({ partida, rotas = [], avulsos = [], className, destaque, onStopClick, legenda = true }: RouteMapProps) {
  const todos = useMemo(() => {
    const pts: LatLng[] = [];
    if (partida) pts.push(partida);
    rotas.forEach((r) => pts.push(...r.paradas));
    pts.push(...avulsos);
    return pts;
  }, [partida, rotas, avulsos]);

  const espalhados = useMemo(() => {
    const flat = [
      ...rotas.flatMap((r) => r.paradas.map((p) => ({ ...p, rota: r.id, cor: r.cor }))),
      ...avulsos.map((p) => ({ ...p, rota: null as string | null, cor: '#94a3b8' })),
    ];
    return espalhar(flat);
  }, [rotas, avulsos]);

  const chave = useMemo(() => todos.map((p) => `${p.lat.toFixed(3)}${p.lng.toFixed(3)}`).join('|'), [todos]);
  const centro: [number, number] = todos.length ? [todos[0].lat, todos[0].lng] : [-14.235, -51.925];

  return (
    <div className={cn('relative isolate overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800', className)}>
      <MapContainer center={centro} zoom={todos.length ? 12 : 4} scrollWheelZoom className="h-full w-full" attributionControl>
        <TileLayer url={TILE.url} attribution={TILE.attribution} />
        <AjustarLimites pontos={todos} chave={chave} />

        {rotas.map((r) => {
          const pts = espalhados.filter((p) => p.rota === r.id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
          const linha: [number, number][] = [
            ...(partida ? [[partida.lat, partida.lng] as [number, number]] : []),
            ...pts.map((p) => [p.exibir.lat, p.exibir.lng] as [number, number]),
          ];
          const apagada = destaque && destaque !== r.id;
          return (
            <Polyline
              key={r.id}
              positions={linha}
              pathOptions={{ color: r.cor, weight: apagada ? 2 : 3.5, opacity: apagada ? 0.25 : 0.85, dashArray: '6 6' }}
            />
          );
        })}

        {espalhados.map((p) => {
          const apagada = destaque && p.rota !== destaque;
          const extra = [p.rota ? '' : 'rf-marker--pool', p.concluida || apagada ? 'rf-marker--done' : ''].join(' ');
          const texto = p.falhou ? '!' : p.ordem != null ? String(p.ordem) : '•';
          return (
            <Marker
              key={`${p.rota ?? 'pool'}-${p.id}`}
              position={[p.exibir.lat, p.exibir.lng]}
              icon={iconeNumero(texto, p.falhou ? '#d03b3b' : p.cor, extra)}
              eventHandlers={onStopClick ? { click: () => onStopClick(p.id) } : undefined}
            >
              <PopupParada p={p} />
            </Marker>
          );
        })}

        {partida && (
          <Marker position={[partida.lat, partida.lng]} icon={iconeDeposito} zIndexOffset={1000}>
            <Popup>
              <p className="font-semibold">Ponto de partida</p>
              {partida.titulo && <p className="text-slate-500">{partida.titulo}</p>}
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {legenda && (rotas.length > 0 || avulsos.length > 0) && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] max-w-[70%] rounded-lg bg-white/95 px-3 py-2 text-xs shadow-md ring-1 ring-slate-200 dark:bg-slate-900/95 dark:ring-slate-700">
          <ul className="space-y-1">
            {rotas.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.cor }} />
                <span className="truncate">{r.nome}</span>
                <span className="tabular text-slate-400">{r.paradas.length}</span>
              </li>
            ))}
            {avulsos.length > 0 && (
              <li className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Sem rota <span className="tabular text-slate-400">{avulsos.length}</span>
              </li>
            )}
          </ul>
          <p className="mt-1.5 text-[10px] text-slate-400">Traçado aproximado (linha reta)</p>
        </div>
      )}
    </div>
  );
}

export default RouteMap;
