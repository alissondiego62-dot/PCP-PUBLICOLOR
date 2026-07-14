-- Cadastro automático do cliente na importação PDF e fluxo exclusivo do setor PCP.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

alter type public.order_status add value if not exists 'in_transport';
alter type public.order_status add value if not exists 'waiting_client';

-- Mantém o PCP como primeiro setor ativo sem deslocar os demais novamente
-- quando a migração for executada mais de uma vez.
do $$
declare
  current_pcp_id uuid;
  pcp_already_ready boolean := false;
begin
  select id
    into current_pcp_id
  from public.sectors
  where upper(trim(name)) = 'PCP'
  order by created_at
  limit 1;

  if current_pcp_id is not null then
    select active and position = 1
      into pcp_already_ready
    from public.sectors
    where id = current_pcp_id;
  end if;

  if not coalesce(pcp_already_ready, false) then
    update public.sectors
       set position = position + 1
     where active = true
       and (current_pcp_id is null or id <> current_pcp_id);
  end if;

  insert into public.sectors (name, position, active)
  values ('PCP', 1, true)
  on conflict (name) do update
    set position = 1,
        active = true;
end;
$$;

create or replace function public.normalize_pdf_client_name(value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select upper(
    regexp_replace(
      trim(
        translate(
          coalesce(value, ''),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
        )
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.ensure_client_by_name(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_name text := regexp_replace(trim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  normalized_name text;
  existing_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão não autenticada.' using errcode = '42501';
  end if;

  if coalesce(public.current_user_role()::text, '') not in ('admin', 'production', 'manager') then
    raise exception 'Usuário sem permissão para cadastrar clientes.' using errcode = '42501';
  end if;

  if clean_name = '' then
    raise exception 'O nome do cliente não foi informado.' using errcode = '22023';
  end if;

  normalized_name := public.normalize_pdf_client_name(clean_name);

  -- Evita que duas importações simultâneas criem o mesmo cliente.
  perform pg_advisory_xact_lock(hashtextextended(normalized_name, 20260728));

  select c.id
    into existing_id
  from public.clients c
  where public.normalize_pdf_client_name(c.name) = normalized_name
     or public.normalize_pdf_client_name(c.trade_name) = normalized_name
  order by c.active desc, c.created_at asc
  limit 1
  for update;

  if existing_id is not null then
    update public.clients
       set active = true,
           updated_at = now()
     where id = existing_id
       and active = false;
    return existing_id;
  end if;

  insert into public.clients (name, active, created_by)
  values (clean_name, true, auth.uid())
  returning id into existing_id;

  return existing_id;
end;
$$;

revoke all on function public.ensure_client_by_name(text) from public, anon;
grant execute on function public.ensure_client_by_name(text) to authenticated;
grant execute on function public.normalize_pdf_client_name(text) to authenticated;

-- Autoriza os novos status durante cadastros feitos pelo sistema.
drop policy if exists "orders_create_leadership" on public.orders;
create policy "orders_create_leadership"
on public.orders
for insert
to authenticated
with check (
  public.current_user_role()::text in ('admin', 'production', 'manager')
  and created_by = (select auth.uid())
  and status::text in ('waiting', 'in_progress', 'in_transport', 'waiting_client')
  and blocked = false
  and completed_at is null
);

comment on function public.ensure_client_by_name(text) is
  'Localiza o cliente pelo nome normalizado ou cria um cadastro mínimo somente com o nome durante a importação de PDF.';
comment on policy "orders_create_leadership" on public.orders is
  'Permite cadastro de pedidos ativos, incluindo os status exclusivos do setor PCP.';

notify pgrst, 'reload schema';

commit;
