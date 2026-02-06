# Invest-O-Center — Get started

## 1. Supabase (do this first)

1. **Create a project** at [supabase.com/dashboard](https://supabase.com/dashboard).
2. In the project, open **SQL Editor** and run the migration:
   - Copy the contents of `supabase/migrations/00001_initial_schema.sql`
   - Paste and run it.
3. In **Project Settings → API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Publishable** key (`sb_publishable_...`) → `VITE_SUPABASE_PUBLISHABLE_KEY`. Never use the **service_role** key in the frontend.

## 2. App env

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Edit `.env.local` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

## 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). You should see the home page; the "Sign in" button will open the auth modal once that’s wired up.

## Checking your data in Supabase

- **Categories:** Supabase Dashboard → **Table Editor** → select the **categories** table. You’ll see one row per category; `user_id` is the owner. Filter by your user id if needed.
- **Profile:** After signup, a row is created in **profiles** (trigger). Check the **profiles** table in Table Editor.
