# Invest-O-Center — Get started

## 1. Supabase (do this first)

1. **Create a project** at [supabase.com/dashboard](https://supabase.com/dashboard).
2. In the project, open **SQL Editor** and run the migrations in order (run any you haven’t applied yet):
   - `supabase/migrations/00001_initial_schema.sql`
   - `supabase/migrations/00002_item_value_history_insert_policy.sql`
   - `supabase/migrations/00003_user_favorites.sql`
   - `supabase/migrations/00004_schedule_snapshot_cron.sql` (optional; needs pg_cron, pg_net, and Vault secrets — see “Value history and the daily snapshot” below)
   - `supabase/migrations/00005_item_value_history_rpc.sql` (efficient history fetch for many items)
   - `supabase/migrations/00006_profiles_plan.sql` (free/paid plan; new users default to free)
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

## 2b. Edge Function secrets (your API keys for the app)

Supabase has one **Secrets** area for all Edge Functions (e.g. **Project Settings → Edge Functions → Secrets**). Add your provider API keys there; **refresh-item-price** uses them for all users when they click “Refresh” on an item.

**Important:** After adding a new API key (or after any change to the refresh function code), you must **deploy** the function or the live app won’t use it:  
`supabase functions deploy refresh-item-price`

**To enable price refresh:**

1. **Stocks:** Add **ALPHA_VANTAGE_API_KEY** (get one at [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key)).
2. **Crypto:** Add **COINGECKO_API_KEY** (get a Demo key at [coingecko.com/api/dashboard](https://www.coingecko.com/api/dashboard)).
3. **CDs & records:** Add **DISCOGS_TOKEN** (Personal Access Token from [discogs.com/settings/developers](https://www.discogs.com/settings/developers); 60 requests/min).
4. **Precious metals:** Add **GOLDAPI_API_KEY** (free at [goldapi.io](https://www.goldapi.io); Gold, Silver, Platinum, Palladium; 100 requests/month).
5. **Trading cards:** Add **JUSTTCG_API_KEY** (get one at [justtcg.com](https://justtcg.com) → Dashboard; raw/ungraded card prices only, no graded slabs).
6. **Real estate:** Add **RENTCAST_API_KEY** (get one at [app.rentcast.io/app/api](https://app.rentcast.io/app/api); 50 free calls/month).

**Optional — per-user keys:** If you also add **ENCRYPTION_KEY** (32 bytes as 64 hex chars, e.g. `openssl rand -hex 32`) and **SUPABASE_SERVICE_ROLE_KEY**, users can add their own keys in **Account → API keys**. When a user has a key saved for a provider, that overrides your app-level key for them.

The **discogs-search** function powers search-by-name when adding or editing CDs & records items (same **DISCOGS_TOKEN**). Deploy it with `supabase functions deploy discogs-search`.

The **justtcg-search** function powers search-by-card-name when adding or editing Trading Cards items (same **JUSTTCG_API_KEY**). Deploy it with `supabase functions deploy justtcg-search`.

**If you get 401 "Invalid JWT"** when the app calls an Edge Function (e.g. save-api-key, refresh-item-price, discogs-search): the Supabase gateway validates JWTs by default and can reject the request before it reaches the function. This repo sets `verify_jwt = false` in `supabase/config.toml` for those functions so the request reaches the code; the function then passes the token to PostgREST, which validates it. After changing `config.toml`, redeploy the function (`supabase functions deploy <name>`).

## 3. Install and run

```bash
npm install
npm run dev
```

**Tests:** `npm run test` runs the frontend unit tests (Vitest).

Open [http://localhost:5173](http://localhost:5173). You should see the home page; the "Sign in" button will open the auth modal once that’s wired up.

## Checking your data in Supabase

- **Categories:** Supabase Dashboard → **Table Editor** → select the **categories** table. You’ll see one row per category; `user_id` is the owner. Filter by your user id if needed.
- **Profile:** After signup, a row is created in **profiles** (trigger). Check the **profiles** table in Table Editor.

## Value history and the daily snapshot

**How history gets into `item_value_history`:**
- **Stocks (Alpha Vantage):** When you click “Refresh” on an item, the app calls the `refresh-item-price` Edge Function, which updates the price and inserts one row into `item_value_history`. So stocks can have history even if the cron never runs.
- **Real estate (RentCast):** Same flow for Real Estate category items with an address; uses the RentCast AVM value endpoint (per-user API key, 50 free calls/month at rentcast.io/app/api).
- **Everything else (CDs, manual items, etc.):** Only the **daily snapshot** does this. The `snapshot-item-values` Edge Function runs once per day (you must schedule it) and inserts the current `unit_value` for every item that has a non-null `unit_value`. If the cron has never run, only items you’ve refreshed (e.g. stocks) will have history.

**If you only see stocks in history:** Either the cron hasn’t run yet, or your CD (and other) items don’t have `unit_value` set. In **Table Editor → items**, check that those rows have `unit_value` filled in.

**1. Check if the cron ran**
- Supabase Dashboard → **Edge Functions** → `snapshot-item-values` → **Logs**. Look for recent invocations and the response (e.g. `{ ok: true, count: N }`). If there are no logs, the function hasn’t been called.

**2. Run the snapshot manually (test)**
- You need the function URL and (if you set it) the cron secret.
- Function URL: `https://<project-ref>.supabase.co/functions/v1/snapshot-item-values`
- If you set `SNAPSHOT_CRON_SECRET` in Edge Function secrets, send it in a header:
  ```bash
  curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/snapshot-item-values" \
    -H "x-cron-secret: YOUR_SNAPSHOT_CRON_SECRET"
  ```
- If you didn’t set a secret, you can call without the header. Check the Logs tab after; you should see `ok: true` and a `count` of inserted rows.

**3. Why “0 0 * * *” gives no logs**
- The schedule (`0 0 * * *` = midnight UTC) only tells the job **when** to run. The job body must **actually call** the Edge Function with an HTTP POST. If you created the cron in the Dashboard and only set the schedule (or chose “SQL” with no `net.http_post`), nothing hits the function, so there are no Edge Function logs.

**4. Schedule the snapshot correctly (pg_cron + pg_net)**
- Enable **pg_cron** and **pg_net** in Dashboard → **Database** → **Extensions**.
- Create Vault secrets in **SQL Editor** (run once):
  ```sql
  SELECT vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
  -- If you set SNAPSHOT_CRON_SECRET on the Edge Function:
  SELECT vault.create_secret('your-cron-secret', 'snapshot_cron_secret');
  ```
- Run the migration that schedules the HTTP call: in **SQL Editor**, run the contents of `supabase/migrations/00004_schedule_snapshot_cron.sql`. That job runs at midnight UTC and POSTs to your `snapshot-item-values` function.
- After that, **Cron** → **Jobs** → **History** for `snapshot-item-values-daily` will show runs, and **Edge Functions** → `snapshot-item-values` → **Logs** will show invocations.
- **Alternative:** Use an external cron (e.g. Vercel Cron, GitHub Actions) to `POST` the function URL daily with the `x-cron-secret` header if you use it.
