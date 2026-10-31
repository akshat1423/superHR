-- superjoin: persistent agent logs.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query), using the output of
--   npm run db:sql
-- which fills in the app-key placeholder from SUPABASE_APP_KEY in .env.local. Safe to re-run.
--
-- Security model: the publishable (anon) key ships in the browser bundle, so it must NOT be able to read or
-- write these tables on its own. Every policy therefore also requires the request to carry the server-only
-- secret in the `x-superjoin-key` header; only superjoin's route handlers know it. The tables are append-only:
-- no UPDATE / DELETE policy exists, so logs cannot be edited or erased through the API.

create or replace function public.app_gate() returns boolean
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-superjoin-key',
    ''
  ) = '__APP_KEY__'
$$;

create table if not exists public.agent_batches (
  id          text primary key,
  started_at  timestamptz not null default now(),
  started_by  text not null,
  label       text not null default '',
  people      integer not null default 0
);

create table if not exists public.agent_events (
  id           bigint generated always as identity primary key,
  batch_id     text not null references public.agent_batches (id),
  seq          integer not null,
  tick         integer not null,
  occurred_at  timestamptz not null default now(),
  person_id    text not null,
  person_name  text not null,
  dept         text not null,
  manager      text not null,
  service      text not null,
  kind         text not null check (kind in ('info', 'ok', 'warn', 'error')),
  message      text not null,
  call         text,
  trace_id     text,
  ms           integer,
  meta         jsonb,
  unique (batch_id, seq)
);

create index if not exists agent_events_batch_seq on public.agent_events (batch_id, seq desc);
create index if not exists agent_events_dept      on public.agent_events (dept);
create index if not exists agent_events_service   on public.agent_events (service);
create index if not exists agent_events_kind      on public.agent_events (kind);
create index if not exists agent_events_trace     on public.agent_events (trace_id);

alter table public.agent_batches enable row level security;
alter table public.agent_events  enable row level security;

drop policy if exists agent_batches_read  on public.agent_batches;
drop policy if exists agent_batches_write on public.agent_batches;
drop policy if exists agent_events_read   on public.agent_events;
drop policy if exists agent_events_write  on public.agent_events;

create policy agent_batches_read  on public.agent_batches for select to anon, authenticated using (public.app_gate());
create policy agent_batches_write on public.agent_batches for insert to anon, authenticated with check (public.app_gate());
create policy agent_events_read   on public.agent_events  for select to anon, authenticated using (public.app_gate());
create policy agent_events_write  on public.agent_events  for insert to anon, authenticated with check (public.app_gate());

-- append-only, belt and braces (policies already deny these)
revoke update, delete, truncate on public.agent_batches from anon, authenticated;
revoke update, delete, truncate on public.agent_events  from anon, authenticated;
grant usage, select on sequence public.agent_events_id_seq to anon, authenticated;

-- make PostgREST notice the new tables immediately
notify pgrst, 'reload schema';
