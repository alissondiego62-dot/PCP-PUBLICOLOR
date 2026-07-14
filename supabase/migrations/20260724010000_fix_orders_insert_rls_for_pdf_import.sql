-- Corrige a política de INSERT de pedidos para o cadastro com data de
-- instalação/entrega, usado pelo formulário normal e pelo importador de PDF.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Mantém a autoria automática para clientes antigos e exige que a autoria
-- corresponda ao usuário autenticado na política abaixo.
alter table public.orders
  alter column created_by set default auth.uid();

drop policy if exists "orders_create_leadership" on public.orders;

create policy "orders_create_leadership"
on public.orders
for insert
to authenticated
with check (
  public.current_user_role()::text in ('admin', 'production', 'manager')
  and created_by = (select auth.uid())
  and status in ('waiting', 'in_progress')
  and blocked = false
  and completed_at is null
);

comment on policy "orders_create_leadership" on public.orders is
  'Permite que administradores e operadores criem pedidos com data de instalação/entrega; exige autoria do usuário autenticado e pedido ainda não concluído.';

-- Atualiza o cache de esquema do PostgREST após a alteração.
notify pgrst, 'reload schema';

commit;
