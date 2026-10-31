-- superjoin: WhatsApp (who has joined, approvals waiting for an answer, and the message log).
--
-- Run once in the Supabase SQL editor, using the output of `npm run db:sql` (it fills in the app key and also includes the
-- agent-events migration this one builds on: public.app_gate() is defined there). Safe to re-run.
--
-- Security model is the same as the agent logs: the publishable key ships in the browser, so every policy also requires the
-- request to carry the server-only secret in the `x-superjoin-key` header. Nothing here is ever deleted through the API:
-- unlinking someone is a status change, and the message log is append-only.

create table if not exists public.wa_contacts (
  id                text primary key,
  kind              text not null check (kind in ('joiner', 'staff')),
  person_id         text,
  name              text not null,
  email             text,
  dept              text,
  manager           text,
  -- digits only; set when the person joins from their own phone, so the number is proven, not typed in
  phone             text unique,
  status            text not null check (status in ('invited', 'active', 'opted_out')),
  invite_code       text unique,
  invite_expires_at timestamptz,
  -- what the assistant may quote when this joiner asks a question (pushed from the browser)
  snapshot          jsonb,
  last_inbound_at   timestamptz,
  joined_at         timestamptz,
  created_by        text not null,
  created_at        timestamptz not null default now()
);
create index if not exists wa_contacts_email  on public.wa_contacts (lower(email));
create index if not exists wa_contacts_person on public.wa_contacts (person_id);

create table if not exists public.wa_requests (
  id               text primary key,
  code             text not null,
  person_id        text not null,
  item_id          text not null,
  dept             text,
  manager          text,
  to_phone         text not null,
  to_name          text not null,
  title            text not null,
  body             text not null,
  status           text not null check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_by       text not null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  decided_at       timestamptz,
  decided_by_phone text,
  applied          boolean not null default false
);
create index if not exists wa_requests_phone   on public.wa_requests (to_phone, status);
create index if not exists wa_requests_pending on public.wa_requests (status, applied);

create table if not exists public.wa_messages (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  direction text not null check (direction in ('in', 'out')),
  phone     text not null,
  kind      text not null,
  body      text not null,
  -- WhatsApp's message id: unique, so Meta's repeated deliveries are recorded (and acted on) only once
  wa_id     text unique,
  status    text,
  mode      text not null check (mode in ('sandbox', 'live')),
  meta      jsonb
);
create index if not exists wa_messages_phone on public.wa_messages (phone, id desc);

alter table public.wa_contacts enable row level security;
alter table public.wa_requests enable row level security;
alter table public.wa_messages enable row level security;

drop policy if exists wa_contacts_read   on public.wa_contacts;
drop policy if exists wa_contacts_write  on public.wa_contacts;
drop policy if exists wa_contacts_update on public.wa_contacts;
drop policy if exists wa_requests_read   on public.wa_requests;
drop policy if exists wa_requests_write  on public.wa_requests;
drop policy if exists wa_requests_update on public.wa_requests;
drop policy if exists wa_messages_read   on public.wa_messages;
drop policy if exists wa_messages_write  on public.wa_messages;

create policy wa_contacts_read   on public.wa_contacts for select to anon, authenticated using (public.app_gate());
create policy wa_contacts_write  on public.wa_contacts for insert to anon, authenticated with check (public.app_gate());
create policy wa_contacts_update on public.wa_contacts for update to anon, authenticated using (public.app_gate()) with check (public.app_gate());
create policy wa_requests_read   on public.wa_requests for select to anon, authenticated using (public.app_gate());
create policy wa_requests_write  on public.wa_requests for insert to anon, authenticated with check (public.app_gate());
create policy wa_requests_update on public.wa_requests for update to anon, authenticated using (public.app_gate()) with check (public.app_gate());
create policy wa_messages_read   on public.wa_messages for select to anon, authenticated using (public.app_gate());
create policy wa_messages_write  on public.wa_messages for insert to anon, authenticated with check (public.app_gate());

revoke delete, truncate on public.wa_contacts from anon, authenticated;
revoke delete, truncate on public.wa_requests from anon, authenticated;
revoke update, delete, truncate on public.wa_messages from anon, authenticated;
grant usage, select on sequence public.wa_messages_id_seq to anon, authenticated;

notify pgrst, 'reload schema';
