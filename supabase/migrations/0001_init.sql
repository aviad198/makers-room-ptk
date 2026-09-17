-- MakersRoom PTK - 3D printer queue
-- Initial schema: members, printers, reservations, policy and audit trail.

-- Keep extensions out of the public schema (database-linter 0014).
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;
-- Backs the exclusion constraint that blocks double-booked slots.
create extension if not exists "btree_gist" with schema extensions;

-- btree_gist's operator classes must be resolvable while the exclusion
-- constraint further down is created.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type print_priority as enum ('urgent', 'standard', 'fun');
create type reservation_status as enum (
  'scheduled', 'in_progress', 'completed', 'cancelled', 'preempted'
);
create type member_role as enum ('member', 'admin');

-- ---------------------------------------------------------------------------
-- Profiles: one row per authenticated member.
-- Phone and email are how we reach someone when a print fails or is bumped.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  phone       text,
  avatar_url  text,
  role        member_role not null default 'member',
  is_blocked  boolean not null default false,
  -- Stable colour index so each member keeps one colour on the calendar.
  color_index smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_phone_format check (
    phone is null or phone ~ '^\+?[0-9 ()\-]{7,20}$'
  )
);

comment on table public.profiles is
  'Makerspace members. Contact details are visible to signed-in members so a failed or bumped print can be chased up.';

-- ---------------------------------------------------------------------------
-- Printers: the shop currently runs two machines.
-- ---------------------------------------------------------------------------
create table public.printers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  model       text,
  notes       text,
  is_active   boolean not null default true,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------
create table public.reservations (
  id             uuid primary key default gen_random_uuid(),
  printer_id     uuid not null references public.printers (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  title          text not null,
  notes          text,
  priority       print_priority not null default 'fun',
  status         reservation_status not null default 'scheduled',
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  -- Set when an urgent job bumps this booking.
  justification  text,
  preempted_by   uuid references public.reservations (id) on delete set null,
  preempted_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint reservations_time_order check (ends_at > starts_at)
);

-- Hard guarantee against two people holding the same machine at the same time.
-- Only live bookings participate; cancelled/preempted rows free their slot.
alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (
    printer_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('scheduled', 'in_progress'));

create index reservations_window_idx on public.reservations (starts_at, ends_at);
create index reservations_user_idx on public.reservations (user_id, starts_at desc);
create index reservations_printer_idx on public.reservations (printer_id, starts_at);

-- ---------------------------------------------------------------------------
-- Audit trail: who got bumped, who was notified.
-- ---------------------------------------------------------------------------
create table public.reservation_events (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  actor_id       uuid references public.profiles (id) on delete set null,
  event_type     text not null,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index reservation_events_reservation_idx
  on public.reservation_events (reservation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Tunable house rules (single row). Mirrors SchedulingPolicy in TypeScript.
-- ---------------------------------------------------------------------------
create table public.policy_settings (
  id          boolean primary key default true,
  policy      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  constraint policy_settings_singleton check (id)
);

insert into public.policy_settings (id, policy) values (true, '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
-- Pinned so a caller's search_path cannot influence the function.
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger reservations_touch_updated_at
  before update on public.reservations
  for each row execute function public.touch_updated_at();

-- Create a profile automatically the first time someone signs in with Google.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_color smallint;
begin
  select coalesce(max(color_index) + 1, 0) % 12 into next_color from public.profiles;

  insert into public.profiles (id, email, full_name, avatar_url, phone, color_index)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    next_color
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- SECURITY DEFINER functions in `public` are exposed by PostgREST at
-- /rest/v1/rpc/<name>. Only the trigger above should invoke this one, and the
-- trigger runs as the table owner, so these revokes do not affect it.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Reads are open to signed-in members: the calendar is shared and contact
-- details exist precisely so members can reach each other.
--
-- Writes to reservations are deliberately NOT granted to `authenticated`.
-- Every booking must go through the server, which runs the scheduling rules
-- (duration caps, overnight rule, fairness quotas, pre-emption) before it
-- touches the table using the service role. This stops anyone from bypassing
-- the rules by calling the REST API directly.
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.printers            enable row level security;
alter table public.reservations        enable row level security;
alter table public.reservation_events  enable row level security;
alter table public.policy_settings     enable row level security;

create policy "members read profiles"
  on public.profiles for select
  to authenticated using (true);

create policy "members update own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "members read printers"
  on public.printers for select
  to authenticated using (true);

create policy "members read reservations"
  on public.reservations for select
  to authenticated using (true);

create policy "members read reservation events"
  on public.reservation_events for select
  to authenticated using (true);

create policy "members read policy"
  on public.policy_settings for select
  to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Seed the two machines currently on the floor.
-- ---------------------------------------------------------------------------
insert into public.printers (name, model, sort_order, notes) values
  ('X1C',  'Bambu Lab X1 Carbon', 0, 'Fast, enclosed, AMS available.'),
  ('CR10', 'Creality CR-10',      1, 'Large bed, best for tall single-colour parts.')
on conflict (name) do nothing;
