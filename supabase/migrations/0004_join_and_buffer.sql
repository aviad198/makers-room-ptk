-- Shared print sessions ("join me") and a cleaning gap between bookings.
--
-- 1. A booking may be opened up so other members can join the same session.
--    Joining never creates a reservation of its own, so it costs the joiner
--    nothing against their working-week or monthly quota.
-- 2. Consecutive bookings on a machine must leave a 5-minute gap for clearing
--    the bed and preparing the next print.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Join me
-- ---------------------------------------------------------------------------
alter table public.reservations
  add column if not exists allows_joiners boolean not null default false;

comment on column public.reservations.allows_joiners is
  'Owner is happy for other members to join this print session.';

create table if not exists public.reservation_participants (
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (reservation_id, user_id)
);

comment on table public.reservation_participants is
  'Members who joined someone else''s print session. Joining does not consume any quota.';

create index if not exists reservation_participants_user_idx
  on public.reservation_participants (user_id, created_at desc);

alter table public.reservation_participants enable row level security;

-- Readable by every member so the calendar can show who is on a session.
-- Writes go through the server (service role), like reservations themselves.
create policy "members read participants"
  on public.reservation_participants for select
  to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. Cleaning gap between bookings
-- ---------------------------------------------------------------------------
-- Padding the end of each live booking by 5 minutes makes the database reject
-- anything that starts less than 5 minutes after the previous print finishes,
-- in either direction. This is the hard backstop; the application layer uses
-- policy.bufferMinutes, which may be set higher but never lower.
--
-- The padding lives in an IMMUTABLE helper because an index expression may not
-- call `timestamptz + interval` directly: that operator is only STABLE, since
-- month/day components of an interval depend on the session timezone. A fixed
-- 5-minute interval has no such components, so the result really is immutable.
create or replace function public.reservation_block(
  p_starts_at timestamptz,
  p_ends_at   timestamptz
)
returns tstzrange
language sql
immutable
parallel safe
set search_path = ''
as $$
  select tstzrange(p_starts_at, p_ends_at + interval '5 minutes');
$$;

comment on function public.reservation_block(timestamptz, timestamptz) is
  'A booking''s footprint on a machine: its slot plus the 5-minute cleaning gap.';

alter table public.reservations
  drop constraint if exists reservations_no_overlap;

-- Existing bookings made under the old rules may sit exactly back-to-back.
-- Give the earlier print of each such pair a 5-minute haircut so the gap rule
-- can be enforced, and leave a trace of it in the audit trail.
with tight as (
  select a.id,
         min(b.starts_at) - interval '5 minutes' as new_ends_at,
         a.ends_at as old_ends_at
    from public.reservations a
    join public.reservations b
      on b.printer_id = a.printer_id
     and b.id <> a.id
     and b.status in ('scheduled', 'in_progress')
     and b.starts_at >= a.ends_at
     and b.starts_at < a.ends_at + interval '5 minutes'
   where a.status in ('scheduled', 'in_progress')
   group by a.id, a.ends_at
), trimmed as (
  update public.reservations r
     set ends_at = tight.new_ends_at
    from tight
   where r.id = tight.id
     and tight.new_ends_at > r.starts_at
  returning r.id, tight.old_ends_at, tight.new_ends_at
)
insert into public.reservation_events (reservation_id, actor_id, event_type, payload)
select id,
       null,
       'shortened',
       jsonb_build_object(
         'reason', 'cleaning gap between prints',
         'old_ends_at', old_ends_at,
         'new_ends_at', new_ends_at
       )
  from trimmed;

alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (
    printer_id with =,
    public.reservation_block(starts_at, ends_at) with &&
  ) where (status in ('scheduled', 'in_progress'));

-- ---------------------------------------------------------------------------
-- 3. Booking function learns about the join flag
-- ---------------------------------------------------------------------------
drop function if exists public.book_reservation(
  uuid, uuid, text, text, print_priority, timestamptz, timestamptz, text, uuid[]
);

create or replace function public.book_reservation(
  p_printer_id     uuid,
  p_user_id        uuid,
  p_title          text,
  p_notes          text,
  p_priority       print_priority,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz,
  p_justification  text,
  p_preempt_ids    uuid[] default '{}'::uuid[],
  p_allows_joiners boolean default false
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new       public.reservations;
  v_preempted uuid[];
begin
  -- Serialise concurrent bookings for the same machine.
  perform 1 from public.printers where id = p_printer_id for update;

  -- Free the slots we were told to take over, but only those still live.
  if p_preempt_ids is not null and array_length(p_preempt_ids, 1) > 0 then
    with bumped as (
      update public.reservations
         set status       = 'preempted',
             preempted_at = now()
       where id = any (p_preempt_ids)
         and status = 'scheduled'
      returning id
    )
    select array_agg(id) into v_preempted from bumped;

    -- A row we planned to bump already started or vanished: abort rather than
    -- silently double-book the printer.
    if coalesce(array_length(v_preempted, 1), 0)
       <> coalesce(array_length(p_preempt_ids, 1), 0) then
      raise exception 'preemption_conflict'
        using hint = 'A print that was going to be bumped changed state. Retry.';
    end if;
  end if;

  insert into public.reservations (
    printer_id, user_id, title, notes, priority, status,
    starts_at, ends_at, justification, allows_joiners
  ) values (
    p_printer_id, p_user_id, p_title, nullif(p_notes, ''), p_priority, 'scheduled',
    p_starts_at, p_ends_at, nullif(p_justification, ''), coalesce(p_allows_joiners, false)
  )
  returning * into v_new;

  if v_preempted is not null then
    update public.reservations
       set preempted_by = v_new.id
     where id = any (v_preempted);

    insert into public.reservation_events (reservation_id, actor_id, event_type, payload)
    select id,
           p_user_id,
           'preempted',
           jsonb_build_object(
             'by_reservation', v_new.id,
             'by_title', p_title,
             'reason', coalesce(nullif(p_justification, ''), 'Urgent work job')
           )
      from public.reservations
     where id = any (v_preempted);
  end if;

  insert into public.reservation_events (reservation_id, actor_id, event_type, payload)
  values (
    v_new.id,
    p_user_id,
    'created',
    jsonb_build_object(
      'priority', p_priority,
      'preempted', coalesce(v_preempted, '{}'::uuid[]),
      'allows_joiners', coalesce(p_allows_joiners, false)
    )
  );

  return v_new;
end;
$$;

-- Same lock-down as before: only the server may book.
revoke all on function public.book_reservation(
  uuid, uuid, text, text, print_priority, timestamptz, timestamptz, text, uuid[], boolean
) from public, anon, authenticated;

grant execute on function public.book_reservation(
  uuid, uuid, text, text, print_priority, timestamptz, timestamptz, text, uuid[], boolean
) to service_role;
