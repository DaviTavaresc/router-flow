# RouteFlow — Gestão inteligente de entregas

Sistema web SaaS para gestão de **clientes, pedidos, motoristas, rotas, entregas e recebimentos**, com
distribuição inteligente das entregas entre vários motoristas.

Fluxo principal: **cadastrar cliente → cadastrar pedido → definir data da entrega → selecionar motoristas →
otimizar e distribuir → visualizar rotas → motorista executa → confirma entrega → registra recebimento → financeiro atualizado.**

## Como rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes (núcleo, fluxo completo e smoke test de todas as telas)
npm run build      # typecheck + build de produção
```

O sistema começa **vazio**. No primeiro acesso aparece a tela de **Configuração inicial**, onde você cria a
empresa e o administrador. Depois, o painel mostra os primeiros passos: usuários → motoristas → clientes →
pedidos → rotas.

Sem o Supabase configurado, o app roda em **modo local**: os dados ficam salvos apenas no navegador em uso.
Para usar em vários aparelhos (ex.: motoristas no celular), configure o Supabase (abaixo). Em
**Configurações → Empresa → Apagar todos os dados** é possível recomeçar do zero.

Os dados fictícios (`services/data/seed.ts`) continuam existindo apenas para os testes automatizados.

## Stack

React 19 + TypeScript · Vite · Tailwind CSS v4 (light/dark) · TanStack Query · React Router ·
Leaflet/OpenStreetMap · Recharts · dnd-kit · Supabase (PostgreSQL + Auth + RLS) · Vitest.

## Estrutura

```
src/
  app/            sessão, permissões por perfil, guards de rota, tema, hooks
  components/
    ui/           design system (Button, Field, Modal, Toast, ConfirmDialog, Skeleton, EmptyState, Table...)
    layout/       AdminLayout (sidebar fixa / menu lateral no mobile), MotoristaLayout (mobile-first)
    map/          RouteMap (Leaflet) + tipos independentes de provedor
    charts/       gráficos do dashboard
    domain/       modais de negócio (confirmar entrega, ocorrência, pagamento, data)
  pages/          auth, dashboard, clientes, pedidos, motoristas, rotas, entregas, financeiro,
                  relatorios, configuracoes, motorista (app do motorista)
  services/
    data/         contrato DataStore + LocalStore (demo) + SupabaseStore + gerador de dados demo
    auth/         DemoAuthService e SupabaseAuthService
    api/          serviços de aplicação usados pelas telas
    domain/       regras puras (parcelas, totais, status efetivo)
    geo/          geocodificação, distâncias, otimizador e links de navegação
supabase/
  setup.sql       script único de instalação (junção das migrations)
  migrations/     001_schema.sql · 002_rls.sql · 003_functions.sql
