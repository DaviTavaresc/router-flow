import { describe, expect, it } from 'vitest';
import { gerarParcelas, statusEfetivo } from '@/services/domain/financeiro';
import { otimizarSync, avaliarRota } from '@/services/geo/optimizer';
import { haversineKm } from '@/services/geo/distance';
import { gerarDadosDemo } from '@/services/data/seed';
import { hojeISO } from '@/lib/dates';

const params = { velocidadeMediaKmh: 25, tempoParadaMin: 6, fatorRota: 1.35, considerarRetorno: false };

describe('parcelas', () => {
  it('gera 3 parcelas mensais de R$ 400', () => {
    const p = gerarParcelas(1200, 3, '2026-10-10', 30);
    expect(p.map((x) => x.valor)).toEqual([400, 400, 400]);
    expect(p.map((x) => x.vencimento)).toEqual(['2026-10-10', '2026-11-10', '2026-12-10']);
  });
  it('a soma das parcelas é exata', () => {
    const p = gerarParcelas(100, 3, '2026-01-31', 30);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(100, 2);
    expect(p[2].valor).toBe(33.34);
  });
  it('pendente com vencimento passado é vencida', () => {
    expect(statusEfetivo({ status: 'pendente', vencimento: '2020-01-01' }, '2026-10-06')).toBe('vencido');
    expect(statusEfetivo({ status: 'pago', vencimento: '2020-01-01' }, '2026-10-06')).toBe('pago');
  });
});

describe('otimizador', () => {
  // 35 paradas em 4 "bairros" distantes entre si
  const centros = [
    { lat: -3.03, lng: -60.0 },
    { lat: -3.07, lng: -60.1 },
    { lat: -3.14, lng: -60.02 },
    { lat: -3.06, lng: -59.93 },
  ];
  const paradas = Array.from({ length: 35 }, (_, i) => {
    const c = centros[i % 4];
    return { id: `e${i}`, lat: c.lat + ((i * 7) % 5) * 0.002, lng: c.lng + ((i * 3) % 5) * 0.002, pesoKg: 10 };
  });
  const partida = { lat: -3.127, lng: -59.96 };
  const veiculos = ['a', 'b', 'c', 'd'].map((id) => ({ id, capacidadeKg: 200 }));

  it('atribui todas as entregas e respeita a capacidade', () => {
    const r = otimizarSync({ partida, paradas, veiculos, parametros: params });
    const todas = r.rotas.flatMap((x) => x.paradas);
    expect(new Set(todas).size).toBe(35);
    expect(r.rotas.every((x) => x.cargaKg <= 200)).toBe(true);
    expect(r.rotas.every((x) => x.paradas.length > 0)).toBe(true);
  });

  it('agrupa geograficamente (cada rota fica em poucos bairros)', () => {
    const r = otimizarSync({ partida, paradas, veiculos, parametros: params });
    for (const rota of r.rotas) {
      const bairros = new Set(rota.paradas.map((id) => Number(id.slice(1)) % 4));
      expect(bairros.size).toBeLessThanOrEqual(2);
    }
  });

  it('é melhor que dividir pela quantidade (round-robin)', () => {
    const r = otimizarSync({ partida, paradas, veiculos, parametros: params });
    const ingenuo = veiculos.map((_, v) =>
      avaliarRota(partida, paradas.filter((_, i) => i % 4 === (v + 1) % 4 && i % 3 === 0).concat(paradas.filter((_, i) => i % 4 === v && i % 3 !== 0)), params),
    );
    const kmIngenuo = ingenuo.reduce((s, x) => s + x.distanciaKm, 0);
    expect(r.totalKm).toBeLessThan(kmIngenuo);
  });

  it('é determinístico', () => {
    const a = otimizarSync({ partida, paradas, veiculos, parametros: params });
    const b = otimizarSync({ partida, paradas, veiculos, parametros: params });
    expect(a.rotas.map((x) => x.paradas)).toEqual(b.rotas.map((x) => x.paradas));
  });

  it('deixa de fora paradas sem localização', () => {
    const r = otimizarSync({ partida, paradas: [...paradas, { id: 'x', lat: NaN, lng: NaN }], veiculos, parametros: params });
    expect(r.naoAtribuidas.map((x) => x.id)).toEqual(['x']);
  });

  it('haversine aproximado', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1);
  });
});

describe('dados de demonstração', () => {
  const db = gerarDadosDemo();
  const hoje = hojeISO();
  it('possui o volume esperado', () => {
    expect(db.clientes.length).toBeGreaterThanOrEqual(10);
    expect(db.clientes.length).toBeLessThanOrEqual(20);
    expect(db.motoristas.length).toBe(4);
    expect(db.pedidos.length).toBeGreaterThanOrEqual(10);
  });
  it('tem rotas hoje e entregas para amanhã', () => {
    expect(db.rotas.filter((r) => r.data === hoje).length).toBeGreaterThanOrEqual(2);
    expect(db.rotas.some((r) => r.data === hoje && r.status === 'em_andamento')).toBe(true);
    expect(db.entregas.filter((e) => e.data > hoje && e.status !== 'cancelada').length).toBeGreaterThan(5);
  });
  it('tem vendas à vista e a prazo, parcelas pagas e vencidas', () => {
    expect(db.pedidos.some((p) => p.tipo_venda === 'avista')).toBe(true);
    expect(db.pedidos.some((p) => p.tipo_venda === 'prazo')).toBe(true);
    expect(db.parcelas.some((p) => p.status === 'pago')).toBe(true);
    expect(db.parcelas.some((p) => p.status === 'pendente' && p.vencimento < hoje)).toBe(true);
  });
  it('mantém a consistência financeira', () => {
    for (const p of db.pedidos) {
      const soma = db.parcelas.filter((x) => x.pedido_id === p.id).reduce((s, x) => s + x.valor, 0);
      expect(soma).toBeCloseTo(p.total, 2);
    }
    for (const parc of db.parcelas.filter((x) => x.status === 'pago')) {
      const pagos = db.pagamentos.filter((x) => x.parcela_id === parc.id).reduce((s, x) => s + x.valor, 0);
      expect(pagos).toBeCloseTo(parc.valor, 2);
    }
  });
  it('cada entrega pertence a no máximo uma rota', () => {
    const ids = db.rota_entregas.map((r) => r.entrega_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
