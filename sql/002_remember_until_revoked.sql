-- Apply AFTER 001_private_workspace.sql, before starting this release.
-- This migration changes session metadata only, never contacts, roles or sources.
begin;
alter table public.ic_web_sessions add column if not exists remembered boolean not null default false;
alter table public.ic_web_sessions alter column expires_at drop not null;
-- Do not infer consent from a legacy token. Existing sessions remain temporary;
-- the user may verify once again and choose Remember to opt into the new policy.
alter table public.ic_web_sessions add constraint ic_session_expiry_required
 check (remembered or expires_at is not null);
comment on column public.ic_web_sessions.remembered is
 'Explicit Remember consent at verified sign-in. No application age or inactivity timeout; revocable.';
comment on column public.ic_web_sessions.expires_at is
 'NULL only for remembered sessions. Browser retention and Auth-provider revocation remain independent.';
commit;
