-- Numeração automática + bloqueio definitivo de números de OS duplicados.
-- Pode ser executado mais de uma vez.

begin;

create table if not exists public.system_counters (
  counter_key text primary key,
  counter_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

revoke all on table public.system_counters from public, anon, authenticated;

create or replace function public.normalized_order_number(value text)
returns text
language sql
immutable
parallel safe
as $$
  select upper(btrim(coalesce(value, '')))
$$;

create or replace function public.generate_unique_order_number()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requester_role text;
  current_max bigint := 0;
  candidate bigint;
  candidate_text text;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  select p.role::text
    into requester_role
  from public.profiles p
  where p.id = auth.uid()
    and coalesce(p.active, true) = true
  limit 1;

  if requester_role is null or requester_role not in ('admin', 'manager', 'production') then
    raise exception 'Seu perfil não pode gerar números de OS.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('publicolor:orders:auto-number'));

  select coalesce(max((regexp_match(trim(o.op_number), '^([0-9]+)'))[1]::bigint), 0)
    into current_max
  from public.orders o
  where trim(o.op_number) ~ '^[0-9]+';

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

    if candidate is null then
      raise exception 'Não foi possível atualizar o contador de OS.';
    end if;

    candidate_text := candidate::text;

    exit when not exists (
      select 1
      from public.orders o
      where public.normalized_order_number(o.op_number) = public.normalized_order_number(candidate_text)
         or public.normalized_order_number(o.op_number) like public.normalized_order_number(candidate_text || '-%')
    );
  end loop;

  return candidate_text;
end;
$$;

revoke all on function public.generate_unique_order_number() from public, anon;
grant execute on function public.generate_unique_order_number() to authenticated;

create or replace function public.order_number_exists(
  p_order_number text,
  p_exclude_order_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_normalized text := public.normalized_order_number(p_order_number);
begin
  if auth.uid() is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;

  if v_normalized = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.orders o
    where public.normalized_order_number(o.op_number) = v_normalized
      and (p_exclude_order_id is null or o.id <> p_exclude_order_id)
  );
end;
$$;

revoke all on function public.order_number_exists(text, uuid) from public, anon;
grant execute on function public.order_number_exists(text, uuid) to authenticated;

create or replace function public.prevent_duplicate_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text;
begin
  new.op_number := btrim(coalesce(new.op_number, ''));
  v_normalized := public.normalized_order_number(new.op_number);

  if v_normalized = '' then
    raise exception 'O número da OS não pode ficar vazio.'
      using errcode = '23514', constraint = 'orders_op_number_not_blank';
  end if;

  -- Bloqueia somente operações concorrentes com o mesmo número.
  perform pg_advisory_xact_lock(hashtextextended(v_normalized, 0));

  if exists (
    select 1
    from public.orders o
    where public.normalized_order_number(o.op_number) = v_normalized
      and o.id is distinct from new.id
  ) then
    raise exception 'A OS % já está cadastrada.', new.op_number
      using errcode = '23505', constraint = 'orders_op_number_normalized_unique';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_order_number_trigger on public.orders;
create trigger prevent_duplicate_order_number_trigger
before insert or update of op_number on public.orders
for each row execute function public.prevent_duplicate_order_number();

-- Cria uma proteção física adicional quando a base atual não possui
-- duplicidades antigas após normalização.
do $$
begin
  if not exists (
    select 1
    from public.orders
    group by public.normalized_order_number(op_number)
    having count(*) > 1
  ) then
    execute 'create unique index if not exists orders_op_number_normalized_uidx
      on public.orders (public.normalized_order_number(op_number))';
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';
