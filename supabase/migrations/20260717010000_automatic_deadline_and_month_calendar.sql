begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Diferencia uma data prevista de um horário efetivamente confirmado.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'installation_time_confirmed'
  ) then
    alter table public.orders
      add column installation_time_confirmed boolean not null default false;

    update public.orders
    set installation_time_confirmed = true
    where installation_scheduled_at is not null;
  end if;
end
$$;

-- Retorna o último dia útil anterior, considerando segunda a sexta-feira.
create or replace function public.previous_business_day(p_date date)
returns date
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_date date := p_date - 1;
begin
  while extract(isodow from v_date) in (6, 7) loop
    v_date := v_date - 1;
  end loop;
  return v_date;
end;
$$;

comment on function public.previous_business_day(date) is
  'Calcula o prazo de produção como um dia útil antes da instalação ou entrega.';

-- Remove temporariamente os gatilhos para ajustar os pedidos existentes sem
-- poluir o histórico com uma alteração técnica de implantação.
drop trigger if exists audit_order_updates on public.orders;
drop trigger if exists trg_log_order_field_changes on public.orders;
drop trigger if exists sync_order_production_deadline on public.orders;

-- Pedidos antigos: a data que estava em delivery_date passa a representar a
-- instalação/entrega; o novo delivery_date vira o prazo interno de produção.
update public.orders
set installation_scheduled_at = make_timestamptz(
      extract(year from delivery_date)::integer,
      extract(month from delivery_date)::integer,
      extract(day from delivery_date)::integer,
      8,
      0,
      0,
      'America/Manaus'
    ),
    delivery_date = public.previous_business_day(delivery_date),
    installation_status = case
      when installation_status in ('completed', 'cancelled', 'in_progress') then installation_status
      else 'scheduled'
    end,
    installation_time_confirmed = false
where installation_scheduled_at is null;

-- Para pedidos que já tinham agendamento, o prazo interno é sincronizado com
-- a data local de instalação/entrega.
update public.orders
set delivery_date = public.previous_business_day(
      (installation_scheduled_at at time zone 'America/Manaus')::date
    )
where installation_scheduled_at is not null
  and delivery_date is distinct from public.previous_business_day(
    (installation_scheduled_at at time zone 'America/Manaus')::date
  );

-- Mantém a regra mesmo em cadastros e integrações que não usam a interface.
create or replace function public.sync_order_production_deadline()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_date date;
begin
  if new.installation_scheduled_at is not null then
    v_target_date := (new.installation_scheduled_at at time zone 'America/Manaus')::date;
    new.delivery_date := public.previous_business_day(v_target_date);
  elsif tg_op = 'INSERT' and new.delivery_date is not null then
    -- Compatibilidade com cadastros antigos: a data informada é tratada como
    -- instalação/entrega e o prazo de produção é calculado automaticamente.
    v_target_date := new.delivery_date;
    new.installation_scheduled_at := make_timestamptz(
      extract(year from v_target_date)::integer,
      extract(month from v_target_date)::integer,
      extract(day from v_target_date)::integer,
      8,
      0,
      0,
      'America/Manaus'
    );
    new.delivery_date := public.previous_business_day(v_target_date);
  end if;

  return new;
end;
$$;

create trigger sync_order_production_deadline
before insert or update of installation_scheduled_at, delivery_date
on public.orders
for each row
execute function public.sync_order_production_deadline();

-- Auditoria operacional sem restringir o agendamento ao setor INSTALAÇÃO.
-- A data pode ser definida no cadastro e o pedido continua no setor produtivo.
create or replace function public.audit_order_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := clock_timestamp();
  new.blocked := false;

  if auth.uid() is not null
     and public.current_user_role() <> 'admin' then
    new.created_by := old.created_by;
  end if;

  if new.status = 'completed' then
    if old.status is distinct from new.status then
      new.completed_at := clock_timestamp();
    else
      new.completed_at := coalesce(old.completed_at, clock_timestamp());
    end if;
  else
    new.completed_at := null;
  end if;

  if old.sector_id is distinct from new.sector_id
     or old.status is distinct from new.status then
    insert into public.order_history (
      order_id, user_id, action_type, description,
      previous_sector_id, new_sector_id, previous_status, new_status,
      previous_blocked, new_blocked,
      previous_installation_scheduled_at, new_installation_scheduled_at
    ) values (
      new.id,
      auth.uid(),
      case
        when new.status = 'completed' then 'completed'
        when old.status = 'completed' then 'reopened'
        else 'movement'
      end,
      case
        when new.status = 'completed' then 'Pedido finalizado'
        when old.status = 'completed' then 'Pedido reaberto'
        else 'Pedido movimentado no Kanban'
      end,
      old.sector_id, new.sector_id, old.status, new.status,
      old.blocked, new.blocked,
      old.installation_scheduled_at, new.installation_scheduled_at
    );
  end if;

  if old.installation_scheduled_at
     is distinct from new.installation_scheduled_at then
    insert into public.order_history (
      order_id, user_id, action_type, description,
      previous_sector_id, new_sector_id, previous_status, new_status,
      previous_blocked, new_blocked,
      previous_installation_scheduled_at, new_installation_scheduled_at
    ) values (
      new.id,
      auth.uid(),
      case
        when new.installation_scheduled_at is null then 'installation_cancelled'
        when old.installation_scheduled_at is null then 'installation_scheduled'
        else 'installation_rescheduled'
      end,
      case
        when new.installation_scheduled_at is null then 'Data da instalação/entrega removida'
        when old.installation_scheduled_at is null then
          'Instalação/entrega agendada para ' || to_char(
            new.installation_scheduled_at at time zone 'America/Manaus',
            'DD/MM/YYYY HH24:MI'
          )
        else
          'Instalação/entrega reagendada para ' || to_char(
            new.installation_scheduled_at at time zone 'America/Manaus',
            'DD/MM/YYYY HH24:MI'
          )
      end,
      old.sector_id, new.sector_id, old.status, new.status,
      old.blocked, new.blocked,
      old.installation_scheduled_at, new.installation_scheduled_at
    );
  end if;

  return new;
end;
$$;

create trigger audit_order_updates
before update on public.orders
for each row
execute function public.audit_order_change();

-- Restaura o histórico detalhado definido na migração anterior.
create trigger trg_log_order_field_changes
after update on public.orders
for each row
execute function public.log_order_field_changes();

create index if not exists orders_target_date_idx
  on public.orders (((installation_scheduled_at at time zone 'America/Manaus')::date))
  where installation_scheduled_at is not null;

comment on column public.orders.delivery_date is
  'Prazo interno de produção, calculado automaticamente como um dia útil antes da instalação/entrega.';
comment on column public.orders.installation_scheduled_at is
  'Data e hora prevista para instalação ou entrega do pedido.';
comment on column public.orders.installation_time_confirmed is
  'True quando o horário foi confirmado; false quando somente a data foi definida.';

commit;
