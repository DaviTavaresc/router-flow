-- =====================================================================
-- RouteFlow — Regras de negócio atômicas (RPCs chamadas via supabase.rpc)
-- Mantidas em paridade com src/services/data/local/rpc.ts (modo demo).
-- Todas recebem um único parâmetro jsonb "args" e rodam como SECURITY DEFINER,
-- validando perfil, empresa e propriedade (motorista) explicitamente.
-- =====================================================================

-- ------------------------------ auxiliares ------------------------------

create or replace function app.exigir_perfil(p_perfis text[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_perfil() is null or not (public.auth_perfil() = any (p_perfis)) then
    raise exception 'Você não tem permissão para esta operação.';
  end if;
end $$;

create or replace function app.haversine_km(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

create or replace function app.valor_receber_na_entrega(p public.pedidos) returns numeric
language sql stable security definer set search_path = public as $$
  select case when p.tipo_venda <> 'avista' or not p.receber_na_entrega then 0
              else coalesce(round(sum(valor - valor_pago), 2), 0) end
  from public.parcelas where pedido_id = p.id and status = 'pendente'
$$;

create or replace function app.entrega_ativa(p_pedido uuid) returns public.entregas
language sql stable security definer set search_path = public as $$
  select * from public.entregas
  where pedido_id = p_pedido and status not in ('cancelada', 'nao_entregue')
  order by created_at desc limit 1
$$;

create or replace function app.criar_entrega(p public.pedidos, p_data date, p_status text default 'pendente') returns public.entregas
language plpgsql security definer set search_path = public as $$
declare v public.entregas;
begin
  insert into public.entregas (empresa_id, pedido_id, cliente_id, data, status, valor_receber)
  values (p.empresa_id, p.id, p.cliente_id, p_data, p_status, app.valor_receber_na_entrega(p))
  returning * into v;
  return v;
end $$;

create or replace function app.quitar(p_parcela uuid, p_valor numeric, p_forma text, p_data date, p_obs text, p_entrega uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.parcelas;
  v_pago numeric;
  v_quitada boolean;
begin
  select * into v from public.parcelas where id = p_parcela for update;
  v_pago := round(v.valor_pago + p_valor, 2);
  v_quitada := v_pago >= v.valor - 0.005;
  update public.parcelas
     set valor_pago = v_pago,
         status = case when v_quitada then 'pago' else 'pendente' end,
         pago_em = case when v_quitada then p_data else null end,
         forma_pagamento = p_forma
   where id = p_parcela;
  insert into public.pagamentos (empresa_id, pedido_id, parcela_id, entrega_id, valor, forma, data, observacao, registrado_por)
  values (v.empresa_id, v.pedido_id, v.id, p_entrega, round(p_valor, 2), p_forma, p_data, coalesce(p_obs, ''), auth.uid());
end $$;

create or replace function app.gerar_financeiro(p public.pedidos) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  v_base numeric;
  v_parcela uuid;
  i int;
begin
  if p.tipo_venda = 'prazo' then
    v_n := greatest(1, p.parcelas_qtd);
    v_base := floor(p.total / v_n * 100) / 100;
    for i in 0 .. v_n - 1 loop
      insert into public.parcelas (empresa_id, pedido_id, numero, total_parcelas, valor, vencimento, forma_pagamento)
      values (
        p.empresa_id, p.id, i + 1, v_n,
        case when i = v_n - 1 then round(p.total - v_base * (v_n - 1), 2) else v_base end,
        case when p.intervalo_dias = 30 then (p.primeiro_vencimento + make_interval(months => i))::date
             else p.primeiro_vencimento + p.intervalo_dias * i end,
        p.forma_pagamento
      );
    end loop;
    return;
  end if;

  insert into public.parcelas (empresa_id, pedido_id, numero, total_parcelas, valor, vencimento, forma_pagamento)
  values (p.empresa_id, p.id, 1, 1, p.total,
          case when p.receber_na_entrega then coalesce(p.data_entrega, p.data_venda) else p.data_venda end,
          p.forma_pagamento)
  returning id into v_parcela;

  if not p.receber_na_entrega then
    perform app.quitar(v_parcela, p.total, coalesce(p.forma_pagamento, 'pix'), p.data_venda, 'Pagamento no ato da venda', null);
  end if;
end $$;

/** Recalcula ordem, trechos, distância e tempo de uma rota (estimativa linha reta × fator). */
create or replace function app.recalcular_rota(p_rota uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rotas;
  e public.empresas;
  rec record;
  v_lat float8; v_lng float8; v_plat float8; v_plng float8;
  v_d numeric; v_t numeric;
  v_total_d numeric := 0; v_total_t numeric := 0;
  i int := 0;
begin
  select * into r from public.rotas where id = p_rota;
  if not found then return; end if;
  select * into e from public.empresas where id = r.empresa_id;
  v_plat := r.partida_lat; v_plng := r.partida_lng;

  for rec in
    select re.id, c.latitude, c.longitude
      from public.rota_entregas re
      join public.entregas en on en.id = re.entrega_id
      join public.clientes c on c.id = en.cliente_id
     where re.rota_id = p_rota
     order by re.ordem
  loop
    i := i + 1;
    v_lat := coalesce(rec.latitude, r.partida_lat);
    v_lng := coalesce(rec.longitude, r.partida_lng);
    v_d := app.haversine_km(v_plat, v_plng, v_lat, v_lng) * e.fator_rota;
    v_t := v_d / e.velocidade_media_kmh * 60;
    update public.rota_entregas set ordem = i, distancia_km = v_d, tempo_min = v_t where id = rec.id;
    v_total_d := v_total_d + v_d;
    v_total_t := v_total_t + v_t + e.tempo_parada_min;
    v_plat := v_lat; v_plng := v_lng;
  end loop;

  if i = 0 and r.status = 'planejada' then
    delete from public.rotas where id = p_rota;
    return;
  end if;
  if e.considerar_retorno and i > 0 then
    v_d := app.haversine_km(v_plat, v_plng, r.partida_lat, r.partida_lng) * e.fator_rota;
    v_total_d := v_total_d + v_d;
    v_total_t := v_total_t + v_d / e.velocidade_media_kmh * 60;
  end if;
  update public.rotas set distancia_km = v_total_d, tempo_min = v_total_t where id = p_rota;
end $$;

create or replace function app.remover_da_rota(p_entrega uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_rota uuid;
begin
  delete from public.rota_entregas where entrega_id = p_entrega returning rota_id into v_rota;
  if v_rota is not null then perform app.recalcular_rota(v_rota); end if;
end $$;

create or replace function app.rota_da_entrega(p_entrega uuid) returns public.rotas
language sql stable security definer set search_path = public as $$
  select r.* from public.rota_entregas re join public.rotas r on r.id = re.rota_id where re.entrega_id = p_entrega
$$;

create or replace function app.exigir_entrega_do_motorista(p_entrega uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_perfil() = 'motorista' and (app.rota_da_entrega(p_entrega)).motorista_id is distinct from public.auth_motorista_id() then
    raise exception 'Esta entrega não pertence à sua rota.';
  end if;
end $$;

create or replace function app.verificar_conclusao_rota(p_rota uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.rotas;
begin
  if p_rota is null then return; end if;
  select * into r from public.rotas where id = p_rota;
  if not found or r.status in ('concluida', 'cancelada') then return; end if;

  if not exists (
    select 1 from public.rota_entregas re join public.entregas e on e.id = re.entrega_id
     where re.rota_id = p_rota and e.status not in ('entregue', 'nao_entregue', 'cancelada')
  ) then
    update public.rotas set status = 'concluida', concluida_em = now() where id = p_rota;
    if not exists (select 1 from public.rotas where motorista_id = r.motorista_id and id <> p_rota and status = 'em_andamento') then
      update public.motoristas set status = 'disponivel' where id = r.motorista_id;
    end if;
  elsif r.status = 'planejada' then
    update public.rotas set status = 'em_andamento', iniciada_em = coalesce(r.iniciada_em, now()) where id = p_rota;
    update public.motoristas set status = 'em_rota' where id = r.motorista_id;
  end if;
end $$;

-- -------------------------------- RPCs --------------------------------

create or replace function public.salvar_pedido(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.auth_empresa_id();
  v_id uuid := nullif(args ->> 'id', '')::uuid;
  p jsonb := args -> 'pedido';
  v_itens jsonb := coalesce(args -> 'itens', '[]'::jsonb);
  v_gerar boolean := coalesce((args ->> 'gerar_entrega')::boolean, false);
  v_prazo boolean := (args -> 'pedido' ->> 'tipo_venda') = 'prazo';
  v_item jsonb;
  v_subtotal numeric := 0;
  v_desconto numeric;
  v_total numeric;
  v_qtd int; v_intervalo int; v_venc date; v_receber boolean; v_forma text;
  v_ped public.pedidos;
  v_atual public.pedidos;
  v_ent public.entregas;
  v_fin_mudou boolean := true;
begin
  perform app.exigir_perfil(array['admin', 'vendedor']);
  if jsonb_array_length(v_itens) = 0 then raise exception 'Adicione ao menos um produto ao pedido.'; end if;
  for v_item in select * from jsonb_array_elements(v_itens) loop
    if coalesce(trim(v_item ->> 'descricao'), '') = '' or (v_item ->> 'quantidade')::numeric <= 0 or (v_item ->> 'valor_unitario')::numeric < 0 then
      raise exception 'Verifique produtos, quantidades e valores.';
    end if;
    v_subtotal := v_subtotal + round((v_item ->> 'quantidade')::numeric * (v_item ->> 'valor_unitario')::numeric, 2);
  end loop;
  if not exists (select 1 from public.clientes where id = (p ->> 'cliente_id')::uuid and empresa_id = v_emp) then
    raise exception 'Cliente não encontrado.';
  end if;

  v_desconto := round(least(greatest(coalesce((p ->> 'desconto')::numeric, 0), 0), v_subtotal), 2);
  v_total := v_subtotal - v_desconto;
  if v_total <= 0 then raise exception 'O valor total do pedido deve ser maior que zero.'; end if;
  if v_prazo and (p ->> 'primeiro_vencimento' is null or coalesce((p ->> 'parcelas_qtd')::int, 0) < 1) then
    raise exception 'Informe a quantidade de parcelas e o primeiro vencimento.';
  end if;
  v_forma := nullif(p ->> 'forma_pagamento', '');
  if not v_prazo and v_forma is null then raise exception 'Informe a forma de pagamento.'; end if;

  v_qtd := case when v_prazo then floor((p ->> 'parcelas_qtd')::numeric)::int else 1 end;
  v_intervalo := case when v_prazo then coalesce((p ->> 'intervalo_dias')::int, 30) else 0 end;
  v_venc := case when v_prazo then (p ->> 'primeiro_vencimento')::date else null end;
  v_receber := case when v_prazo then false else coalesce((p ->> 'receber_na_entrega')::boolean, false) end;

  if v_id is not null then
    select * into v_atual from public.pedidos where id = v_id and empresa_id = v_emp for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_atual.status in ('cancelado', 'entregue') then
      raise exception 'Pedidos entregues ou cancelados não podem ser editados.';
    end if;
    v_fin_mudou := v_atual.total <> v_total
      or v_atual.tipo_venda <> (p ->> 'tipo_venda')
      or v_atual.parcelas_qtd <> v_qtd
      or v_atual.primeiro_vencimento is distinct from v_venc
      or v_atual.intervalo_dias <> v_intervalo
      or v_atual.receber_na_entrega <> v_receber
      or v_atual.forma_pagamento is distinct from v_forma;
    if v_fin_mudou and exists (select 1 from public.pagamentos where pedido_id = v_id) then
      raise exception 'Este pedido já possui pagamentos registrados. Não é possível alterar valores ou condições de pagamento.';
    end if;

    update public.pedidos set
      cliente_id = (p ->> 'cliente_id')::uuid,
      data_venda = (p ->> 'data_venda')::date,
      data_entrega = nullif(p ->> 'data_entrega', '')::date,
      subtotal = v_subtotal, desconto = v_desconto, total = v_total,
      observacoes = coalesce(p ->> 'observacoes', ''),
      -- em_rota/entregue/cancelado são definidos pelo sistema, não pelo formulário
      status = case when p ->> 'status' in ('novo', 'preparando', 'pronto') then p ->> 'status' else v_atual.status end,
      tipo_venda = p ->> 'tipo_venda',
      forma_pagamento = v_forma,
      receber_na_entrega = v_receber,
      parcelas_qtd = v_qtd,
      intervalo_dias = v_intervalo,
      primeiro_vencimento = v_venc
    where id = v_id
    returning * into v_ped;

    delete from public.itens_pedido where pedido_id = v_id;
    if v_fin_mudou then
      delete from public.parcelas where pedido_id = v_id;
      perform app.gerar_financeiro(v_ped);
    end if;

    v_ent := app.entrega_ativa(v_id);
    if v_ent.id is not null and v_ent.status in ('pendente', 'reagendada') then
      if v_ped.data_entrega is not null and v_ped.data_entrega <> v_ent.data then
        perform app.remover_da_rota(v_ent.id);
        update public.entregas set data = v_ped.data_entrega where id = v_ent.id;
      end if;
      update public.entregas set valor_receber = app.valor_receber_na_entrega(v_ped) where id = v_ent.id;
    elsif v_ent.id is null and v_gerar and v_ped.data_entrega is not null then
      perform app.criar_entrega(v_ped, v_ped.data_entrega);
    end if;
  else
    perform pg_advisory_xact_lock(hashtext('routeflow:pedido_numero:' || v_emp::text));
    insert into public.pedidos (
      empresa_id, numero, cliente_id, vendedor_id, data_venda, data_entrega, subtotal, desconto, total, observacoes,
      status, tipo_venda, forma_pagamento, receber_na_entrega, parcelas_qtd, intervalo_dias, primeiro_vencimento
    ) values (
      v_emp,
      (select coalesce(max(numero), 1000) + 1 from public.pedidos where empresa_id = v_emp),
      (p ->> 'cliente_id')::uuid, auth.uid(),
      (p ->> 'data_venda')::date, nullif(p ->> 'data_entrega', '')::date,
      v_subtotal, v_desconto, v_total, coalesce(p ->> 'observacoes', ''),
      case when p ->> 'status' in ('novo', 'preparando', 'pronto') then p ->> 'status' else 'novo' end,
      p ->> 'tipo_venda', v_forma, v_receber, v_qtd, v_intervalo, v_venc
    ) returning * into v_ped;
    perform app.gerar_financeiro(v_ped);
    if v_gerar and v_ped.data_entrega is not null then
      perform app.criar_entrega(v_ped, v_ped.data_entrega);
    end if;
  end if;

  insert into public.itens_pedido (empresa_id, pedido_id, produto_id, descricao, quantidade, valor_unitario, peso_kg, total)
  select v_emp, v_ped.id, nullif(i ->> 'produto_id', '')::uuid, trim(i ->> 'descricao'), (i ->> 'quantidade')::numeric,
         round((i ->> 'valor_unitario')::numeric, 2), coalesce((i ->> 'peso_kg')::numeric, 0),
         round((i ->> 'quantidade')::numeric * (i ->> 'valor_unitario')::numeric, 2)
    from jsonb_array_elements(v_itens) i;

  return to_jsonb(v_ped);
end $$;

create or replace function public.alterar_status_pedido(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ped public.pedidos;
  v_status text := args ->> 'status';
  v_e record;
begin
  perform app.exigir_perfil(array['admin', 'vendedor']);
  select * into v_ped from public.pedidos where id = (args ->> 'pedido_id')::uuid and empresa_id = public.auth_empresa_id() for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_ped.status = 'cancelado' and v_status <> 'cancelado' then raise exception 'Pedidos cancelados não podem ser reabertos.'; end if;
  if v_status not in ('novo', 'preparando', 'pronto', 'cancelado') then
    raise exception 'Este status é definido automaticamente pelas entregas.';
  end if;
  if v_status <> 'cancelado' and v_ped.status in ('em_rota', 'entregue') then
    raise exception 'O status de pedidos em rota ou entregues é definido pelas entregas.';
  end if;
  if v_status = 'cancelado' then
    if exists (select 1 from public.entregas where pedido_id = v_ped.id and status = 'entregue') then
      raise exception 'Pedidos já entregues não podem ser cancelados.';
    end if;
    for v_e in select id from public.entregas where pedido_id = v_ped.id and status <> 'nao_entregue' loop
      perform app.remover_da_rota(v_e.id);
      update public.entregas set status = 'cancelada' where id = v_e.id;
    end loop;
    update public.parcelas set status = 'cancelado' where pedido_id = v_ped.id and status = 'pendente';
  end if;
  update public.pedidos set status = v_status where id = v_ped.id;
  return null;
end $$;

create or replace function public.gerar_entrega(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ped public.pedidos;
begin
  perform app.exigir_perfil(array['admin', 'vendedor']);
  select * into v_ped from public.pedidos where id = (args ->> 'pedido_id')::uuid and empresa_id = public.auth_empresa_id() for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_ped.status = 'cancelado' then raise exception 'Pedido cancelado.'; end if;
  if (app.entrega_ativa(v_ped.id)).id is not null then raise exception 'Este pedido já possui uma entrega ativa.'; end if;
  update public.pedidos set data_entrega = (args ->> 'data')::date where id = v_ped.id returning * into v_ped;
  return to_jsonb(app.criar_entrega(v_ped, v_ped.data_entrega));
end $$;

create or replace function public.registrar_pagamento(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_par public.parcelas;
  v_valor numeric := (args ->> 'valor')::numeric;
  v_ped public.pedidos;
  v_ent public.entregas;
begin
  perform app.exigir_perfil(array['admin']);
  select * into v_par from public.parcelas where id = (args ->> 'parcela_id')::uuid and empresa_id = public.auth_empresa_id() for update;
  if not found then raise exception 'Parcela não encontrada.'; end if;
  if v_par.status <> 'pendente' then raise exception 'Somente parcelas pendentes podem receber pagamento.'; end if;
  if v_valor <= 0 or v_valor > round(v_par.valor - v_par.valor_pago, 2) + 0.009 then
    raise exception 'Informe um valor entre R$ 0,01 e o saldo da parcela.';
  end if;
  perform app.quitar(v_par.id, v_valor, args ->> 'forma', (args ->> 'data')::date, args ->> 'observacao', null);
  select * into v_ped from public.pedidos where id = v_par.pedido_id;
  v_ent := app.entrega_ativa(v_ped.id);
  if v_ent.id is not null and v_ent.status <> 'entregue' then
    update public.entregas set valor_receber = app.valor_receber_na_entrega(v_ped) where id = v_ent.id;
  end if;
  return null;
end $$;

create or replace function public.salvar_plano_rotas(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.auth_empresa_id();
  v_data date := (args ->> 'data')::date;
  v_rota jsonb;
  v_par jsonb;
  v_e public.entregas;
  v_vistas uuid[] := '{}';
  v_nova uuid;
begin
  perform app.exigir_perfil(array['admin']);

  for v_rota in select * from jsonb_array_elements(coalesce(args -> 'rotas', '[]'::jsonb)) loop
    if not exists (select 1 from public.motoristas where id = (v_rota ->> 'motorista_id')::uuid and empresa_id = v_emp) then
      raise exception 'Motorista não encontrado.';
    end if;
    for v_par in select * from jsonb_array_elements(coalesce(v_rota -> 'paradas', '[]'::jsonb)) loop
      select * into v_e from public.entregas where id = (v_par ->> 'entrega_id')::uuid and empresa_id = v_emp;
      if not found then raise exception 'Entrega não encontrada.'; end if;
      if v_e.id = any (v_vistas) then raise exception 'Uma entrega foi atribuída a mais de uma rota.'; end if;
      if exists (select 1 from public.rota_entregas re join public.rotas r on r.id = re.rota_id
                  where re.entrega_id = v_e.id and r.status <> 'planejada') then
        raise exception 'Uma das entregas já está em uma rota em andamento.';
      end if;
      if v_e.data <> v_data then raise exception 'Todas as entregas devem ser da data planejada.'; end if;
      if v_e.status not in ('pendente', 'reagendada') then raise exception 'Somente entregas pendentes podem ser roteirizadas.'; end if;
      v_vistas := v_vistas || v_e.id;
    end loop;
  end loop;

  -- substitui as rotas ainda não iniciadas do dia (rota_entregas em cascata)
  delete from public.rotas where empresa_id = v_emp and data = v_data and status = 'planejada';

  for v_rota in select * from jsonb_array_elements(coalesce(args -> 'rotas', '[]'::jsonb)) loop
    if jsonb_array_length(coalesce(v_rota -> 'paradas', '[]'::jsonb)) = 0 then continue; end if;
    insert into public.rotas (empresa_id, motorista_id, data, nome, cor, status, distancia_km, tempo_min, partida_lat, partida_lng)
    values (v_emp, (v_rota ->> 'motorista_id')::uuid, v_data, coalesce(v_rota ->> 'nome', ''), coalesce(v_rota ->> 'cor', '#2a78d6'),
            'planejada', coalesce((v_rota ->> 'distancia_km')::numeric, 0), coalesce((v_rota ->> 'tempo_min')::numeric, 0),
            (args ->> 'partida_lat')::float8, (args ->> 'partida_lng')::float8)
    returning id into v_nova;
    insert into public.rota_entregas (empresa_id, rota_id, entrega_id, ordem, distancia_km, tempo_min)
    select v_emp, v_nova, (x ->> 'entrega_id')::uuid, (x ->> 'ordem')::int,
           coalesce((x ->> 'distancia_km')::numeric, 0), coalesce((x ->> 'tempo_min')::numeric, 0)
      from jsonb_array_elements(v_rota -> 'paradas') x;
  end loop;
  return null;
end $$;

create or replace function public.iniciar_rota(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rotas;
  v_agora timestamptz := now();
begin
  perform app.exigir_perfil(array['admin', 'motorista']);
  select * into r from public.rotas where id = (args ->> 'rota_id')::uuid and empresa_id = public.auth_empresa_id() for update;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if public.auth_perfil() = 'motorista' and r.motorista_id is distinct from public.auth_motorista_id() then
    raise exception 'Esta rota não é sua.';
  end if;
  if r.status <> 'planejada' then raise exception 'Esta rota já foi iniciada.'; end if;

  update public.rotas set status = 'em_andamento', iniciada_em = v_agora where id = r.id;
  update public.entregas e set status = 'em_rota', saida_em = v_agora
    from public.rota_entregas re
   where re.rota_id = r.id and re.entrega_id = e.id and e.status in ('pendente', 'reagendada');
  update public.pedidos p set status = 'em_rota'
    from public.rota_entregas re join public.entregas e on e.id = re.entrega_id
   where re.rota_id = r.id and p.id = e.pedido_id and e.status = 'em_rota';
  update public.motoristas set status = 'em_rota' where id = r.motorista_id;
  return null;
end $$;

create or replace function public.confirmar_entrega(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_e public.entregas;
  v_horario timestamptz := (args ->> 'horario')::timestamptz;
  v_valor numeric := round(coalesce((args ->> 'valor_recebido')::numeric, 0), 2);
  v_forma text := nullif(args ->> 'forma', '');
  v_obs text := coalesce(args ->> 'observacao', '');
  v_restante numeric;
  v_pagar numeric;
  v_par record;
  -- data local do recebimento informada pelo app (evita virada de dia por fuso horário)
  v_data date := coalesce(nullif(args ->> 'data', '')::date, current_date);
begin
  perform app.exigir_perfil(array['admin', 'motorista']);
  select * into v_e from public.entregas where id = (args ->> 'entrega_id')::uuid and empresa_id = public.auth_empresa_id() for update;
  if not found then raise exception 'Entrega não encontrada.'; end if;
  perform app.exigir_entrega_do_motorista(v_e.id);
  if v_e.status not in ('pendente', 'em_rota', 'reagendada') then raise exception 'Esta entrega já foi finalizada.'; end if;
  if v_valor < 0 then raise exception 'Valor recebido inválido.'; end if;
  if v_valor > 0 and v_forma is null then raise exception 'Informe a forma de recebimento.'; end if;

  update public.entregas set
    status = 'entregue', entregue_em = v_horario, saida_em = coalesce(saida_em, v_horario),
    observacoes = case when v_obs <> '' then v_obs else observacoes end,
    valor_recebido = v_valor
  where id = v_e.id;
  update public.pedidos set status = 'entregue' where id = v_e.pedido_id;

  v_restante := v_valor;
  for v_par in
    select id, valor, valor_pago from public.parcelas
     where pedido_id = v_e.pedido_id and status = 'pendente'
     order by vencimento, numero
  loop
    exit when v_restante <= 0.005;
    v_pagar := least(v_restante, round(v_par.valor - v_par.valor_pago, 2));
    perform app.quitar(v_par.id, v_pagar, v_forma, v_data, 'Recebido na entrega', v_e.id);
    v_restante := round(v_restante - v_pagar, 2);
  end loop;
  if v_restante > 0.005 then
    insert into public.pagamentos (empresa_id, pedido_id, entrega_id, valor, forma, data, observacao, registrado_por)
    values (v_e.empresa_id, v_e.pedido_id, v_e.id, v_restante, v_forma, v_data, 'Valor recebido acima do saldo em aberto', auth.uid());
  end if;

  perform app.verificar_conclusao_rota((app.rota_da_entrega(v_e.id)).id);
  return null;
end $$;

create or replace function public.registrar_falha_entrega(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_e public.entregas;
  v_ped public.pedidos;
  v_rota public.rotas;
  v_motivo text := args ->> 'motivo';
  v_obs text := coalesce(args ->> 'observacao', '');
  v_reagendar date := nullif(args ->> 'reagendar_para', '')::date;
begin
  perform app.exigir_perfil(array['admin', 'motorista']);
  select * into v_e from public.entregas where id = (args ->> 'entrega_id')::uuid and empresa_id = public.auth_empresa_id() for update;
  if not found then raise exception 'Entrega não encontrada.'; end if;
  perform app.exigir_entrega_do_motorista(v_e.id);
  if v_e.status not in ('pendente', 'em_rota', 'reagendada') then raise exception 'Esta entrega já foi finalizada.'; end if;
  if v_motivo = 'outro' and trim(v_obs) = '' then raise exception 'Descreva o motivo na observação.'; end if;

  v_rota := app.rota_da_entrega(v_e.id);
  update public.entregas set status = 'nao_entregue', observacoes = case when v_obs <> '' then v_obs else observacoes end where id = v_e.id;
  insert into public.ocorrencias (empresa_id, entrega_id, motorista_id, motivo, observacao, reagendada_para)
  values (v_e.empresa_id, v_e.id, coalesce(public.auth_motorista_id(), v_rota.motorista_id), v_motivo, v_obs, v_reagendar);

  if v_reagendar is not null then
    update public.pedidos set status = 'pronto', data_entrega = v_reagendar where id = v_e.pedido_id returning * into v_ped;
    perform app.criar_entrega(v_ped, v_reagendar, 'reagendada');
  else
    update public.pedidos set status = 'pronto' where id = v_e.pedido_id;
  end if;
  perform app.verificar_conclusao_rota(v_rota.id);
  return null;
end $$;

create or replace function public.reagendar_entrega(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_e public.entregas;
  v_ped public.pedidos;
  v_data date := (args ->> 'data')::date;
  v_rota public.rotas;
begin
  perform app.exigir_perfil(array['admin']);
  select * into v_e from public.entregas where id = (args ->> 'entrega_id')::uuid and empresa_id = public.auth_empresa_id() for update;
  if not found then raise exception 'Entrega não encontrada.'; end if;
  select * into v_ped from public.pedidos where id = v_e.pedido_id;
  if v_ped.status = 'cancelado' then raise exception 'Pedido cancelado.'; end if;

  if v_e.status = 'nao_entregue' then
    if (app.entrega_ativa(v_ped.id)).id is not null then raise exception 'Já existe uma entrega ativa para este pedido.'; end if;
    update public.pedidos set status = 'pronto', data_entrega = v_data where id = v_ped.id returning * into v_ped;
    perform app.criar_entrega(v_ped, v_data, 'reagendada');
    return null;
  end if;
  if v_e.status not in ('pendente', 'reagendada') then
    raise exception 'Somente entregas pendentes ou não realizadas podem ser reagendadas.';
  end if;
  v_rota := app.rota_da_entrega(v_e.id);
  if v_rota.id is not null and v_rota.status <> 'planejada' then raise exception 'A entrega está em uma rota em andamento.'; end if;
  perform app.remover_da_rota(v_e.id);
  update public.entregas set data = v_data, status = 'reagendada' where id = v_e.id;
  update public.pedidos set data_entrega = v_data where id = v_ped.id;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Onboarding: cria a empresa e o primeiro administrador para o usuário logado
-- (chamado uma única vez após o cadastro no Supabase Auth)
-- ---------------------------------------------------------------------
create or replace function public.onboarding_criar_empresa(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_emp public.empresas;
begin
  if auth.uid() is null then raise exception 'Faça login para continuar.'; end if;
  if exists (select 1 from public.usuarios where id = auth.uid()) then raise exception 'Usuário já vinculado a uma empresa.'; end if;
  insert into public.empresas (nome, cidade, estado, partida_descricao, partida_lat, partida_lng)
  values (args ->> 'nome', coalesce(args ->> 'cidade', ''), coalesce(args ->> 'estado', ''),
          coalesce(args ->> 'partida_descricao', ''), coalesce((args ->> 'partida_lat')::float8, 0), coalesce((args ->> 'partida_lng')::float8, 0))
  returning * into v_emp;
  insert into public.usuarios (id, empresa_id, nome, email, perfil)
  values (auth.uid(), v_emp.id, coalesce(args ->> 'nome_usuario', 'Administrador'),
          coalesce((select email from auth.users where id = auth.uid()), ''), 'admin');
  return to_jsonb(v_emp);
end $$;

-- ---------------------------------------------------------------------
-- Vincula à empresa do administrador um usuário recém-criado no Auth
-- (o app cria a conta com signUp e em seguida chama esta função).
-- Proteções: somente admin; e-mail precisa conferir; conta criada há no
-- máximo 15 minutos; usuário ainda não vinculado a nenhuma empresa.
-- ---------------------------------------------------------------------
create or replace function public.vincular_usuario(args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := (args ->> 'id')::uuid;
  v_email text;
  v_criado timestamptz;
  v_perfil text := args ->> 'perfil';
  v_u public.usuarios;
begin
  perform app.exigir_perfil(array['admin']);
  if v_perfil not in ('admin', 'vendedor', 'motorista') then raise exception 'Perfil inválido.'; end if;
  if coalesce(trim(args ->> 'nome'), '') = '' then raise exception 'Informe o nome.'; end if;
  select email, created_at into v_email, v_criado from auth.users where id = v_id;
  if not found then raise exception 'Conta não encontrada.'; end if;
  if lower(v_email) <> lower(trim(args ->> 'email')) then raise exception 'Os dados da conta não conferem.'; end if;
  if v_criado < now() - interval '15 minutes' then raise exception 'Cadastro expirado. Tente novamente.'; end if;
  if exists (select 1 from public.usuarios where id = v_id) then raise exception 'Este usuário já está vinculado a uma empresa.'; end if;
  insert into public.usuarios (id, empresa_id, nome, email, perfil)
  values (v_id, public.auth_empresa_id(), trim(args ->> 'nome'), lower(v_email), v_perfil)
  returning * into v_u;
  return to_jsonb(v_u);
end $$;

-- Permissões: RPCs somente para usuários autenticados; helpers internos sem acesso direto
do $$
declare f text;
begin
  foreach f in array array['salvar_pedido','alterar_status_pedido','gerar_entrega','registrar_pagamento','salvar_plano_rotas',
                           'iniciar_rota','confirmar_entrega','registrar_falha_entrega','reagendar_entrega','onboarding_criar_empresa',
                           'vincular_usuario']
  loop
    execute format('revoke all on function public.%I(jsonb) from public, anon', f);
    execute format('grant execute on function public.%I(jsonb) to authenticated', f);
  end loop;
end $$;

revoke all on all functions in schema app from public, anon, authenticated;
grant execute on function app.motorista_ve_entrega(uuid), app.motorista_ve_pedido(uuid), app.motorista_ve_cliente(uuid) to authenticated;
