-- =====================================================================
-- RouteFlow — Esquema do banco (PostgreSQL / Supabase)
-- Multiempresa: toda tabela de negócio possui empresa_id. O isolamento
-- é garantido por RLS (002_rls.sql) e por chaves estrangeiras compostas
-- (id, empresa_id), que impedem referenciar registros de outra empresa.
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists app; -- funções internas (não expostas na API)

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- empresas
-- ---------------------------------------------------------------------
create table public.empresas (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null,
  cidade               text not null default '',
  estado               char(2) not null default '',
  partida_descricao    text not null default '',
  partida_lat          double precision not null default 0,
  partida_lng          double precision not null default 0,
  velocidade_media_kmh numeric(6,2) not null default 25 check (velocidade_media_kmh > 0),
  tempo_parada_min     numeric(6,2) not null default 6 check (tempo_parada_min >= 0),
  fator_rota           numeric(4,2) not null default 1.35 check (fator_rota >= 1),
  considerar_retorno   boolean not null default false,
  app_navegacao        text not null default 'google' check (app_navegacao in ('google', 'waze')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- usuarios (perfil de acesso; id = auth.users.id)
-- ---------------------------------------------------------------------
create table public.usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nome        text not null,
  email       text not null,
  perfil      text not null check (perfil in ('admin', 'vendedor', 'motorista')),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, empresa_id)
);
create index on public.usuarios (empresa_id);

-- Funções de contexto do usuário autenticado (usadas em defaults e políticas RLS)
create or replace function public.auth_empresa_id() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from public.usuarios where id = auth.uid() and ativo
$$;

create or replace function public.auth_perfil() returns text
language sql stable security definer set search_path = public as $$
  select perfil from public.usuarios where id = auth.uid() and ativo
$$;

-- ---------------------------------------------------------------------
-- clientes — cadastro simples; latitude/longitude são dados TÉCNICOS
-- ---------------------------------------------------------------------
create table public.clientes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  nome          text not null check (length(trim(nome)) >= 2),
  telefone      text not null default '',
  bairro        text not null,
  cidade        text not null,
  estado        char(2) not null,
  latitude      double precision,
  longitude     double precision,
  geo_precisao  text not null default 'pendente' check (geo_precisao in ('exata', 'bairro', 'cidade', 'pendente')),
  geo_fonte     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, empresa_id),
  check ((latitude is null) = (longitude is null))
);
create index on public.clientes (empresa_id, nome);
create index on public.clientes (empresa_id, cidade, bairro);
comment on column public.clientes.latitude is 'Dado técnico: coordenada aproximada obtida por geocodificação (não exibida no formulário).';
comment on column public.clientes.geo_precisao is 'exata | bairro (centróide) | cidade | pendente';

-- ---------------------------------------------------------------------
-- veiculos / motoristas
-- ---------------------------------------------------------------------
create table public.veiculos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  tipo           text not null default '',
  modelo         text not null default '',
  placa          text not null default '',
  capacidade_kg  numeric(10,2) check (capacidade_kg >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, empresa_id)
);
create index on public.veiculos (empresa_id);

create table public.motoristas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  usuario_id  uuid unique,
  veiculo_id  uuid,
  nome        text not null,
  telefone    text not null default '',
  email       text not null default '',
  cpf         text not null default '',
  status      text not null default 'disponivel' check (status in ('disponivel', 'em_rota', 'indisponivel')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, empresa_id),
  foreign key (usuario_id, empresa_id) references public.usuarios (id, empresa_id) on delete set null (usuario_id),
  foreign key (veiculo_id, empresa_id) references public.veiculos (id, empresa_id) on delete set null (veiculo_id)
);
create index on public.motoristas (empresa_id);

create or replace function public.auth_motorista_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.motoristas where usuario_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- produtos
-- ---------------------------------------------------------------------
create table public.produtos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  nome        text not null,
  unidade     text not null default 'un',
  preco       numeric(12,2) not null default 0 check (preco >= 0),
  peso_kg     numeric(10,3) not null default 0 check (peso_kg >= 0),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, empresa_id)
);
create index on public.produtos (empresa_id, nome);

