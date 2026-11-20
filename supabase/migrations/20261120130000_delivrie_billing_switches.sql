-- Admin → Website → Payments: switch Stripe (US dollars) or Paystack (Naira) off for new payments.
-- Stored as site_config.billing = {"stripe": bool, "paystack": bool}; missing means both on.
create or replace function public.admin_site_set(p_key text, p_value jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  perform public.admin_guard('admin');
  if p_key not in ('pages', 'banner', 'compare', 'edits', 'billing') then raise exception 'Unknown setting %', p_key; end if;
  if p_key = 'billing' and (jsonb_typeof(p_value) is distinct from 'object'
      or jsonb_typeof(p_value->'stripe') is distinct from 'boolean' or jsonb_typeof(p_value->'paystack') is distinct from 'boolean') then
    raise exception 'Payment switches must be true or false';
  end if;
  if pg_column_size(p_value) > 2000000 then raise exception 'Too large'; end if;
  insert into public.site_config(key, value, updated_at, updated_by) values (p_key, coalesce(p_value, '{}'::jsonb), now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('key', p_key, 'updated_at', now());
end $function$;
