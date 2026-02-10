-- Schedule daily snapshot of item values at midnight UTC (0 0 * * *).
-- Requires: pg_cron and pg_net extensions enabled (Dashboard → Database → Extensions).
--
-- Before running this migration, create Vault secrets (Dashboard → SQL Editor):
--   1. Project URL (required):
--      SELECT vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
--   2. If you set SNAPSHOT_CRON_SECRET on the Edge Function (optional):
--      SELECT vault.create_secret('your-cron-secret', 'snapshot_cron_secret');
--
-- Then run this migration (or paste it in SQL Editor). The cron job will POST to
-- your snapshot-item-values Edge Function every day at 00:00 UTC.

SELECT cron.schedule(
  'snapshot-item-values-daily',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/snapshot-item-values',
    headers := jsonb_build_object('Content-Type', 'application/json') || COALESCE(
      (SELECT jsonb_build_object('x-cron-secret', decrypted_secret) FROM vault.decrypted_secrets WHERE name = 'snapshot_cron_secret' LIMIT 1),
      '{}'::jsonb
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);
