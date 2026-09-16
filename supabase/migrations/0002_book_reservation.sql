-- Atomic booking.
--
-- Pre-empting a fun print and inserting the urgent one that replaces it must
-- happen in a single transaction: the exclusion constraint would otherwise
-- reject the insert while the old row still holds the slot, and a failure
-- half-way through would cancel someone's print for nothing.

create or replace function public.book_reservation(
  p_printer_id    uuid,
  p_user_id       uuid,
  p_title         text,
  p_notes         text,
  p_priority      print_priority,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_justification text,
  p_preempt_ids   uuid[] default '{}'::uuid[]
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
    starts_at, ends_at, justification
  ) values (
    p_printer_id, p_user_id, p_title, nullif(p_notes, ''), p_priority, 'scheduled',
    p_starts_at, p_ends_at, nullif(p_justification, '')
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
    jsonb_build_object('priority', p_priority, 'preempted', coalesce(v_preempted, '{}'::uuid[]))
  );

  return v_new;
end;
$$;

-- The scheduling rules live in the application layer, and this function skips
-- row level security. Only the service role may call it.
revoke all on function public.book_reservation(
  uuid, uuid, text, text, print_priority, timestamptz, timestamptz, text, uuid[]
) from public, anon, authenticated;
