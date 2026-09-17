# MakersRoom PTK — 3D printer queue

A booking app for the workshop's two 3D printers. Members sign in with Google,
pick a slot on a shared weekly calendar, and the app enforces the house rules so
the machines stay busy and no single person can monopolise them.

**Live: https://makers-room-ptk.vercel.app**

- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + Auth) · Vercel
- **Auth:** Google OAuth via Supabase
- **Tests:** Vitest — 67 unit tests covering the scheduling rules
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) — forks and pull requests welcome
- **Licence:** [MIT](LICENSE)

---

## The rules it enforces

| Rule | Behaviour |
| --- | --- |
| **Two printers** | Each booking is tied to one machine. A database exclusion constraint makes double-booking impossible, even under a race. |
| **Print length caps** | Daytime prints max 4h; overnight prints max 14h. |
| **Long prints go overnight** | Anything over 4h must fall at least 70% inside the overnight window (19:00–08:00), keeping the daytime free for quick jobs. |
| **Urgent work beats fun prints** | Bookings are `fun`, `standard` (work) or `urgent`. An urgent job takes over a slot held by a *fun* print, and the owner's email and phone are surfaced so they can be told. Urgent never bumps other work, and never bumps a print that has already started. |
| **Urgent can't be abused** | Urgent bookings need a written reason and are capped at 2 per 28 days. |
| **Heavy users can't hog the calendar** | Usage over the last 28 days sorts members into `new`, `regular` or `heavy`. The main lever is the **booking horizon**: heavy users may only book 5 days ahead, regular 14, new 21. The far side of the calendar therefore stays open for people who print less often. |
| **Volume quotas** | Per tier: a rolling 7-day minutes cap, a limit on simultaneously held bookings, and a cap on daytime slots per week. |
| **Free slots open to everyone** | Within 24h of the start time every quota is waived — if a slot is still empty, anyone can take it. An idle printer helps nobody. |
| **Contact details** | Every member has an email and a phone number on file, shown to signed-in members so a failed or bumped print can be chased up. |

Every number above lives in `policy_settings` and can be tuned without a
redeploy. The defaults are in
[`src/lib/scheduling/policy.ts`](src/lib/scheduling/policy.ts).

---

## How it fits together

```
src/lib/scheduling/    Pure, dependency-free rules engine (fully unit tested)
  types.ts             Domain types
  time.ts              Timezone + overnight-window maths (DST safe)
  policy.ts            Default house rules
  fairness.ts          Usage -> new / regular / heavy tier
  usage.ts             Reservation history -> rolling-window aggregates
  rules.ts             evaluateBooking() - the single source of truth

src/lib/bookings/      Glue between the engine and the database
src/lib/supabase/      Browser / server / service-role clients
src/app/               Routes, pages and API endpoints
supabase/migrations/   SQL schema, RLS policies and the atomic booking function
```

**The rules are enforced on the server.** Members have no `INSERT` or `UPDATE`
rights on `reservations`; every booking goes through `/api/reservations`, which
runs `evaluateBooking` and only then writes using the service role. Calling the
Supabase REST API directly cannot bypass a single rule.

The booking dialog calls `/api/bookings/preview`, which runs the *same* engine,
so what a member sees while picking a time is exactly what gets enforced.

---

## Local setup

### 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run, in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_book_reservation.sql`

   This creates the tables, row level security policies, the two printers, and
   the atomic `book_reservation` function.

### 2. Turn on Google sign-in

1. In Google Cloud Console create an **OAuth 2.0 Client ID** (type: *Web application*).
2. Add this authorised redirect URI — the project ref is in your Supabase URL:

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

3. In Supabase → **Authentication → Providers → Google**, enable it and paste the
   client ID and secret.
4. In Supabase → **Authentication → URL Configuration**, set:
   - **Site URL** → `http://localhost:3000` for local work, your Vercel URL in production
   - **Redirect URLs** → add `http://localhost:3000/**` and `https://<your-app>.vercel.app/**`

### 3. Configure and run

```bash
cp .env.example .env.local   # then fill in the three values
npm install
npm run dev
```

Open <http://localhost:3000>. The first sign-in creates your member profile
automatically; you'll be asked for a phone number before your first booking.

To make yourself an admin:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

---

## Access and moderation

Sign-up is deliberately **open**: anyone who reaches the URL and has a Google
account can join and book. For a small makerspace that beats maintaining an
invite list, and it matches how the room already works.

The lever for abuse is reactive rather than preventative. To suspend someone:

```sql
update public.profiles set is_blocked = true where email = 'them@example.com';
```

A blocked member can still sign in and read the calendar, but every booking is
refused with a clear message. Reverse it by setting the flag back to `false`.

If the workshop outgrows this, the natural next steps are restricting sign-in to
one email domain, or adding an `approved` flag that an admin flips before a
member's first booking.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project** and import the repo. The framework is
   detected automatically; no build settings need changing.
3. Add the three environment variables from `.env.example` to
   **Settings → Environment Variables** (Production, Preview and Development).

   > `SUPABASE_SERVICE_ROLE_KEY` must **not** have the `NEXT_PUBLIC_` prefix —
   > that prefix is what would ship it to the browser.

4. Deploy, then return to Supabase → **Authentication → URL Configuration** and
   add the live Vercel URL to **Site URL** and **Redirect URLs**.

Anyone with the link can reach the app, but they must sign in with Google to see
or book anything. `/rules` is readable without an account.

---

## Contributing

Contributions are welcome — fork the repo, create a branch, and open a pull
request. Full guidance is in [CONTRIBUTING.md](CONTRIBUTING.md).

Worth knowing before you start: **the scheduling rules can be worked on with no
setup at all.** The engine in `src/lib/scheduling/` is pure TypeScript with no
database or React dependency, so `npm install && npm test` is the entire loop
for any change to booking behaviour.

```bash
git clone https://github.com/<your-username>/makers-room-ptk.git
cd makers-room-ptk
npm install
npm test          # no database or config needed
npm run verify    # typecheck + lint + tests, run this before pushing
```

Running the full app additionally needs your own free Supabase project — see
[Local setup](#local-setup) above. Please don't point development at the live
makerspace database.

---

## Commands

```bash
npm run dev        # development server
npm run build      # production build
npm run test       # unit tests
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run verify     # typecheck + lint + test
```

---

## Notes and trade-offs

- **Contact details are visible to all signed-in members.** That is deliberate —
  the brief calls for members to be able to reach each other about prints. If the
  workshop grows, restrict `phone` to admins and to members directly affected by
  a bump.
- **Pre-emption notifies via the UI and the audit log**, not yet by email or SMS.
  Every bump is recorded in `reservation_events` along with the bumped member's
  contact details, so wiring in Resend or Twilio is a small, self-contained
  addition.
- **Timezone** is fixed to `Asia/Jerusalem` in the policy. Overnight and
  prime-time windows are evaluated in that local time and handle DST correctly.
- **`in_progress` status** is set manually or by a future printer integration;
  the rules already refuse to bump a print once it is running.
