-- Invest-O-Center: initial schema (enums, tables, indexes, triggers, RLS)
-- Run this in Supabase SQL Editor or via: supabase db push

-- Enums
CREATE TYPE item_source AS ENUM ('manual', 'api');
CREATE TYPE price_source_status AS ENUM ('pending', 'approved', 'rejected');

-- Tables (order respects FKs)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  dashboard_prefs jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  price_provider text,
  schema_fields jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

CREATE TABLE user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  encrypted_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  quantity numeric(20,6) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_value numeric(20,4),
  currency text NOT NULL DEFAULT 'USD',
  source item_source NOT NULL DEFAULT 'manual',
  external_id text,
  category_fields jsonb NOT NULL DEFAULT '{}',
  notes text,
  last_price_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_price_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  description text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  suggested_category_name text,
  status price_source_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE item_value_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  unit_value numeric(20,4) NOT NULL,
  currency text NOT NULL DEFAULT 'USD'
);

-- Indexes
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_category_id ON items(category_id);
CREATE INDEX idx_items_user_category ON items(user_id, category_id);
CREATE INDEX idx_items_last_price_at ON items(last_price_at) WHERE last_price_at IS NOT NULL;
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX idx_user_price_sources_user_id ON user_price_sources(user_id);
CREATE INDEX idx_user_price_sources_status ON user_price_sources(status) WHERE status = 'approved';
CREATE INDEX idx_item_value_history_item_id ON item_value_history(item_id);
CREATE INDEX idx_item_value_history_recorded_at ON item_value_history(recorded_at);
CREATE INDEX idx_item_value_history_item_recorded ON item_value_history(item_id, recorded_at DESC);

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_api_keys_updated_at BEFORE UPDATE ON user_api_keys FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER items_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_price_sources_updated_at BEFORE UPDATE ON user_price_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Profile on signup (trigger on auth.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS: enable on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_price_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_value_history ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_select ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id);

-- categories
CREATE POLICY categories_select ON categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY categories_insert ON categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY categories_update ON categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY categories_delete ON categories FOR DELETE USING (auth.uid() = user_id);

-- user_api_keys (client can manage rows but not read encrypted_key in app; Edge Function uses service role)
CREATE POLICY user_api_keys_select ON user_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_api_keys_insert ON user_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_api_keys_update ON user_api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY user_api_keys_delete ON user_api_keys FOR DELETE USING (auth.uid() = user_id);

-- items
CREATE POLICY items_select ON items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY items_insert ON items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY items_update ON items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY items_delete ON items FOR DELETE USING (auth.uid() = user_id);

-- user_price_sources (users see own + approved)
CREATE POLICY user_price_sources_select ON user_price_sources FOR SELECT
  USING (auth.uid() = user_id OR status = 'approved');
CREATE POLICY user_price_sources_insert ON user_price_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_price_sources_update ON user_price_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY user_price_sources_delete ON user_price_sources FOR DELETE USING (auth.uid() = user_id);

-- item_value_history (users see only for their items; INSERT only via service role / Edge Function)
CREATE POLICY item_value_history_select ON item_value_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM items WHERE items.id = item_value_history.item_id AND items.user_id = auth.uid())
  );
-- No INSERT/UPDATE/DELETE policies for authenticated role; daily job uses service role.
