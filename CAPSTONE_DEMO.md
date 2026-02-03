# Capstone Demo (Fake Data)

This branch seeds a full set of **fake** calls, report cards, analytics, disputes, and coaching
sessions for demos and documentation. No Five9 access required.

## Quick Start

1. Start Supabase and reset the DB to load seeds:
   - `npx supabase start`
   - `npx supabase db reset`
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_ANON_KEY` from the Supabase output.
3. Run the app with `npm run dev`.

## Demo Logins

All demo accounts use password `password123`.

- `admin.ally@tlc.test` (admin)
- `manager.mary@tlc.test` (manager)
- `care.cara@tlc.test` (agent)
- `retention.rachel@tlc.test` (agent)
- `jake.hart@tlc.test` (agent with seeded analytics/report cards)

## Notes

- All demo data is generated in `supabase/seeds/02-demo-mock-data.sql`.
- The data is **fake** and safe for screenshots, presentations, and docs.
