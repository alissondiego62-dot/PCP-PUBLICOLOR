begin;

alter table public.orders
  add column if not exists materials text,
  add column if not exists notes text,
  add column if not exists installation_address text,
  add column if not exists installation_team text,
  add column if not exists installation_vehicle text,
  add column if not exists installation_status text default 'pending',
  add column if not exists installation_notes text,
  add column if not exists installation_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_installation_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_installation_status_check
      check (installation_status in ('pending','scheduled','in_progress','completed','cancelled'));
  end if;
end
$$;

update public.orders
set installation_status = case
  when installation_completed_at is not null then 'completed'
  when installation_scheduled_at is not null then 'scheduled'
  else coalesce(installation_status, 'pending')
end;

create index if not exists orders_installation_status_idx
  on public.orders (installation_status, installation_scheduled_at)
  where status <> 'completed';

comment on column public.orders.materials is 'Materiais, medidas e especificações da ordem de serviço.';
comment on column public.orders.notes is 'Observações gerais da ordem de serviço.';
comment on column public.orders.installation_address is 'Endereço completo da instalação.';
comment on column public.orders.installation_team is 'Equipe responsável pela instalação.';
comment on column public.orders.installation_vehicle is 'Veículo destinado à instalação.';
comment on column public.orders.installation_status is 'pending, scheduled, in_progress, completed ou cancelled.';
comment on column public.orders.installation_notes is 'Orientações e observações de campo.';

commit;