-- ---------------------------------------------------------------------
-- pedidos / itens_pedido
-- ---------------------------------------------------------------------
create table public.pedidos (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  numero               integer not null,
  cliente_id           uuid not null,
  vendedor_id          uuid,
  data_venda           date not null default current_date,
  data_entrega         date,
  subtotal             numeric(12,2) not null default 0,
  desconto             numeric(12,2) not null default 0 check (desconto >= 0),
  total                numeric(12,2) not null default 0 check (total >= 0),
  observacoes          text not null default '',
  status               text not null default 'novo' check (status in ('novo', 'preparando', 'pronto', 'em_rota', 'entregue', 'cancelado')),
  tipo_venda           text not null check (tipo_venda in ('avista', 'prazo')),
  forma_pagamento      text check (forma_pagamento in ('pix', 'dinheiro', 'debito', 'credito', 'cartao', 'boleto', 'outro')),
  receber_na_entrega   boolean not null default false,
  parcelas_qtd         integer not null default 1 check (parcelas_qtd between 1 and 36),
  intervalo_dias       integer not null default 0 check (intervalo_dias >= 0),
  primeiro_vencimento  date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, empresa_id),
  unique (empresa_id, numero),
  foreign key (cliente_id, empresa_id) references public.clientes (id, empresa_id) on delete restrict,
  foreign key (vendedor_id, empresa_id) references public.usuarios (id, empresa_id) on delete set null (vendedor_id),
  check (tipo_venda = 'avista' or primeiro_vencimento is not null)
);
create index on public.pedidos (empresa_id, data_venda);
create index on public.pedidos (cliente_id);

create table public.itens_pedido (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  pedido_id       uuid not null,
  produto_id      uuid,
  descricao       text not null,
  quantidade      numeric(12,3) not null check (quantidade > 0),
  valor_unitario  numeric(12,2) not null check (valor_unitario >= 0),
  peso_kg         numeric(10,3) not null default 0,
  total           numeric(12,2) not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (pedido_id, empresa_id) references public.pedidos (id, empresa_id) on delete cascade,
  foreign key (produto_id, empresa_id) references public.produtos (id, empresa_id) on delete restrict
);
create index on public.itens_pedido (pedido_id);
create index on public.itens_pedido (produto_id);

-- ---------------------------------------------------------------------
-- entregas / rotas / rota_entregas
-- ---------------------------------------------------------------------
create table public.entregas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  pedido_id       uuid not null,
  cliente_id      uuid not null,
  data            date not null,
  status          text not null default 'pendente' check (status in ('pendente', 'em_rota', 'entregue', 'nao_entregue', 'reagendada', 'cancelada')),
  saida_em        timestamptz,
  entregue_em     timestamptz,
  observacoes     text not null default '',
  valor_receber   numeric(12,2) not null default 0,
  valor_recebido  numeric(12,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, empresa_id),
  foreign key (pedido_id, empresa_id) references public.pedidos (id, empresa_id) on delete cascade,
  foreign key (cliente_id, empresa_id) references public.clientes (id, empresa_id) on delete restrict
);
create index on public.entregas (empresa_id, data, status);
create index on public.entregas (pedido_id);
create index on public.entregas (cliente_id);

create table public.rotas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  motorista_id  uuid not null,
  data          date not null,
  nome          text not null default '',
  cor           text not null default '#2a78d6',
  status        text not null default 'planejada' check (status in ('planejada', 'em_andamento', 'concluida', 'cancelada')),
  distancia_km  numeric(10,3) not null default 0,
  tempo_min     numeric(10,2) not null default 0,
  partida_lat   double precision not null,
  partida_lng   double precision not null,
  iniciada_em   timestamptz,
  concluida_em  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, empresa_id),
  foreign key (motorista_id, empresa_id) references public.motoristas (id, empresa_id) on delete restrict
);
create index on public.rotas (empresa_id, data);
create index on public.rotas (motorista_id, data);

