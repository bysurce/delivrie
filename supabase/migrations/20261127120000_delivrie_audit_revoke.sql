-- The audit triggers' functions only run as triggers; nobody should be able to call them through the API.
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.audit_sign_in() from public, anon, authenticated;
