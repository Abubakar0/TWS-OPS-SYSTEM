CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'hunter', 'lister', 'order_processor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'order_processor';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'hr';
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
  roles JSONB NOT NULL DEFAULT '[]'::jsonb,
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
  hunter_status TEXT NOT NULL DEFAULT 'ACTIVE',
  training_rules_acknowledged_at TIMESTAMPTZ,
  training_extended_until DATE,
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

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
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
  basket_count_required BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_days_required BOOLEAN NOT NULL DEFAULT FALSE,
  max_delivery_days INTEGER NOT NULL DEFAULT 7,
  monthly_graph_required BOOLEAN NOT NULL DEFAULT FALSE,
  category_required BOOLEAN NOT NULL DEFAULT FALSE,
  amazon_alt_url_required BOOLEAN NOT NULL DEFAULT FALSE,
  training_min_roi NUMERIC(10, 2) NOT NULL DEFAULT 0,
  training_min_profit NUMERIC(10, 2) NOT NULL DEFAULT 0,
  training_min_sold_count INTEGER NOT NULL DEFAULT 0,
  training_min_stock_count INTEGER NOT NULL DEFAULT 0,
  training_min_rating NUMERIC(10, 2) NOT NULL DEFAULT 0,
  training_min_watcher_count INTEGER NOT NULL DEFAULT 0,
  training_min_sales_last_two_months INTEGER NOT NULL DEFAULT 0,
  training_asin_required BOOLEAN NOT NULL DEFAULT TRUE,
  training_custom_label_required BOOLEAN NOT NULL DEFAULT FALSE,
  training_category_required BOOLEAN NOT NULL DEFAULT FALSE,
  training_amazon_alt_url_required BOOLEAN NOT NULL DEFAULT FALSE,
  training_max_rejected_products_allowed INTEGER NOT NULL DEFAULT 10,
  training_min_approval_rate_for_activation NUMERIC(10, 2) NOT NULL DEFAULT 60,
  training_min_listed_products_for_activation INTEGER NOT NULL DEFAULT 5,
  training_min_orders_generated_for_activation INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  marketplace TEXT NOT NULL DEFAULT 'ebay',
  country TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  client_profit_percentage NUMERIC(6, 2),
  company_profit_percentage NUMERIC(6, 2),
  previous_order_count INTEGER NOT NULL DEFAULT 0,
  last_month_profit NUMERIC(10, 2) NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS account_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_code TEXT NOT NULL UNIQUE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  bill_to_name TEXT NOT NULL,
  invoice_month DATE NOT NULL,
  invoice_date DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  primary_payment JSONB NOT NULL DEFAULT '{}'::jsonb,
  alternate_payment JSONB,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
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
  amazon_alt_url TEXT,
  ebay_url TEXT NOT NULL,
  asin TEXT,
  title TEXT,
  category TEXT,
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
  basket_count INTEGER,
  delivery_days INTEGER,
  monthly_graph_uptrend BOOLEAN,
  profit NUMERIC(10, 2) NOT NULL DEFAULT 0,
  roi NUMERIC(8, 2) NOT NULL DEFAULT 0,
  status product_status NOT NULL DEFAULT 'rejected',
  listing_review_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  listing_submitted_for_review_at TIMESTAMPTZ,
  listing_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  listing_reviewed_at TIMESTAMPTZ,
  listing_review_rejection_reason TEXT,
  original_hunter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  current_hunter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  validation_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  delete_reason TEXT,
  listed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hunter_weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hunter_id, review_date)
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL DEFAULT ('ORD-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8))),
  ebay_order_id TEXT NOT NULL,
  ebay_item_id TEXT,
  ebay_listing_url TEXT,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  asin TEXT,
  product_title TEXT,
  custom_label TEXT,
  hunter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  lister_id UUID REFERENCES users(id) ON DELETE SET NULL,
  account_id UUID NOT NULL REFERENCES accounts(id),
  buyer_name TEXT,
  buyer_country TEXT,
  buyer_state TEXT,
  buyer_city TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  sale_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ebay_fee NUMERIC(10, 2),
  shipping_charged NUMERIC(10, 2),
  tax_collected NUMERIC(10, 2),
  amazon_buying_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  supplier_shipping_cost NUMERIC(10, 2),
  other_cost NUMERIC(10, 2),
  total_cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
  profit NUMERIC(10, 2) NOT NULL DEFAULT 0,
  roi NUMERIC(10, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  order_date TIMESTAMPTZ NOT NULL,
  payment_date TIMESTAMPTZ,
  expected_ship_date TIMESTAMPTZ,
  placed_date TIMESTAMPTZ,
  delivered_date TIMESTAMPTZ,
  tracking_number TEXT,
  carrier TEXT,
  amazon_order_id TEXT,
  amazon_order_link TEXT,
  supplier_order_status TEXT NOT NULL DEFAULT 'NOT_PLACED',
  order_status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (order_status IN ('NEW', 'READY_TO_PLACE', 'PLACED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED', 'REFUNDED', 'ISSUE', 'ON_HOLD')),
  placement_status TEXT NOT NULL DEFAULT 'NOT_PLACED'
    CHECK (placement_status IN ('NOT_PLACED', 'PLACED', 'FAILED', 'CANCELLED')),
  payment_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (payment_status IN ('PAID', 'PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  match_status TEXT NOT NULL DEFAULT 'matched'
    CHECK (match_status IN ('matched', 'unmatched')),
  issue_type TEXT,
  issue_status TEXT,
  order_impact TEXT,
  notes TEXT,
  issue_reason TEXT,
  issue_created_at TIMESTAMPTZ,
  issue_created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  issue_resolved_at TIMESTAMPTZ,
  issue_resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ebay_order_id)
);

CREATE TABLE IF NOT EXISTS product_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  hunter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lister_id UUID REFERENCES users(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  asin TEXT NOT NULL,
  product_title TEXT,
  requested_changes TEXT NOT NULL,
  issue_type TEXT,
  issue_reason TEXT,
  current_amazon_link TEXT,
  current_ebay_link TEXT,
  current_price NUMERIC(10, 2),
  new_amazon_link TEXT,
  new_ebay_link TEXT,
  new_price NUMERIC(10, 2),
  new_stock_count INTEGER,
  notes TEXT,
  rejected_reason TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'FIXED', 'REJECTED', 'CLOSED')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completion_notes TEXT,
  completed_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
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

CREATE TABLE IF NOT EXISTS employee_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL UNIQUE,
  phone TEXT,
  national_id TEXT,
  address TEXT,
  emergency_contact TEXT,
  department TEXT,
  designation TEXT,
  manager_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  joining_date DATE,
  date_of_birth DATE,
  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME',
  employment_status TEXT NOT NULL DEFAULT 'ACTIVE',
  basic_salary NUMERIC(10, 2) NOT NULL DEFAULT 0,
  allowances NUMERIC(10, 2) NOT NULL DEFAULT 0,
  default_deductions NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  bank_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_review_status TEXT NOT NULL DEFAULT 'APPROVED',
  profile_review_notes TEXT,
  profile_locked BOOLEAN NOT NULL DEFAULT FALSE,
  profile_reviewed_at TIMESTAMPTZ,
  profile_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  self_edit_requested_at TIMESTAMPTZ,
  birthday_popup_shown_year INTEGER,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  check_in_time TIME,
  check_out_time TIME,
  status TEXT NOT NULL DEFAULT 'PRESENT',
  late_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_profile_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS hr_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC(6, 2) NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT,
  review_notes TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL UNIQUE REFERENCES employee_profiles(id) ON DELETE CASCADE,
  annual_days NUMERIC(6, 2) NOT NULL DEFAULT 14,
  sick_days NUMERIC(6, 2) NOT NULL DEFAULT 10,
  casual_days NUMERIC(6, 2) NOT NULL DEFAULT 5,
  emergency_days NUMERIC(6, 2) NOT NULL DEFAULT 3,
  unpaid_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  payroll_month DATE NOT NULL,
  basic_salary NUMERIC(10, 2) NOT NULL DEFAULT 0,
  allowances NUMERIC(10, 2) NOT NULL DEFAULT 0,
  bonuses NUMERIC(10, 2) NOT NULL DEFAULT 0,
  deductions NUMERIC(10, 2) NOT NULL DEFAULT 0,
  advances NUMERIC(10, 2) NOT NULL DEFAULT 0,
  unpaid_leave_deduction NUMERIC(10, 2) NOT NULL DEFAULT 0,
  late_deduction NUMERIC(10, 2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_profile_id, payroll_month)
);

CREATE TABLE IF NOT EXISTS hr_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  receipt_url TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  notes TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  warning_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  employee_response TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_performance_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL DEFAULT 'GENERAL',
  note TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS assigned_lister_id UUID REFERENCES users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hunter_status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS training_rules_acknowledged_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS training_extended_until DATE;
UPDATE users
SET status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END
WHERE status IS NULL OR status = '';
UPDATE users
SET roles = jsonb_build_array(role::text)
WHERE roles IS NULL OR roles = '[]'::jsonb;
UPDATE users
SET hunter_status = 'ACTIVE'
WHERE hunter_status IS NULL OR trim(hunter_status) = '';
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS min_stock_count INTEGER NOT NULL DEFAULT 8;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS min_alt_stock_count INTEGER NOT NULL DEFAULT 8;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS min_rating NUMERIC(4, 2) NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS custom_label_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS watchers_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS min_watcher_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS min_sales_last_two_months INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS basket_count_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS delivery_days_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS max_delivery_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS monthly_graph_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS category_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS amazon_alt_url_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_min_roi NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_min_profit NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_min_sold_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_min_stock_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_min_rating NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_min_watcher_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_min_sales_last_two_months INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_asin_required BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_custom_label_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_category_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_amazon_alt_url_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_max_rejected_products_allowed INTEGER NOT NULL DEFAULT 10;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_min_approval_rate_for_activation NUMERIC(10, 2) NOT NULL DEFAULT 60;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_min_listed_products_for_activation INTEGER NOT NULL DEFAULT 5;
ALTER TABLE hunting_criteria ADD COLUMN IF NOT EXISTS training_min_orders_generated_for_activation INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS amazon_alt_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_label TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS alternate_stock_quantity INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating NUMERIC(4, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_watchers INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_last_two_months INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS basket_count INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS monthly_graph_uptrend BOOLEAN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS delete_reason TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS listing_review_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE products ADD COLUMN IF NOT EXISTS listing_submitted_for_review_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS listing_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS listing_reviewed_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS listing_review_rejection_reason TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS original_hunter_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS current_hunter_id UUID REFERENCES users(id) ON DELETE SET NULL;
UPDATE products
SET original_hunter_id = COALESCE(original_hunter_id, hunter_id),
    current_hunter_id = COALESCE(current_hunter_id, hunter_id)
WHERE original_hunter_id IS NULL OR current_hunter_id IS NULL;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS invoice_code TEXT;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS bill_to_name TEXT;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS invoice_month DATE;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS invoice_date DATE;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS primary_payment JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS alternate_payment JSONB;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE account_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS previous_order_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_month_profit NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS client_profit_percentage NUMERIC(6, 2);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS company_profit_percentage NUMERIC(6, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS issue_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS issue_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_impact TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS issue_created_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS issue_created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS issue_resolved_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS issue_resolved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS profile_review_status TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS profile_review_notes TEXT;
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS profile_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS profile_reviewed_at TIMESTAMPTZ;
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS profile_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS self_edit_requested_at TIMESTAMPTZ;
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS birthday_popup_shown_year INTEGER;
ALTER TABLE listings ALTER COLUMN listing_url DROP NOT NULL;
ALTER TABLE listings ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_placement_status_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_match_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_order_status_check
    CHECK (order_status IN ('NEW', 'READY_TO_PLACE', 'PLACED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED', 'REFUNDED', 'ISSUE', 'ON_HOLD')),
  ADD CONSTRAINT orders_placement_status_check
    CHECK (placement_status IN ('NOT_PLACED', 'PLACED', 'FAILED', 'CANCELLED')),
  ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('PAID', 'PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  ADD CONSTRAINT orders_match_status_check
    CHECK (match_status IN ('matched', 'unmatched'));

CREATE TABLE IF NOT EXISTS product_ownership_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_hunter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_hunter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transferred_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO hunting_criteria (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_products_hunter_id ON products(hunter_id);
CREATE INDEX IF NOT EXISTS idx_products_assigned_lister_id ON products(assigned_lister_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_roles_gin ON users USING GIN(roles);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_hunter_weekly_reviews_hunter_id ON hunter_weekly_reviews(hunter_id);
CREATE INDEX IF NOT EXISTS idx_product_change_requests_hunter_id ON product_change_requests(hunter_id);
CREATE INDEX IF NOT EXISTS idx_product_change_requests_lister_id ON product_change_requests(lister_id);
CREATE INDEX IF NOT EXISTS idx_product_change_requests_status ON product_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_orders_hunter_id ON orders(hunter_id);
CREATE INDEX IF NOT EXISTS idx_orders_lister_id ON orders(lister_id);
CREATE INDEX IF NOT EXISTS idx_orders_account_id ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_placement_status ON orders(placement_status);
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_asin ON orders(asin);
CREATE INDEX IF NOT EXISTS idx_orders_amazon_order_id ON orders(amazon_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_invoices_invoice_code ON account_invoices(invoice_code);
CREATE INDEX IF NOT EXISTS idx_account_invoices_account_id ON account_invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_account_invoices_invoice_date ON account_invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_department ON employee_profiles(department);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_manager ON employee_profiles(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_date ON hr_attendance(attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status ON hr_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_month ON hr_payroll(payroll_month DESC);
CREATE INDEX IF NOT EXISTS idx_hr_expenses_status ON hr_expenses(status);
CREATE INDEX IF NOT EXISTS idx_hr_documents_type ON hr_employee_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_hr_warnings_type ON hr_warnings(warning_type);
CREATE INDEX IF NOT EXISTS idx_products_asin
  ON products(asin)
  WHERE asin IS NOT NULL AND asin <> '';
CREATE INDEX IF NOT EXISTS idx_listings_account_id ON listings(account_id);
CREATE INDEX IF NOT EXISTS idx_hunter_lister_lister_id ON hunter_lister_assignments(lister_id);
CREATE INDEX IF NOT EXISTS idx_lister_account_assignments_lister_id ON lister_account_assignments(lister_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
