-- Free vs paid tier: plan controls whether user can use app-level API keys.
-- Only 'free' or 'paid'. New signups default to 'free'; existing users backfilled to 'paid'.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'paid'));

-- Backfill existing users to paid so current behavior (app keys) is unchanged
UPDATE profiles SET plan = 'paid';

-- Optional: default new signups to free (already the column default)
-- No change needed; new rows get plan = 'free' from DEFAULT.

COMMENT ON COLUMN profiles.plan IS 'free = must add own API keys; paid = can use app-level keys or own keys';