```

## Arquitetura

**Camada de dados intercambiável.** As telas usam `services/api/*`, que dependem só do contrato
`DataStore` (`list/get/insert/update/remove/rpc`). Há duas implementações com o mesmo comportamento:

- `LocalStore` (modo demo): isolamento por empresa e políticas equivalentes ao RLS; RPCs em `local/rpc.ts`
  com rollback em caso de erro.
- `SupabaseStore`: PostgREST + RLS; as RPCs são funções PL/pgSQL em `003_functions.sql`.

Operações compostas são **atômicas** e validadas no servidor: `salvar_pedido` (pedido + itens + parcelas +
entrega), `salvar_plano_rotas`, `iniciar_rota`, `confirmar_entrega` (entrega + pedido + quitação de parcelas +
pagamento + conclusão da rota), `registrar_falha_entrega` (ocorrência + reagendamento), `registrar_pagamento`,
`reagendar_entrega`, `alterar_status_pedido`, `gerar_entrega`.

**Perfis.** Administrador (tudo), Vendedor (clientes, pedidos, consulta de entregas) e Motorista (rota do
dia, entregas, confirmação, recebimento e ocorrências — **sem acesso a parcelas/pagamentos**). A UI esconde o
que não é permitido, mas a regra vale na camada de dados (RLS + validação nas RPCs).

**Cliente com cadastro mínimo.** O formulário tem apenas Nome, Telefone, Bairro, Cidade e Estado.
`latitude`, `longitude`, `geo_precisao` e `geo_fonte` são dados técnicos preenchidos pela geocodificação
(nunca digitados). Como bairro não é endereço exato, a precisão é marcada como **aproximada**.

## Otimização de rotas

`services/geo/optimizer.ts` — heurística determinística para múltiplos motoristas (VRP capacitado):

1. **Setorização angular** a partir do ponto de partida (começando no maior "vão" entre clientes).
2. **Refinamento k-means** com teto de balanceamento e respeito à **capacidade do veículo** (peso dos produtos).
3. **Ordenação** de cada rota: vizinho mais próximo + **2-opt**.
4. **Busca local** movendo paradas entre rotas para minimizar *tempo total + maior jornada*
   (gera grupos geograficamente coerentes **e** equilibrados — não divide simplesmente pela quantidade).

Depois da otimização, o administrador pode arrastar paradas (ou usar os botões, no toque), trocar de motorista,
remover/adicionar entregas e reotimizar a ordem de uma rota; distância, tempo e carga são recalculados na hora.

> **Distâncias e tempos são estimativas**: linha reta × *fator de rota* (configurável, ~1,35) a uma velocidade
> média configurável, mais o tempo por parada. O traçado no mapa é em linha reta. Nenhum dado de mapa é inventado.

## Integrações futuras (pontos de extensão)

Tudo em `src/services/geo/` atrás de interfaces:

| Interface          | Padrão atual                                   | Para trocar por                                      |
|--------------------|------------------------------------------------|------------------------------------------------------|
| `Geocoder`         | gazetteer local (centróides aproximados) ou Nominatim (`VITE_GEOCODER=nominatim`) | Mapbox / Google Geocoding — implemente e registre em `getGeocoder()` |
| `DistanceProvider` | estimativa haversine × fator                   | OSRM, Mapbox Matrix, Google Distance Matrix — `getDistanceProvider()` |
| `RouteOptimizer`   | heurística local                               | VROOM, OR-Tools, Google Route Optimization — `getOptimizer()` |
| `RouteMap`         | Leaflet + OSM (tiles Mapbox com `VITE_MAPBOX_TOKEN`) | Google Maps / Mapbox GL — nova implementação de `RouteMapProps` |
| Navegação          | links Google Maps / Waze (`urlNavegacao`)      | —                                                    |

O gazetteer local cobre bairros de Manaus (dados demo) e as capitais; fora disso, sem um geocodificador real o
cliente fica com localização **pendente** e é sinalizado (fica fora da otimização até ser localizado).

## Supabase (produção)

Não é preciso instalar a CLI nem publicar Edge Functions.

1. Crie um projeto em [supabase.com](https://supabase.com) (região São Paulo recomendada).
2. **SQL Editor → New query**: cole todo o conteúdo de `supabase/setup.sql` e clique em **Run**
   (é a junção das três migrations em `supabase/migrations/`).
3. **Authentication → Sign In / Providers → Email**: desative *Confirm email* para que os usuários criados
   pelo administrador entrem na hora (opcional; com a confirmação ativa, cada pessoa confirma pelo e-mail antes).
4. **Authentication → URL Configuration**: em *Site URL* coloque o endereço do app (ex.: `http://localhost:5173`)
   e adicione `<endereço>/redefinir-senha` e `<endereço>/login` em *Redirect URLs*.
5. Crie o arquivo `.env` na raiz (veja `.env.example`) com os dados de **Project Settings → API**:
   ```
   VITE_DATA_SOURCE=supabase
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=<chave anon / publishable>
   ```
6. Reinicie o `npm run dev`. No login, clique em **Criar conta**: isso cria a empresa e o administrador.
   Os demais usuários são criados em **Usuários** (função `vincular_usuario`).

Use apenas a chave **anon/publishable** no `.env` — **nunca** a *service_role/secret*.

**Segurança:** todas as tabelas têm RLS; chaves estrangeiras compostas `(id, empresa_id)` impedem referenciar
registros de outra empresa; as RPCs são `SECURITY DEFINER` e validam perfil, empresa e se a entrega pertence
ao motorista. As migrations e o fluxo completo foram testados em PostgreSQL 17 (isolamento entre empresas,
permissões por perfil, quitação de parcelas, conclusão de rota e reagendamento).

## Testes

- `src/services/__tests__/core.test.ts` — parcelas, otimizador (35 entregas / 4 motoristas: agrupamento,
  capacidade, determinismo, melhor que divisão ingênua) e consistência dos dados demo.
- `src/services/__tests__/fluxo.test.ts` — fluxo ponta a ponta e regras de acesso por perfil.
- `src/__tests__/ui.smoke.test.tsx` — renderiza todas as telas de cada perfil (jsdom) e otimiza rotas pela UI.

## Limitações conhecidas / próximos passos

- Exportação PDF via impressão do navegador; CSV implementado. Geração server-side de PDF fica para depois.
- Listas são filtradas/paginadas no cliente (adequado ao volume de PMEs); para grandes volumes, mover filtros
  e paginação para consultas/views no banco.
- Distâncias, tempos e traçados são estimados até a integração de um provedor de rotas.
