-- Retorno controlado de pedidos concluídos para a produção.
-- Exige uma observação, registra histórico e cria um comentário interno.

create or replace function public.reopen_completed_order(
  target_order_id uuid,
  reopening_observation text
)
returns setof public.orders
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_role text;
  clean_observation text;
  target_order public.orders%rowtype;
begin
  current_role := public.current_user_role()::text;
  clean_observation := btrim(coalesce(reopening_observation, ''));

  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if current_role not in ('admin', 'production', 'manager') then
    raise exception 'Seu perfil não pode devolver pedidos para a produção.';
  end if;

  if char_length(clean_observation) < 5 then
    raise exception 'A observação deve ter pelo menos 5 caracteres.';
  end if;

  select *
  into target_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if target_order.status <> 'completed'::public.order_status then
    raise exception 'Somente pedidos concluídos podem voltar para a produção.';
  end if;

  update public.orders
  set
    status = 'waiting'::public.order_status,
    completed_at = null,
    blocked = false
  where id = target_order_id;

  insert into public.order_comments (
    order_id,
    user_id,
    comment
  ) values (
    target_order_id,
    auth.uid(),
    'RETORNO À PRODUÇÃO: ' || clean_observation
  );

  insert into public.order_history (
    order_id,
    user_id,
    action_type,
    description,
    previous_sector_id,
    new_sector_id,
    previous_status,
    new_status
  ) values (
    target_order_id,
    auth.uid(),
    'reopened_observation',
    'Motivo do retorno à produção: ' || clean_observation,
    target_order.sector_id,
    target_order.sector_id,
    'completed'::public.order_status,
    'waiting'::public.order_status
  );

  return query
  select *
  from public.orders
  where id = target_order_id;
end;
$$;

revoke all on function public.reopen_completed_order(uuid, text) from public;
revoke all on function public.reopen_completed_order(uuid, text) from anon;
grant execute on function public.reopen_completed_order(uuid, text) to authenticated;
