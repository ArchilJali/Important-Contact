-- Important Contact: a NEW, dedicated Supabase project only.
-- Membership is bound to a verified Auth UUID and exact email, never browser metadata.
begin;
create table public.ic_members (
  email text primary key check(email = lower(email)),
  user_id uuid unique references auth.users(id),
  display_name text not null default '',
  role text not null check(role in ('owner','editor','viewer')),
  enabled boolean not null default true
);
create unique index ic_one_owner on public.ic_members(role) where role='owner';
create table public.ic_contacts (
  id text primary key check(id ~ '^[A-Za-z0-9_-]{1,80}$'),
  record jsonb not null check(jsonb_typeof(record)='object'),
  version integer not null default 1,
  review_relationship text not null default 'not_assessed' check(review_relationship in ('known','not_known','not_assessed')),
  review_valuable boolean not null default false,
  do_not_contact boolean not null default false,
  review_note text not null default '' check(length(review_note)<=4000),
  bhoc_active_contact text not null default 'unknown' check(bhoc_active_contact in ('active','inactive','unknown')),
  bhoc_last_contact_on date,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create table public.ic_resources (
  collection text not null,
  id text not null,
  payload jsonb not null,
  primary key(collection,id)
);
create table public.ic_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  recorded_at timestamptz not null default now()
);
-- These tables have NO authenticated/anonymous policies or grants.
create table public.ic_web_sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  encrypted_tokens text not null,
  csrf_token text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null
);
create table public.ic_rate_buckets (
  key text primary key,
  window_start bigint not null,
  count integer not null
);

create function public.ic_role() returns text
language sql stable security definer set search_path=''
as $$
 select m.role from public.ic_members m join auth.users u on u.id=m.user_id
 where m.user_id=auth.uid() and m.enabled
 and u.email_confirmed_at is not null and lower(u.email)=m.email
 and lower(coalesce(auth.jwt()->>'email',''))=m.email
 and (u.banned_until is null or u.banned_until < now())
 limit 1;
$$;
revoke all on function public.ic_role() from public, anon;
grant execute on function public.ic_role() to authenticated,service_role;

alter table public.ic_members enable row level security;
alter table public.ic_contacts enable row level security;
alter table public.ic_resources enable row level security;
alter table public.ic_audit enable row level security;
alter table public.ic_web_sessions enable row level security;
alter table public.ic_rate_buckets enable row level security;
revoke all on public.ic_members,public.ic_contacts,public.ic_resources,public.ic_audit,
 public.ic_web_sessions,public.ic_rate_buckets from public,anon,authenticated;
grant select on public.ic_members,public.ic_contacts,public.ic_resources,public.ic_audit to authenticated;
grant all on public.ic_members,public.ic_contacts,public.ic_resources,public.ic_audit,
 public.ic_web_sessions,public.ic_rate_buckets to service_role;
grant usage,select on sequence public.ic_audit_id_seq to service_role;
create policy members_read on public.ic_members for select to authenticated
 using ((select public.ic_role())='owner' or (user_id=auth.uid() and (select public.ic_role()) is not null));
create policy contacts_read on public.ic_contacts for select to authenticated using ((select public.ic_role()) is not null);
create policy resources_read on public.ic_resources for select to authenticated using ((select public.ic_role()) is not null);
create policy audit_read on public.ic_audit for select to authenticated using ((select public.ic_role())='owner');
-- Authenticated callers have NO direct write permissions. Mutations use checked RPCs.

