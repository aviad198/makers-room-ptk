## What does this change?

<!-- A short description, and the issue it closes if there is one. -->

Closes #

## How did you test it?

<!--
For booking-rule changes, name the tests you added.
For UI changes, a screenshot helps.
-->

## Checklist

- [ ] `npm run verify` passes (typecheck, lint, tests)
- [ ] Booking-rule changes have tests covering both the accepted **and** the
      rejected case
- [ ] Any new member-facing message reads as plain English, not an error code
- [ ] Database changes add a new numbered migration and update
      `src/lib/supabase/types.ts`
- [ ] No secrets, keys, or `.env` files are committed
