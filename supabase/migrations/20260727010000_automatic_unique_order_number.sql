-- Gera números únicos de OS quando o campo estiver vazio ou contiver somente zeros.
-- O contador é centralizado no banco para evitar duplicidade entre usuários simultâneos.

create table if not exists public.system_counters (
  counter_key text primary key,
  counter_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

revoke all on table public.system_counters from anon, authenticated;

create or replace function public.generate_unique_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_role text;
  current_max bigint;
  candidate bigint;
  candidate_text text;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  requester_role := public.current_user_role()::text;
  if requester_role not in ('admin', 'manager', 'production') then
    raise exception 'Seu perfil não pode gerar números de OS.' using errcode = '42501';
  end if;

  select coalesce(max(substring(op_number from '^([0-9]+)')::bigint), 0)
    into current_max
  from public.orders
  where op_number ~ '^[0-9]+';

  insert into public.system_counters (counter_key, counter_value, updated_at)
  values ('orders', current_max, now())
  on conflict (counter_key) do update
    set counter_value = greatest(public.system_counters.counter_value, excluded.counter_value),
        updated_at = now();

  loop
    update public.system_counters
       set counter_value = counter_value + 1,
           updated_at = now()
     where counter_key = 'orders'
     returning counter_value into candidate;

    candidate_text := candidate::text;

    exit when not exists (
      select 1
      from public.orders
      where upper(trim(op_number)) = upper(candidate_text)
         or upper(trim(op_number)) like upper(candidate_text || '-%')
    );
  end loop;

  return candidate_text;
end;
$$;

revoke all on function public.generate_unique_order_number() from public, anon;
grant execute on function public.generate_unique_order_number() to authenticated;

comment on function public.generate_unique_order_number() is
  'Retorna um número base de OS único e reservado pelo contador central do sistema.';

notify pgrst, 'reload schema';