create table public.rota_entregas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  rota_id       uuid not null,
  entrega_id    uuid not null unique, -- uma entrega pertence a no máximo uma rota
  ordem         integer not null check (ordem > 0),
  distancia_km  numeric(10,3) not null default 0,
  tempo_min     numeric(10,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (rota_id, empresa_id) references public.rotas (id, empresa_id) on delete cascade,
  foreign key (entrega_id, empresa_id) references public.entregas (id, empresa_id) on delete cascade,
  constraint rota_entregas_ordem_unica unique (rota_id, ordem) deferrable initially deferred
);
create index on public.rota_entregas (rota_id);

-- ---------------------------------------------------------------------
-- parcelas / pagamentos
-- ---------------------------------------------------------------------
create table public.parcelas (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  pedido_id        uuid not null,
  numero           integer not null check (numero > 0),
  total_parcelas   integer not null check (total_parcelas > 0),
  valor            numeric(12,2) not null check (valor >= 0),
  vencimento       date not null,
  status           text not null default 'pendente' check (status in ('pendente', 'pago', 'vencido', 'cancelado')),
  pago_em          date,
  valor_pago       numeric(12,2) not null default 0 check (valor_pago >= 0),
  forma_pagamento  text check (forma_pagamento in ('pix', 'dinheiro', 'debito', 'credito', 'cartao', 'boleto', 'outro')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, empresa_id),
  unique (pedido_id, numero),
  foreign key (pedido_id, empresa_id) references public.pedidos (id, empresa_id) on delete cascade
);
create index on public.parcelas (empresa_id, status, vencimento);
comment on column public.parcelas.status is 'Pendente com vencimento passado é exibida como "vencido" (status efetivo calculado).';

create table public.pagamentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  pedido_id       uuid not null,
  parcela_id      uuid,
  entrega_id      uuid,
  valor           numeric(12,2) not null check (valor > 0),
  forma           text not null check (forma in ('pix', 'dinheiro', 'debito', 'credito', 'cartao', 'boleto', 'outro')),
  data            date not null default current_date,
  observacao      text not null default '',
  registrado_por  uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (pedido_id, empresa_id) references public.pedidos (id, empresa_id) on delete cascade,
  foreign key (parcela_id, empresa_id) references public.parcelas (id, empresa_id) on delete set null (parcela_id),
  foreign key (entrega_id, empresa_id) references public.entregas (id, empresa_id) on delete set null (entrega_id),
  foreign key (registrado_por, empresa_id) references public.usuarios (id, empresa_id) on delete set null (registrado_por)
);
create index on public.pagamentos (empresa_id, data);
create index on public.pagamentos (pedido_id);

-- ---------------------------------------------------------------------
-- ocorrencias (entregas não realizadas)
-- ---------------------------------------------------------------------
create table public.ocorrencias (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null default public.auth_empresa_id() references public.empresas (id) on delete cascade,
  entrega_id       uuid not null,
  motorista_id     uuid,
  motivo           text not null check (motivo in ('cliente_ausente', 'local_nao_encontrado', 'cliente_recusou', 'problema_pagamento', 'problema_veiculo', 'outro')),
  observacao       text not null default '',
  reagendada_para  date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (entrega_id, empresa_id) references public.entregas (id, empresa_id) on delete cascade,
  foreign key (motorista_id, empresa_id) references public.motoristas (id, empresa_id) on delete set null (motorista_id)
);
create index on public.ocorrencias (entrega_id);

-- ---------------------------------------------------------------------
-- triggers de updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['empresas','usuarios','clientes','veiculos','motoristas','produtos','pedidos','itens_pedido',
                           'entregas','rotas','rota_entregas','parcelas','pagamentos','ocorrencias']
  loop
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s for each row execute function app.set_updated_at()', t);
  end loop;
end $$;
