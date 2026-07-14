revoke all on function public.audit_order_change() from public, anon, authenticated;
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.current_user_role() from public, anon;

grant execute on function public.current_user_role() to authenticated;
