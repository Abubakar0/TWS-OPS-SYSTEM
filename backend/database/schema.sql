CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'hunter', 'lister');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('approved', 'rejected', 'assigned', 'listed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active',
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  disabled_by UUID REFERENCES users(id),
  last_login TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  parent_user_id UUID REFERENCES users(id),
  tenant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hunter_lister_assignments (
  hunter_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lister_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hunting_criteria (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_roi NUMERIC(8, 2) NOT NULL DEFAULT 30,
  min_profit NUMERIC(10, 2) NOT NULL DEFAULT 0,
  min_sold_count INTEGER NOT NULL DEFAULT 1,
  fee_percent NUMERIC(8, 2) NOT NULL DEFAULT 21,
  asin_required BOOLEAN NOT NULL DEFAULT TRUE,
  min_stock_count INTEGER NOT NULL DEFAULT 8,
  min_alt_stock_count INTEGER NOT NULL DEFAULT 8,
  min_rating NUMERIC(4, 2) NOT NULL DEFAULT 0,
  custom_label_required BOOLEAN NOT NULL DEFAULT FALSE,
  watchers_required BOOLEAN NOT NULL DEFAULT FALSE,
  min_watcher_count INTEGER NOT NULL DEFAULT 0,
  min_sales_last_two_months INTEGER NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  marketplace TEXT NOT NULL DEFAULT 'ebay',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lister_account_assignments (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lister_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, lister_id)
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_id UUID NOT NULL REFERENCES users(id),
  assigned_lister_id UUID REFERENCES users(id),
  listed_by UUID REFERENCES users(id),
  account_used UUID REFERENCES accounts(id),
  amazon_url TEXT NOT NULL,
  amazon_alt_url TEXT,
  ebay_url TEXT NOT NULL,
  asin TEXT,
  title TEXT,
  custom_label TEXT,
  amazon_price NUMERIC(10, 2),
  ebay_price NUMERIC(10, 2),
  fees NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sold_count INTEGER NOT NULL DEFAULT 0,
  stock_quantity INTEGER,
  alternate_stock_quantity INTEGER,
  rating NUMERIC(4, 2),
  product_watchers INTEGER,
  sales_last_two_months INTEGER,
  delivery_days INTEGER,
  profit NUMERIC(10, 2) NOT NULL DEFAULT 0,
  roi NUMERIC(8, 2) NOT NULL DEFAULT 0,
  status product_status NOT NULL DEFAULT 'rejected',
  rejection_reason TEXT,
  validation_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  listed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  lister_id UUID NOT NULL REFERENCES users(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  listing_url TEXT,
  item_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS assigned_lister_id UUID REFERENCES users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE users
SET status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END
WHERE status IS NULL OR status = '';
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS min_stock_count INTEGER NOT NULL DEFAULT 8;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS min_alt_stock_count INTEGER NOT NULL DEFAULT 8;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS min_rating NUMERIC(4, 2) NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS custom_label_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS watchers_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS min_watcher_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS min_sales_last_two_months INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS amazon_alt_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_label TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS alternate_stock_quantity INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating NUMERIC(4, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_watchers INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_last_two_months INTEGER;
ALTER TABLE listings ALTER COLUMN listing_url DROP NOT NULL;
ALTER TABLE listings ALTER COLUMN item_id DROP NOT NULL;

INSERT INTO hunting_criteria (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_products_hunter_id ON products(hunter_id);
CREATE INDEX IF NOT EXISTS idx_products_assigned_lister_id ON products(assigned_lister_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_products_asin
  ON products(asin)
  WHERE asin IS NOT NULL AND asin <> '';
CREATE INDEX IF NOT EXISTS idx_listings_account_id ON listings(account_id);
CREATE INDEX IF NOT EXISTS idx_hunter_lister_lister_id ON hunter_lister_assignments(lister_id);
CREATE INDEX IF NOT EXISTS idx_lister_account_assignments_lister_id ON lister_account_assignments(lister_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
