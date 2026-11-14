-- Security cleanup from the database advisor:
-- run_status_checks() was callable by anyone through the REST API; only the pg_cron job (as postgres) needs it.
-- The connected-apps functions already check team membership inside, but signed-out visitors have no reason to call them.
revoke execute on function public.run_status_checks() from public, anon, authenticated;
revoke execute on function public.oauth_grants_for_team(uuid) from public, anon;
revoke execute on function public.revoke_oauth_grant(uuid) from public, anon;
grant execute on function public.oauth_grants_for_team(uuid) to authenticated;
grant execute on function public.revoke_oauth_grant(uuid) to authenticated;
