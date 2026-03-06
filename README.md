# Budget Calendar

A Next.js app for planning monthly cash flow on a calendar:
- Fixed bi-weekly paycheck schedule
- Optional commission overrides per paycheck date
- One-time and monthly recurring income/expense entries
- Running day-by-day balance and monthly income/expense/net summary

## Tech Stack

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS v4
- Supabase (`@supabase/supabase-js`) for data storage

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Supabase Tables

### `expenses`

Used for both expenses and non-paycheck income entries.

- `id` (uuid, primary key, default generated)
- `day` (int, 1-31)
- `name` (text)
- `amount` (numeric)
- `recurring` (text: `none` or `monthly`)
- `type` (text: `expense` or `income`)
- `month` (int, JS month index 0-11)
- `year` (int, four-digit year)

### `paychecks`

Commission overrides keyed by specific paycheck dates.

- `id` (uuid, primary key, default generated)
- `date` (date or text in `YYYY-MM-DD`)
- `commission_amount` (numeric)

### `starting_balances`

Stores the monthly starting balance used for reconciliation.

- `id` (uuid, primary key, default generated)
- `month` (int, JS month index 0-11)
- `year` (int, four-digit year)
- `amount` (numeric)

## App Behavior Notes

- Base pay and paycheck interval are currently hard-coded in `components/calendar.tsx`.
- Starting balance is persisted in `starting_balances` and falls back to a default if no row exists.
- Data is fetched client-side directly from Supabase.
- Admin-only payroll settings panel is shown when the signed-in email matches `NEXT_PUBLIC_ADMIN_EMAILS` (comma-separated).
- Mobile-friendly quick entry page: `/mobile-entry` (saves non-recurring expense rows with name `Wife Purchases`).

## Monthly CSV Import

Use the `Import Month CSV` button on the calendar page to bulk import monthly transactions.
You can upload either:

- a clean `.csv` file, or
- the raw `.txt` bank statement export (Santander-style statement text)

Required CSV columns:

- `day`
- `name`
- `amount`
- `recurring` (`none` or `monthly`)
- `type` (`expense` or `income`)
- `month` (0-11)
- `year` (4-digit year)

Import options include:

- `Use current viewed month/year` (recommended for monthly reconciliation)
- `Skip payroll rows` (recommended if paychecks are auto-generated in app)
- `Include duplicates` (off by default to avoid accidental double imports)

## Daily Email Due Reports

This app includes a scheduled endpoint at `/api/notifications/daily` for daily due-payment emails.

### Environment Variables

Set these in Vercel:

- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `NOTIFICATION_EMAIL_FROM` (for example `Budget Calendar <no-reply@yourdomain.com>`)

`NEXT_PUBLIC_SUPABASE_URL` must already be set.

### Notification Settings Table

Run this in Supabase SQL Editor:

```sql
create table if not exists notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) default auth.uid(),
  email text not null,
  timezone text not null default 'America/New_York',
  enabled boolean not null default true,
  created_at timestamptz default now()
);

create unique index if not exists notification_settings_user_unique
on notification_settings (user_id);

alter table notification_settings enable row level security;

drop policy if exists "notification_settings_select_own" on notification_settings;
drop policy if exists "notification_settings_insert_own" on notification_settings;
drop policy if exists "notification_settings_update_own" on notification_settings;
drop policy if exists "notification_settings_delete_own" on notification_settings;

create policy "notification_settings_select_own"
on notification_settings for select
using (auth.uid() = user_id);

create policy "notification_settings_insert_own"
on notification_settings for insert
with check (auth.uid() = user_id);

create policy "notification_settings_update_own"
on notification_settings for update
using (auth.uid() = user_id);

create policy "notification_settings_delete_own"
on notification_settings for delete
using (auth.uid() = user_id);
```

Insert your initial setting:

```sql
insert into notification_settings (user_id, email, timezone, enabled)
values ('YOUR_USER_ID', 'you@example.com', 'America/New_York', true)
on conflict (user_id) do update
set email = excluded.email,
    timezone = excluded.timezone,
    enabled = excluded.enabled;
```

### Manual Test

After deployment, test the route manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_APP_URL/api/notifications/daily
```

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - run ESLint
