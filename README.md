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

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - run ESLint