create function public.ic_save_contact(
 p_id text,p_version integer,p_patch jsonb,p_relationship text,p_valuable boolean,
 p_restricted boolean,p_note text,p_active text,p_last_contact date,
 p_release_confirmed boolean default false,p_release_reason text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.ic_contacts; saved public.ic_contacts; k text; doc jsonb; r text;
begin
 r:=public.ic_role();
 if r is null or r not in ('owner','editor') then raise insufficient_privilege using message='Editing is not permitted'; end if;
 select * into old from public.ic_contacts where id=p_id for update;
 if not found then raise no_data_found using message='Contact not found'; end if;
 if old.version<>p_version then raise exception using errcode='40001',message='Record changed. Reload before saving.'; end if;
 if jsonb_typeof(p_patch)<>'object' then raise check_violation using message='Invalid patch'; end if;
 for k in select jsonb_object_keys(p_patch) loop
  if k <> all(array['name','role_summary','country_tags','species_tags','sections','linkedin_url','contact_page',
    'public_professional_email','priority_score','priority_reason','known_gaps','next_action']) then
    raise check_violation using message='This field cannot be changed through this form';
  end if;
 end loop;
 if old.do_not_contact and not p_restricted and (not p_release_confirmed or length(trim(p_release_reason))<5) then
  raise check_violation using message='Explicit acknowledgement and a reason are required to release a red restriction';
 end if;
 if p_last_contact>current_date then raise check_violation using message='Last contact cannot be in the future'; end if;
 doc:=old.record||p_patch;
 if coalesce(length(trim(doc->>'name')),0)=0 or length(doc->>'name')>300 then raise check_violation using message='Name is required'; end if;
 if coalesce((doc->>'priority_score')::integer,0) not between 1 and 10 then raise check_violation using message='Priority must be 1-10'; end if;
 foreach k in array array['country_tags','species_tags','sections'] loop
  if jsonb_typeof(doc->k) is distinct from 'array' then raise check_violation using message='Classification must be an array'; end if;
 end loop;
 foreach k in array array['linkedin_url','contact_page'] loop
  if coalesce(doc->>k,'')<>'' and doc->>k !~* '^https?://' then raise check_violation using message='Only HTTP(S) links are accepted'; end if;
 end loop;
 if p_patch ? 'priority_score' and p_patch->'priority_score' is distinct from old.record->'priority_score' then
  doc:=doc||jsonb_build_object('human_reviewed_priority',true,'score_status','human_updated');
 end if;
 update public.ic_contacts set record=doc,version=old.version+1,
  review_relationship=p_relationship,review_valuable=p_valuable,do_not_contact=p_restricted,review_note=p_note,
  bhoc_active_contact=p_active,bhoc_last_contact_on=p_last_contact,updated_at=now(),updated_by=auth.uid()
  where id=p_id returning * into saved;
 insert into public.ic_audit(actor_id,actor_email,action,entity_id,before_value,after_value)
 values(auth.uid(),(select email from auth.users where id=auth.uid()),'contact_updated',p_id,
  to_jsonb(old),to_jsonb(saved)||jsonb_build_object('restriction_release_reason',p_release_reason));
 return to_jsonb(saved);
end;
$$;
revoke all on function public.ic_save_contact(text,integer,jsonb,text,boolean,boolean,text,text,date,boolean,text) from public,anon;
grant execute on function public.ic_save_contact(text,integer,jsonb,text,boolean,boolean,text,text,date,boolean,text) to authenticated;

create function public.ic_create_contact(p_id text,p_record jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.ic_contacts;
begin
 if public.ic_role() is distinct from 'owner' then raise insufficient_privilege; end if;
 if coalesce(length(trim(p_record->>'name')),0)=0 or coalesce((p_record->>'priority_score')::integer,0) not between 1 and 10 then
  raise check_violation using message='Name and valid priority are required'; end if;
 insert into public.ic_contacts(id,record,updated_by) values(p_id,p_record||jsonb_build_object('id',p_id),auth.uid()) returning * into saved;
 insert into public.ic_audit(actor_id,actor_email,action,entity_id,after_value)
 values(auth.uid(),(select email from auth.users where id=auth.uid()),'contact_created',p_id,to_jsonb(saved));
 return to_jsonb(saved);
end;
$$;
revoke all on function public.ic_create_contact(text,jsonb) from public,anon;
grant execute on function public.ic_create_contact(text,jsonb) to authenticated;

create function public.ic_delete_contact(p_id text,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare old public.ic_contacts;
begin
 if public.ic_role() is distinct from 'owner' then raise insufficient_privilege; end if;
 select * into old from public.ic_contacts where id=p_id for update;
 if not found then raise no_data_found; end if;
 if old.version<>p_version then raise exception using errcode='40001',message='Record changed'; end if;
 insert into public.ic_audit(actor_id,actor_email,action,entity_id,before_value)
 values(auth.uid(),(select email from auth.users where id=auth.uid()),'contact_deleted',p_id,to_jsonb(old));
 delete from public.ic_contacts where id=p_id;
end;
$$;
revoke all on function public.ic_delete_contact(text,integer) from public,anon;
grant execute on function public.ic_delete_contact(text,integer) to authenticated;

create function public.ic_set_member(p_email text,p_role text,p_enabled boolean,p_display_name text default '') returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid; em text:=lower(trim(p_email)); old public.ic_members;
begin
 if public.ic_role() is distinct from 'owner' then raise insufficient_privilege; end if;
 if p_role not in ('editor','viewer') then raise check_violation using message='Only the configured owner has owner privileges'; end if;
 select * into old from public.ic_members where email=em for update;
 if old.role='owner' then raise check_violation using message='The owner cannot be changed here'; end if;
 select id into uid from auth.users where lower(email)=em;
 if uid is null then raise check_violation using message='Provision the Auth account first'; end if;
 insert into public.ic_members(email,user_id,role,enabled,display_name) values(em,uid,p_role,p_enabled,p_display_name)
 on conflict(email) do update set user_id=excluded.user_id,role=excluded.role,enabled=excluded.enabled,display_name=excluded.display_name;
 -- Role changes and revocation also terminate existing application sessions.
 delete from public.ic_web_sessions where user_id=uid;
 insert into public.ic_audit(actor_id,actor_email,action,entity_id,before_value,after_value)
 values(auth.uid(),(select email from auth.users where id=auth.uid()),'member_access_changed',em,to_jsonb(old),
 jsonb_build_object('email',em,'role',p_role,'enabled',p_enabled,'display_name',p_display_name));
end;
$$;
revoke all on function public.ic_set_member(text,text,boolean,text) from public,anon;
grant execute on function public.ic_set_member(text,text,boolean,text) to authenticated;

create function public.ic_consume_limit(p_key text,p_window integer,p_limit integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare w bigint:=floor(extract(epoch from now())/p_window); n integer;
begin
 insert into public.ic_rate_buckets(key,window_start,count) values(p_key,w,1)
 on conflict(key) do update set count=case when ic_rate_buckets.window_start=w then ic_rate_buckets.count+1 else 1 end,window_start=w
 returning count into n;
 return n<=p_limit;
end;
$$;
revoke all on function public.ic_consume_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.ic_consume_limit(text,integer,integer) to service_role;

-- Exact addresses only, NOT the whole company domain. No Auth users or mail are created by this migration.
insert into public.ic_members(email,display_name,role) values
 ('carl.rausch@wteii.com','Carl Rausch','editor'),
 ('karen.lee@wteii.com','Karen Lee','viewer');
commit;
