-- Import members and bookings from the previous Base44 app.
--
-- The problem: profiles.id is a foreign key to auth.users, so a profile cannot
-- exist until its owner has signed in with Google. That makes it impossible to
-- carry over 58 members and their history ahead of time.
--
-- The approach: let a profile exist unclaimed, then hand it to the real auth
-- user the first time they sign in. The claim swaps profiles.id to the new
-- auth.users id and every dependent row follows via ON UPDATE CASCADE, so the
-- invariant the whole application relies on -- profiles.id = auth.uid() --
-- still holds. No row is ever written to auth.users by us, so Google sign-in
-- behaves exactly as it does today.
--
-- This matters because 9 of the 58 addresses are @intel.com, which is not a
-- Google Workspace domain: pre-creating auth users for them would have been
-- both useless and risky.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. A profile no longer requires an auth user
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  alter column id set default gen_random_uuid();

alter table public.profiles
  add column if not exists claimed_at timestamptz,
  add column if not exists legacy_source text;

comment on column public.profiles.claimed_at is
  'When the member first signed in and took ownership of this profile. Null means imported but never signed in.';
comment on column public.profiles.legacy_source is
  'Where an imported profile came from, e.g. base44.';

-- Everyone already in the table got here by signing in, so mark them claimed.
update public.profiles set claimed_at = created_at where claimed_at is null;

-- One profile per address, so a claim can never match two rows.
create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- 2. Dependents follow the id when a profile is claimed
-- ---------------------------------------------------------------------------
alter table public.reservations
  drop constraint if exists reservations_user_id_fkey;
alter table public.reservations
  add constraint reservations_user_id_fkey
  foreign key (user_id) references public.profiles (id)
  on update cascade on delete cascade;

alter table public.reservation_events
  drop constraint if exists reservation_events_actor_id_fkey;
alter table public.reservation_events
  add constraint reservation_events_actor_id_fkey
  foreign key (actor_id) references public.profiles (id)
  on update cascade on delete set null;

alter table public.policy_settings
  drop constraint if exists policy_settings_updated_by_fkey;
alter table public.policy_settings
  add constraint policy_settings_updated_by_fkey
  foreign key (updated_by) references public.profiles (id)
  on update cascade on delete set null;

-- Added by a later migration; cascade it too if it is already present.
do $$
begin
  if to_regclass('public.reservation_participants') is not null then
    alter table public.reservation_participants
      drop constraint if exists reservation_participants_user_id_fkey;
    alter table public.reservation_participants
      add constraint reservation_participants_user_id_fkey
      foreign key (user_id) references public.profiles (id)
      on update cascade on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. First sign-in claims a matching imported profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed   uuid;
  next_color  smallint;
begin
  -- Take over an imported profile for this address, if one is waiting.
  -- Changing the id re-points their whole booking history at the new auth
  -- user through the cascading foreign keys above.
  update public.profiles
     set id         = new.id,
         claimed_at = now(),
         email      = new.email,
         full_name  = coalesce(full_name, nullif(new.raw_user_meta_data ->> 'full_name', '')),
         avatar_url = coalesce(nullif(new.raw_user_meta_data ->> 'avatar_url', ''), avatar_url),
         phone      = coalesce(phone, nullif(new.raw_user_meta_data ->> 'phone', ''))
   where lower(email) = lower(new.email)
     and claimed_at is null
  returning id into v_claimed;

  if v_claimed is not null then
    return new;
  end if;

  select coalesce(max(color_index) + 1, 0) % 12 into next_color from public.profiles;

  insert into public.profiles (
    id, email, full_name, avatar_url, phone, color_index, claimed_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    next_color,
    now()
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Provenance for imported bookings
-- ---------------------------------------------------------------------------
-- Keeps the link back to the row each booking came from, and makes the import
-- repeatable: re-running it inserts nothing new. A plain unique index is used
-- rather than a partial one because ON CONFLICT cannot infer a partial index;
-- Postgres still allows any number of NULLs, so app-created bookings are
-- unaffected.
alter table public.reservations
  add column if not exists legacy_id text;

comment on column public.reservations.legacy_id is
  'Row id from the old Base44 app. Makes the import repeatable and traceable.';

create unique index if not exists reservations_legacy_id_idx
  on public.reservations (legacy_id);
