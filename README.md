# Invest-O-Center

Track all of your investments in one place — stocks, crypto, collectibles, real estate, and more.

## What it does

- **Dashboard** — See total net worth at a glance, profit/loss over 30 days or all time, and a net-worth-over-time sparkline. Pin favorite categories and jump to top categories by value.
- **Categories & items** — Organize holdings by category (e.g. Stocks, Crypto, Vinyl). Add items with quantity and optional API-backed or manual prices. Supported providers include Alpha Vantage (stocks), CoinGecko (crypto), RentCast (real estate), Discogs, and others.
- **Value history** — Automatic snapshots of item values feed line charts so you can view performance by item, by category, or as total net worth.
- **CSV import** — Bulk-import items from a CSV (e.g. ticker + quantity) with template-based mapping.
- **Duplicates** — The app highlights potential duplicates and lets you merge them (keep oldest, sum quantity).
- **Auth** — Sign in and sign up via Supabase; your data is scoped to your account.

Built with **Vue 3**, **Tailwind CSS**, and **Supabase**.

## Setup

See **[SETUP.md](SETUP.md)** for Supabase project setup, env vars, and running the app locally.

## Scripts

| Command        | Description              |
|----------------|--------------------------|
| `npm run dev`  | Start dev server         |
| `npm run build`| Production build         |
| `npm run test` | Run Vitest unit tests    |
