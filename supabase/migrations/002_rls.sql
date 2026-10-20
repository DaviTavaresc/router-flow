-- =====================================================================
-- RouteFlow — Row Level Security
--  * Cada empresa enxerga somente os próprios dados (empresa_id = auth_empresa_id()).
--  * admin:     leitura e escrita completas na empresa.
--  * vendedor:  clientes (criar/editar), pedidos (via RPC), consulta de entregas.
--  * motorista: apenas as próprias rotas, entregas e os dados necessários dos
--               clientes/pedidos dessas entregas. Sem acesso a parcelas/pagamentos.
-- Operações compostas (confirmar entrega, salvar plano...) passam por funções
-- SECURITY DEFINER (003_functions.sql) que validam perfil e propriedade.
-- =====================================================================

-- Helpers de visibilidade do motorista (security definer evita recursão de RLS)
create or replace function app.motorista_ve_entrega(p_entrega uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rota_entregas re
    join public.rotas r on r.id = re.rota_id
    where re.entrega_id = p_entrega and r.motorista_id = public.auth_motorista_id()
  )
$$;

create or replace function app.motorista_ve_pedido(p_pedido uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entregas e where e.pedido_id = p_pedido and app.motorista_ve_entrega(e.id))
$$;

create or replace function app.motorista_ve_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entregas e where e.cliente_id = p_cliente and app.motorista_ve_entrega(e.id))
$$;

grant usage on schema app to authenticated;
grant execute on function app.motorista_ve_entrega(uuid), app.motorista_ve_pedido(uuid), app.motorista_ve_cliente(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['empresas','usuarios','clientes','veiculos','motoristas','produtos','pedidos','itens_pedido',
                           'entregas','rotas','rota_entregas','parcelas','pagamentos','ocorrencias']
  loop
    -- (sem FORCE: as funções SECURITY DEFINER do dono das tabelas aplicam suas próprias validações)
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- empresas -------------------------------------------------------------
create policy empresas_select on public.empresas for select to authenticated
  using (id = public.auth_empresa_id());
create policy empresas_update on public.empresas for update to authenticated
  using (id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (id = public.auth_empresa_id());

-- usuarios (criação via funções onboarding_criar_empresa / vincular_usuario)
create policy usuarios_select on public.usuarios for select to authenticated
  using (empresa_id = public.auth_empresa_id() and (public.auth_perfil() = 'admin' or id = auth.uid()));
create policy usuarios_update on public.usuarios for update to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin' and id <> auth.uid())
  with check (empresa_id = public.auth_empresa_id());

-- clientes ---------------------------------------------------------------
create policy clientes_select on public.clientes for select to authenticated
  using (empresa_id = public.auth_empresa_id()
         and (public.auth_perfil() in ('admin', 'vendedor') or app.motorista_ve_cliente(id)));
create policy clientes_insert on public.clientes for insert to authenticated
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() in ('admin', 'vendedor'));
create policy clientes_update on public.clientes for update to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() in ('admin', 'vendedor'))
  with check (empresa_id = public.auth_empresa_id());
create policy clientes_delete on public.clientes for delete to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

-- veiculos / motoristas --------------------------------------------------
create policy veiculos_select on public.veiculos for select to authenticated
  using (empresa_id = public.auth_empresa_id()
         and (public.auth_perfil() in ('admin', 'vendedor')
              or id = (select veiculo_id from public.motoristas where id = public.auth_motorista_id())));
create policy veiculos_admin on public.veiculos for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

create policy motoristas_select on public.motoristas for select to authenticated
  using (empresa_id = public.auth_empresa_id()
         and (public.auth_perfil() in ('admin', 'vendedor') or usuario_id = auth.uid()));
create policy motoristas_admin on public.motoristas for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

-- produtos ---------------------------------------------------------------
create policy produtos_select on public.produtos for select to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() in ('admin', 'vendedor'));
create policy produtos_admin on public.produtos for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

-- pedidos / itens (escrita pela RPC salvar_pedido) -------------------------
create policy pedidos_select on public.pedidos for select to authenticated
  using (empresa_id = public.auth_empresa_id()
         and (public.auth_perfil() in ('admin', 'vendedor') or app.motorista_ve_pedido(id)));
create policy pedidos_admin on public.pedidos for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

create policy itens_select on public.itens_pedido for select to authenticated
  using (empresa_id = public.auth_empresa_id()
         and (public.auth_perfil() in ('admin', 'vendedor') or app.motorista_ve_pedido(pedido_id)));
create policy itens_admin on public.itens_pedido for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

-- entregas / rotas ---------------------------------------------------------
create policy entregas_select on public.entregas for select to authenticated
  using (empresa_id = public.auth_empresa_id()
         and (public.auth_perfil() in ('admin', 'vendedor') or app.motorista_ve_entrega(id)));
create policy entregas_admin on public.entregas for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

create policy rotas_select on public.rotas for select to authenticated
  using (empresa_id = public.auth_empresa_id()
         and (public.auth_perfil() in ('admin', 'vendedor') or motorista_id = public.auth_motorista_id()));
create policy rotas_admin on public.rotas for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

create policy rota_entregas_select on public.rota_entregas for select to authenticated
  using (empresa_id = public.auth_empresa_id()
         and (public.auth_perfil() in ('admin', 'vendedor') or app.motorista_ve_entrega(entrega_id)));
create policy rota_entregas_admin on public.rota_entregas for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

-- financeiro: motorista NÃO tem acesso --------------------------------------
create policy parcelas_select on public.parcelas for select to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() in ('admin', 'vendedor'));
create policy parcelas_admin on public.parcelas for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

create policy pagamentos_select on public.pagamentos for select to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() in ('admin', 'vendedor'));
create policy pagamentos_admin on public.pagamentos for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');

-- ocorrencias --------------------------------------------------------------
create policy ocorrencias_select on public.ocorrencias for select to authenticated
  using (empresa_id = public.auth_empresa_id()
         and (public.auth_perfil() in ('admin', 'vendedor') or app.motorista_ve_entrega(entrega_id)));
create policy ocorrencias_admin on public.ocorrencias for all to authenticated
  using (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin')
  with check (empresa_id = public.auth_empresa_id() and public.auth_perfil() = 'admin');
