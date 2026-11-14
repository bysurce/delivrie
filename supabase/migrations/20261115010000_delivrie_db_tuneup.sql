-- Database tune-up from the Supabase advisors (no behaviour change).
-- 1. RLS policies call auth.uid() once per query instead of once per row.
alter policy profiles_self_select on public.profiles using ((id = (select auth.uid())) or exists (
  select 1 from public.team_members m1 join public.team_members m2 on m1.team_id = m2.team_id
   where m1.user_id = (select auth.uid()) and m2.user_id = profiles.id));
alter policy profiles_self_update on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy tm_admin_or_self_delete on public.team_members using (public.is_team_admin(team_id) or user_id = (select auth.uid()));
alter policy sr_insert on public.support_requests with check (user_id = (select auth.uid()));
alter policy sr_select on public.support_requests using (user_id = (select auth.uid()));
alter policy fb_insert on public.feedback with check (user_id = (select auth.uid()));
alter policy fb_select on public.feedback using (user_id = (select auth.uid()));

-- 2. Index every foreign key, so lookups and cascading deletes don't scan whole tables.
create index if not exists support_messages_user_id_fk on public.support_messages (user_id);
create index if not exists support_threads_team_id_fk on public.support_threads (team_id);
create index if not exists site_config_updated_by_fk on public.site_config (updated_by);
create index if not exists oauth_grants_user_id_fk on public.oauth_grants (user_id);
create index if not exists oauth_grants_client_id_fk on public.oauth_grants (client_id);
create index if not exists oauth_codes_user_id_fk on public.oauth_codes (user_id);
create index if not exists oauth_codes_team_id_fk on public.oauth_codes (team_id);
create index if not exists oauth_codes_client_id_fk on public.oauth_codes (client_id);
create index if not exists sso_configs_updated_by_fk on public.sso_configs (updated_by);
create index if not exists domain_claims_created_by_fk on public.domain_claims (created_by);
create index if not exists automation_runs_contact_id_fk on public.automation_runs (contact_id);
create index if not exists automation_runs_team_id_fk on public.automation_runs (team_id);
create index if not exists automations_created_by_fk on public.automations (created_by);
create index if not exists events_contact_id_fk on public.events (contact_id);
create index if not exists feedback_user_id_fk on public.feedback (user_id);
create index if not exists feedback_team_id_fk on public.feedback (team_id);
create index if not exists support_requests_user_id_fk on public.support_requests (user_id);
create index if not exists support_requests_team_id_fk on public.support_requests (team_id);
create index if not exists request_logs_api_key_id_fk on public.request_logs (api_key_id);
create index if not exists webhook_deliveries_team_id_fk on public.webhook_deliveries (team_id);
create index if not exists webhooks_team_id_fk on public.webhooks (team_id);
create index if not exists email_shares_created_by_fk on public.email_shares (created_by);
create index if not exists email_shares_team_id_fk on public.email_shares (team_id);
create index if not exists email_shares_email_id_fk on public.email_shares (email_id);
create index if not exists emails_contact_id_fk on public.emails (contact_id);
create index if not exists emails_template_id_fk on public.emails (template_id);
create index if not exists emails_domain_id_fk on public.emails (domain_id);
create index if not exists emails_api_key_id_fk on public.emails (api_key_id);
create index if not exists broadcasts_created_by_fk on public.broadcasts (created_by);
create index if not exists broadcasts_topic_id_fk on public.broadcasts (topic_id);
create index if not exists broadcasts_segment_id_fk on public.broadcasts (segment_id);
create index if not exists template_versions_created_by_fk on public.template_versions (created_by);
create index if not exists template_versions_team_id_fk on public.template_versions (team_id);
create index if not exists templates_created_by_fk on public.templates (created_by);
create index if not exists contact_topics_team_id_fk on public.contact_topics (team_id);
create index if not exists contact_topics_topic_id_fk on public.contact_topics (topic_id);
create index if not exists topics_team_id_fk on public.topics (team_id);
create index if not exists segment_contacts_team_id_fk on public.segment_contacts (team_id);
create index if not exists segments_team_id_fk on public.segments (team_id);
create index if not exists api_keys_created_by_fk on public.api_keys (created_by);
create index if not exists api_keys_domain_id_fk on public.api_keys (domain_id);
create index if not exists team_invites_invited_by_fk on public.team_invites (invited_by);
create index if not exists teams_created_by_fk on public.teams (created_by);
