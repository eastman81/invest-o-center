-- User favorites: category IDs the user has starred (synced across devices)
CREATE TABLE user_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, category_id)
);

CREATE INDEX idx_user_favorites_user_id ON user_favorites(user_id);

-- Ensure user can only favorite their own categories
CREATE OR REPLACE FUNCTION user_favorites_validate_category_own()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'category_id must belong to user_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_favorites_before_insert_update
  BEFORE INSERT OR UPDATE ON user_favorites
  FOR EACH ROW EXECUTE FUNCTION user_favorites_validate_category_own();

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_favorites_select ON user_favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_favorites_insert ON user_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_favorites_delete ON user_favorites FOR DELETE USING (auth.uid() = user_id);
