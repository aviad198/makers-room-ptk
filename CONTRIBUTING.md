# Contributing to MakersRoom PTK

Thanks for helping out. This is the booking system for the workshop's 3D
printers, so a bug here means somebody's print doesn't happen — the guidance
below is aimed at keeping that rare.

## Quick start

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/makers-room-ptk.git
cd makers-room-ptk
npm install

# 2. Run the tests - these need no database and no configuration
npm test
```

**You can contribute to the scheduling rules without setting anything up.**
The rules engine in [`src/lib/scheduling/`](src/lib/scheduling) is pure
TypeScript with no database or React imports, and it is covered by unit tests
that run offline. If your change is to booking behaviour, `npm test` is the
full feedback loop.

To run the actual app you need your own free Supabase project — see
[README.md](README.md#local-setup). Never point development at the live
makerspace database.

## The workflow

1. **Open an issue first** for anything beyond a small fix, so we can agree on
   the approach before you spend time on it.
2. **Branch** off `main` with a descriptive name: `fix/overnight-dst-edge`,
   `feat/email-notifications`.
3. **Commit** in logical steps. Explain *why* in the body, not just *what*:

   ```
   Reject long prints that only clip the overnight window

   A 14h print starting at 07:00 was passing because it touched both the
   morning and evening windows, even though 79% of it ran during the day
   and blocked the printer.
   ```

4. **Verify before you push:**

   ```bash
   npm run verify   # typecheck + lint + tests
   ```

5. **Open a pull request** against `main`, describing what changed and how you
   tested it. Screenshots are welcome for UI work.

## Changing a booking rule

This is the part that needs the most care.

All booking rules live in
[`src/lib/scheduling/rules.ts`](src/lib/scheduling/rules.ts), and the tunable
numbers in [`src/lib/scheduling/policy.ts`](src/lib/scheduling/policy.ts).

- **Adjusting a limit** (print lengths, quotas, the booking horizon) usually
  means editing `DEFAULT_POLICY` only. These values are also stored in the
  `policy_settings` table, so an admin can change them without a deploy.
- **Adding or changing a rule** means editing `evaluateBooking`. Every rule
  returns a `RuleViolation` with a stable `code` and a message written for a
  member, not a developer. Compare:

  ```
  ✅ "Prints longer than 4h must run overnight (at least 70% between
      19:00 and 8:00). This slot is only 21% overnight."
  ❌ "Validation failed: OVERNIGHT_RATIO_BELOW_THRESHOLD"
  ```

**Every rule change needs a test**, including the case that should now be
*rejected*. Add it to
[`src/lib/scheduling/__tests__/rules.test.ts`](src/lib/scheduling/__tests__/rules.test.ts)
and follow the existing naming style ("bumps a fun print", "stops a heavy user
from booking far into the future").

Watch out for two things that have bitten us already:

- **Timezones.** Overnight and prime-time windows are wall-clock questions in
  `Asia/Jerusalem`. Use the helpers in
  [`src/lib/scheduling/time.ts`](src/lib/scheduling/time.ts) rather than
  `Date.getHours()`, which uses the *server's* timezone. There are DST tests
  for a reason.
- **Rules are enforced on the server.** Members hold no write grants on
  `reservations`; bookings go through `/api/reservations`, which runs the
  engine and then writes with the service role. A check added only in the
  React dialog is not enforced — it can be bypassed by calling the API
  directly.

## Database changes

Migrations live in [`supabase/migrations/`](supabase/migrations) and run in
filename order. Add a new numbered file rather than editing an applied one, so
existing databases can catch up:

```
supabase/migrations/0004_add_something.sql
```

If you change a table, update the types in
[`src/lib/supabase/types.ts`](src/lib/supabase/types.ts) to match. They are
hand-written in the same shape `supabase gen types` produces — if the shape
drifts, supabase-js quietly degrades every query result to `never` and the
build fails in confusing ways.

After applying a migration, run the Supabase database linter (Advisors tab in
the dashboard) and fix what it flags. It has already caught a real issue in
this project: a `SECURITY DEFINER` function that was exposed to anonymous
callers over the REST API.

## Style

- TypeScript, no `any`. Run `npm run typecheck`.
- Comment the *why* when something is non-obvious; skip comments that restate
  the code.
- Keep the rules engine free of React and database imports — that separation is
  what makes it testable.
- Follow the existing formatting; `npm run lint` is the arbiter.

## Reporting bugs

Please include:

- What you booked, or tried to book (printer, times, print type)
- What you expected and what actually happened
- The exact message the app showed

A scheduling bug is much easier to fix when we can turn it into a failing test,
and the times involved are usually the key detail.
