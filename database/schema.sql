CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'hunter', 'lister');
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_id UUID NOT NULL REFERENCES users(id),
  assigned_lister_id UUID REFERENCES users(id),
  listed_by UUID REFERENCES users(id),
  account_used UUID REFERENCES accounts(id),
  amazon_url TEXT NOT NULL,
  ebay_url TEXT NOT NULL,
  asin TEXT,
  title TEXT,
  amazon_price NUMERIC(10, 2),
  ebay_price NUMERIC(10, 2),
  fees NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sold_count INTEGER NOT NULL DEFAULT 0,
  stock_quantity INTEGER,
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
ALTER TABLE listings ALTER COLUMN listing_url DROP NOT NULL;
ALTER TABLE listings ALTER COLUMN item_id DROP NOT NULL;

INSERT INTO hunting_criteria (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_products_hunter_id ON products(hunter_id);
CREATE INDEX IF NOT EXISTS idx_products_assigned_lister_id ON products(assigned_lister_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_asin
  ON products(asin)
  WHERE asin IS NOT NULL AND asin <> '';
CREATE INDEX IF NOT EXISTS idx_listings_account_id ON listings(account_id);
CREATE INDEX IF NOT EXISTS idx_hunter_lister_lister_id ON hunter_lister_assignments(lister_id);
