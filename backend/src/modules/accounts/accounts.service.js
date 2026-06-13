const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');
const { writeAuditLog } = require('../users/audit.service');
const { getConfiguredLimit } = require('../system/system.service');
const { ensureOrdersTable } = require('../orders/orders.service');
const { ensureChangeRequestTable } = require('../change-requests/change-requests.service');

const DEFAULT_INVOICE_CURRENCY = 'USD';
const MARKETPLACE_OPTIONS = [
  'amazon',
  'ebay',
  'walmart',
  'tiktok_shop',
  'noon',
  'woocommerce',
  'shopify',
];
const COUNTRY_LABELS = {
  usa: 'USA',
  uk: 'UK',
  canada: 'Canada',
  uae: 'UAE',
  pakistan: 'Pakistan',
  other: 'Other',
};
const COUNTRY_CURRENCY_MAP = {
  USA: 'USD',
  UK: 'GBP',
  Canada: 'CAD',
  UAE: 'AED',
  Pakistan: 'PKR',
};
const DEFAULT_PRIMARY_PAYMENT = {
  title: 'Primary Account',
  bankName: 'Trend Wave Solutions | Bank Alfalah (BAF)',
  accountNumber: '00081010150545',
  iban: 'PK54ALFH0008001010150545',
  branch: 'S. Town Branch',
};
const DEFAULT_ALTERNATE_PAYMENT = {
  title: 'Alternate Account',
  bankName: 'M Adil Ghaffar | Meezan Bank Limited (MBL)',
  accountNumber: '03120102615756',
  iban: 'PK50MEZN0003120102615756',
  branch: 'I-8 Branch',
};
let ensureAccountColumnsPromise = null;
let ensureAccountInvoiceTablePromise = null;
let ensureAccountSummaryDependenciesPromise = null;

const accountSelect = `
  accounts.id,
  accounts.name,
  accounts.marketplace,
  accounts.country,
  accounts.currency,
  accounts.is_active AS "isActive",
  accounts.client_profit_percentage AS "clientProfitPercentage",
  accounts.company_profit_percentage AS "companyProfitPercentage",
  accounts.previous_order_count AS "previousOrderCount",
  accounts.last_month_profit AS "lastMonthProfit",
  COALESCE(listed_totals."totalProductsListed", 0)::int AS "totalProductsListed",
  COALESCE(assigned_listers."assignedListers", '[]'::json) AS "assignedListers",
  accounts.created_at AS "createdAt",
  accounts.updated_at AS "updatedAt"
`;

const invoiceSelect = `
  invoice.id,
  invoice.invoice_code AS "invoiceCode",
  invoice.account_id AS "accountId",
  account.name AS "accountName",
  invoice.bill_to_name AS "billToName",
  TO_CHAR(invoice.invoice_month, 'YYYY-MM-DD') AS "invoiceMonth",
  TO_CHAR(invoice.invoice_date, 'YYYY-MM-DD') AS "invoiceDate",
  invoice.currency,
  invoice.line_items AS "lineItems",
  invoice.primary_payment AS "primaryPayment",
  invoice.alternate_payment AS "alternatePayment",
  invoice.notes,
  invoice.created_by AS "createdBy",
  creator.name AS "createdByName",
  invoice.updated_by AS "updatedBy",
  updater.name AS "updatedByName",
  invoice.created_at AS "createdAt",
  invoice.updated_at AS "updatedAt"
`;

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const accountFromRow = (row) => ({
  ...row,
  clientProfitPercentage:
    row.clientProfitPercentage === null || row.clientProfitPercentage === undefined
      ? null
      : Number(row.clientProfitPercentage),
  companyProfitPercentage:
    row.companyProfitPercentage === null || row.companyProfitPercentage === undefined
      ? null
      : Number(row.companyProfitPercentage),
  previousOrderCount: Number(row.previousOrderCount || 0),
  lastMonthProfit: Number(row.lastMonthProfit || 0),
  assignedListers: Array.isArray(row.assignedListers) ? row.assignedListers : [],
});

const toText = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const toMoney = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toInteger = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeImportKey = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildImportLookup = (row = {}) =>
  new Map(
    Object.entries(row)
      .filter(([key]) => key !== undefined && key !== null)
      .map(([key, value]) => [normalizeImportKey(key), value]),
  );

const readImportValue = (lookup, ...candidates) => {
  for (const candidate of candidates) {
    const value = lookup.get(normalizeImportKey(candidate));

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return undefined;
};

const isImportRowEmpty = (row) =>
  !row ||
  Object.values(row).every((value) => String(value ?? '').trim() === '');

const normalizeImportBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes', 'y', 'active', 'enabled'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n', 'disabled', 'inactive'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const normalizeMarketplace = (value, fallback = 'ebay') => {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  const canonical = normalized.replace(/[\s-]+/g, '_');

  if (['ebay', 'e_bay'].includes(canonical)) {
    return 'ebay';
  }

  if (['tiktok', 'tiktok_shop'].includes(canonical)) {
    return 'tiktok_shop';
  }

  if (!MARKETPLACE_OPTIONS.includes(canonical)) {
    throw new AppError(
      'Marketplace must be Amazon, eBay, Walmart, TikTok Shop, Noon, WooCommerce, or Shopify.',
      400,
    );
  }

  return canonical;
};

const normalizeCountry = (value) => {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    return null;
  }

  const key = normalized.toLowerCase().replace(/[^a-z]/g, '');
  return COUNTRY_LABELS[key] || normalized;
};

const inferCurrencyFromCountry = (country) => {
  if (!country) {
    return null;
  }

  return COUNTRY_CURRENCY_MAP[country] || null;
};

const normalizeCurrency = (value, country, fallback = DEFAULT_INVOICE_CURRENCY) => {
  const normalized = String(value ?? '').trim().toUpperCase();

  if (normalized) {
    return normalized;
  }

  return inferCurrencyFromCountry(country) || fallback;
};

const normalizeProfitPercentage = (value, label) => {
  if (value === undefined) {
    return null;
  }

  if (value === null || value === '') {
    return null;
  }

  const parsed = Number.parseFloat(String(value));

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new AppError(`${label} must be between 0 and 100.`, 400);
  }

  return Number(parsed.toFixed(2));
};

const assertValidProfitSplit = (clientProfitPercentage, companyProfitPercentage) => {
  if (clientProfitPercentage === null && companyProfitPercentage === null) {
    return;
  }

  if (clientProfitPercentage === null || companyProfitPercentage === null) {
    throw new AppError('Client and company profit percentages must both be set.', 400);
  }

  if (Math.abs(clientProfitPercentage + companyProfitPercentage - 100) > 0.01) {
    throw new AppError('Client and company profit percentages must total 100.', 400);
  }
};

const toDateOnly = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const normalized = toText(value);

  if (!normalized) {
    return null;
  }

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return `${normalized}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

const formatInvoiceMonthLabel = (value) => {
  const normalized = toDateOnly(value);

  if (!normalized) {
    return '';
  }

  const monthDate = new Date(`${normalized}T00:00:00.000Z`);
  return monthFormatter.format(monthDate);
};

const normalizeInvoiceLineItems = (lineItems) => {
  if (!Array.isArray(lineItems) || !lineItems.length) {
    throw new AppError('Add at least one invoice line item.', 400);
  }

  const normalizedItems = lineItems
    .map((item, index) => {
      const title = toText(item?.title);
      const description = toText(item?.description);
      const amount = Number(toMoney(item?.amount, Number.NaN));
      const includeInTotal = item?.includeInTotal !== false;

      if (!title) {
        throw new AppError(`Invoice line ${index + 1} needs a title.`, 400);
      }

      if (!Number.isFinite(amount)) {
        throw new AppError(`Invoice line ${index + 1} needs a valid amount.`, 400);
      }

      return {
        title,
        description,
        amount: Number(amount.toFixed(2)),
        includeInTotal,
      };
    })
    .slice(0, 8);

  if (!normalizedItems.length) {
    throw new AppError('Add at least one invoice line item.', 400);
  }

  return normalizedItems;
};

const normalizePaymentBlock = (block) => {
  if (!block || typeof block !== 'object') {
    return null;
  }

  const normalized = {
    title: toText(block.title),
    bankName: toText(block.bankName),
    accountNumber: toText(block.accountNumber),
    iban: toText(block.iban),
    branch: toText(block.branch),
  };

  if (!Object.values(normalized).some(Boolean)) {
    return null;
  }

  return normalized;
};

const buildDefaultPaymentBlock = (overrides = {}, fallback = DEFAULT_PRIMARY_PAYMENT) => {
  const normalized = normalizePaymentBlock({
    title: overrides.title ?? fallback.title,
    bankName: overrides.bankName ?? fallback.bankName,
    accountNumber: overrides.accountNumber ?? fallback.accountNumber,
    iban: overrides.iban ?? fallback.iban,
    branch: overrides.branch ?? fallback.branch,
  });

  return normalized || normalizePaymentBlock(fallback);
};

const calculateNetPayable = (lineItems = []) => {
  const normalizedItems = Array.isArray(lineItems) ? lineItems : [];
  const findByTitle = (title) =>
    normalizedItems.find((item) => String(item?.title || '').trim().toLowerCase() === title);

  const companyProfit = findByTitle('company profit');
  const clientProfit = findByTitle('client profit');
  const trackingFees = findByTitle('tracking fees');
  const totalProfit = findByTitle('total profit');

  const legacyPattern =
    totalProfit &&
    companyProfit &&
    clientProfit &&
    trackingFees &&
    companyProfit.includeInTotal === false &&
    clientProfit.includeInTotal !== false &&
    trackingFees.includeInTotal === false;

  if (legacyPattern) {
    return Number(
      (Number(companyProfit.amount || 0) + Number(trackingFees.amount || 0)).toFixed(2),
    );
  }

  return Number(
    normalizedItems
      .reduce(
        (total, item) => total + (item.includeInTotal === false ? 0 : Number(item.amount || 0)),
        0,
      )
      .toFixed(2),
  );
};

const invoiceFromRow = (row) => {
  const lineItems = Array.isArray(row.lineItems) ? row.lineItems : [];
  const invoiceMonth = toDateOnly(row.invoiceMonth);
  const invoiceDate = toDateOnly(row.invoiceDate);

  return {
    ...row,
    invoiceMonth,
    invoiceDate,
    invoiceMonthLabel: formatInvoiceMonthLabel(invoiceMonth),
    lineItems,
    primaryPayment: row.primaryPayment || null,
    alternatePayment: row.alternatePayment || null,
    totalNetPayable: calculateNetPayable(lineItems),
  };
};

const buildInvoiceCode = (invoiceMonthDate) => {
  const monthSeed = String(invoiceMonthDate).slice(0, 7).replace('-', '');
  const randomSeed = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${monthSeed}-${randomSeed}`;
};

const ensureAccountColumns = async () => {
  if (!ensureAccountColumnsPromise) {
    ensureAccountColumnsPromise = (async () => {
      await pool.query(`
        ALTER TABLE accounts
          ADD COLUMN IF NOT EXISTS previous_order_count INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS last_month_profit NUMERIC(10, 2) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS country TEXT,
          ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
          ADD COLUMN IF NOT EXISTS client_profit_percentage NUMERIC(6, 2),
          ADD COLUMN IF NOT EXISTS company_profit_percentage NUMERIC(6, 2)
      `);
    })().catch((error) => {
      ensureAccountColumnsPromise = null;
      throw error;
    });
  }

  return ensureAccountColumnsPromise;
};

const ensureAccountInvoiceTable = async () => {
  if (!ensureAccountInvoiceTablePromise) {
    ensureAccountInvoiceTablePromise = (async () => {
      await pool.query(`
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
    )
  `);

      await pool.query(`
    ALTER TABLE account_invoices
      ADD COLUMN IF NOT EXISTS invoice_code TEXT,
      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS bill_to_name TEXT,
      ADD COLUMN IF NOT EXISTS invoice_month DATE,
      ADD COLUMN IF NOT EXISTS invoice_date DATE,
      ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
      ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS primary_payment JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS alternate_payment JSONB,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

      await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_account_invoices_invoice_code
      ON account_invoices(invoice_code)
  `);
      await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_account_invoices_account_id
      ON account_invoices(account_id)
  `);
      await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_account_invoices_invoice_date
      ON account_invoices(invoice_date DESC)
  `);
    })().catch((error) => {
      ensureAccountInvoiceTablePromise = null;
      throw error;
    });
  }

  return ensureAccountInvoiceTablePromise;
};

const ensureAccountSummaryDependencies = async () => {
  if (!ensureAccountSummaryDependenciesPromise) {
    ensureAccountSummaryDependenciesPromise = (async () => {
      await ensureAccountColumns();
      await ensureOrdersTable();
      await ensureChangeRequestTable();
      await ensureAccountInvoiceTable();
    })().catch((error) => {
      ensureAccountSummaryDependenciesPromise = null;
      throw error;
    });
  }

  return ensureAccountSummaryDependenciesPromise;
};

const listAccounts = async (user, query = {}) => {
  await ensureAccountColumns();

  const { includeInactive, marketplace, country, assignment, status, search } = query;
  const params = [];
  const where = [];

  if (includeInactive !== 'true' || user.role === 'lister') {
    where.push('accounts.is_active = TRUE');
  }

  if (user.role === 'lister') {
    params.push(user.id);
    where.push(`EXISTS (
      SELECT 1
      FROM lister_account_assignments la
      WHERE la.account_id = accounts.id
        AND la.lister_id = $${params.length}
    )`);
  }

  if (marketplace) {
    params.push(normalizeMarketplace(marketplace));
    where.push(`accounts.marketplace = $${params.length}`);
  }

  if (country) {
    params.push(normalizeCountry(country));
    where.push(`accounts.country = $${params.length}`);
  }

  if (assignment === 'assigned') {
    where.push(`EXISTS (
      SELECT 1
      FROM lister_account_assignments assignment
      WHERE assignment.account_id = accounts.id
    )`);
  } else if (assignment === 'unassigned') {
    where.push(`NOT EXISTS (
      SELECT 1
      FROM lister_account_assignments assignment
      WHERE assignment.account_id = accounts.id
    )`);
  }

  if (status === 'active') {
    where.push('accounts.is_active = TRUE');
  } else if (status === 'disabled') {
    where.push('accounts.is_active = FALSE');
  }

  if (search) {
    params.push(`%${String(search).trim()}%`);
    where.push(`accounts.name ILIKE $${params.length}`);
  }

  const defaultLimit = await getConfiguredLimit('accounts', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);

  const result = await pool.query(
    `
      SELECT COUNT(*) OVER()::int AS "totalCount", ${accountSelect}
      FROM accounts
      LEFT JOIN (
        SELECT account_used, COUNT(*) AS "totalProductsListed"
        FROM products
        WHERE status = 'listed'
        GROUP BY account_used
      ) AS listed_totals
        ON listed_totals.account_used = accounts.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            json_agg(
              json_build_object(
                'id', lister.id::text,
                'name', lister.name,
                'email', lister.email,
                'isActive', lister.is_active
              )
              ORDER BY lister.name
            ) FILTER (WHERE lister.id IS NOT NULL),
            '[]'::json
          ) AS "assignedListers"
        FROM lister_account_assignments la
        JOIN users lister ON lister.id = la.lister_id
        WHERE la.account_id = accounts.id
      ) AS assigned_listers ON TRUE
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY accounts.name
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, pageRequest.limit, pageRequest.offset],
  );

  const items = result.rows.map(accountFromRow);
  const total = result.rows[0]?.totalCount || 0;

  return {
    items,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

const getAccountById = async (id) => {
  await ensureAccountColumns();

  const result = await pool.query(
    `
      SELECT ${accountSelect}
      FROM accounts
      LEFT JOIN (
        SELECT account_used, COUNT(*) AS "totalProductsListed"
        FROM products
        WHERE status = 'listed'
        GROUP BY account_used
      ) AS listed_totals
        ON listed_totals.account_used = accounts.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            json_agg(
              json_build_object(
                'id', lister.id::text,
                'name', lister.name,
                'email', lister.email,
                'isActive', lister.is_active
              )
              ORDER BY lister.name
            ) FILTER (WHERE lister.id IS NOT NULL),
            '[]'::json
          ) AS "assignedListers"
        FROM lister_account_assignments la
        JOIN users lister ON lister.id = la.lister_id
        WHERE la.account_id = accounts.id
      ) AS assigned_listers ON TRUE
      WHERE accounts.id = $1
      LIMIT 1
    `,
    [id],
  );

  if (result.rowCount === 0) {
    throw new AppError('Account not found.', 404);
  }

  return accountFromRow(result.rows[0]);
};

const listAccountInvoices = async (accountId) => {
  await ensureAccountInvoiceTable();

  const result = await pool.query(
    `
      SELECT ${invoiceSelect}
      FROM account_invoices invoice
      JOIN accounts account ON account.id = invoice.account_id
      LEFT JOIN users creator ON creator.id = invoice.created_by
      LEFT JOIN users updater ON updater.id = invoice.updated_by
      WHERE invoice.account_id = $1
      ORDER BY invoice.invoice_date DESC, invoice.created_at DESC
    `,
    [accountId],
  );

  return result.rows.map(invoiceFromRow);
};

const getAccountSummary = async (accountId) => {
  await ensureAccountSummaryDependencies();

  const account = await getAccountById(accountId);

  const [productSummary, orderSummary, changeRequestSummary, recentOrders, invoices] =
    await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS "totalProducts",
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'listed')::int AS "totalListed",
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'assigned')::int AS "pendingListings",
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'rejected')::int AS "rejectedProducts",
            MAX(listed_at) FILTER (WHERE deleted_at IS NULL AND status = 'listed') AS "lastListedAt"
          FROM products
          WHERE account_used = $1
        `,
        [accountId],
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS "totalOrders",
            COALESCE(SUM(sale_price) FILTER (WHERE deleted_at IS NULL), 0)::numeric(10, 2) AS "totalRevenue",
            COALESCE(SUM(total_cost) FILTER (WHERE deleted_at IS NULL), 0)::numeric(10, 2) AS "totalCost",
            COALESCE(SUM(profit) FILTER (WHERE deleted_at IS NULL), 0)::numeric(10, 2) AS "totalProfit",
            COALESCE(AVG(NULLIF(roi, 0)) FILTER (WHERE deleted_at IS NULL), 0)::numeric(10, 2) AS "averageRoi",
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND order_status = 'DELIVERED')::int AS "deliveredOrders",
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND order_status = 'RETURNED')::int AS "returnedOrders",
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND order_status = 'REFUNDED')::int AS "refundedOrders",
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND order_status = 'CANCELLED')::int AS "cancelledOrders",
            COUNT(*) FILTER (
              WHERE deleted_at IS NULL
                AND (
                  order_status = 'ISSUE'
                  OR COALESCE(issue_status, '') IN ('OPEN', 'IN_REVIEW')
                )
            )::int AS "issueOrders",
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND profit < 0)::int AS "lossOrders",
            MAX(order_date) FILTER (WHERE deleted_at IS NULL) AS "lastOrderDate"
          FROM orders
          WHERE account_id = $1
        `,
        [accountId],
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE status IN ('OPEN', 'IN_PROGRESS'))::int AS "openChangeRequests",
            COUNT(*) FILTER (WHERE status = 'FIXED')::int AS "fixedChangeRequests"
          FROM product_change_requests
          WHERE account_id = $1
        `,
        [accountId],
      ),
      pool.query(
        `
          SELECT
            o.id,
            o.order_code AS "orderCode",
            o.ebay_order_id AS "ebayOrderId",
            COALESCE(o.product_title, p.title, o.asin, 'Unmatched order') AS "label",
            o.order_status AS "status",
            COALESCE(o.profit, 0)::numeric(10, 2) AS "profit",
            o.order_date AS "orderDate"
          FROM orders o
          LEFT JOIN products p ON p.id = o.product_id
          WHERE o.account_id = $1
            AND o.deleted_at IS NULL
          ORDER BY o.order_date DESC
          LIMIT 6
        `,
        [accountId],
      ),
      listAccountInvoices(accountId),
    ]);

  const productRow = productSummary.rows[0] || {};
  const orderRow = orderSummary.rows[0] || {};
  const changeRequestRow = changeRequestSummary.rows[0] || {};

  return {
    account,
    stats: {
      totalProducts: productRow.totalProducts || 0,
      totalListed: productRow.totalListed || 0,
      pendingListings: productRow.pendingListings || 0,
      rejectedProducts: productRow.rejectedProducts || 0,
      lastListedAt: productRow.lastListedAt || null,
      totalOrders: orderRow.totalOrders || 0,
      totalRevenue: Number(orderRow.totalRevenue || 0),
      totalCost: Number(orderRow.totalCost || 0),
      totalProfit: Number(orderRow.totalProfit || 0),
      averageRoi: Number(orderRow.averageRoi || 0),
      previousOrderCount: account.previousOrderCount || 0,
      lastMonthProfit: account.lastMonthProfit || 0,
      deliveredOrders: orderRow.deliveredOrders || 0,
      returnedOrders: orderRow.returnedOrders || 0,
      refundedOrders: orderRow.refundedOrders || 0,
      cancelledOrders: orderRow.cancelledOrders || 0,
      issueOrders: orderRow.issueOrders || 0,
      lossOrders: orderRow.lossOrders || 0,
      lastOrderDate: orderRow.lastOrderDate || null,
      openChangeRequests: changeRequestRow.openChangeRequests || 0,
      fixedChangeRequests: changeRequestRow.fixedChangeRequests || 0,
      assignedListerCount: account.assignedListers.length,
    },
    recentOrders: recentOrders.rows.map((row) => ({
      ...row,
      profit: Number(row.profit || 0),
    })),
    invoices: invoices.slice(0, 6),
  };
};

const createAccountRecord = async (payload) => {
  if (!payload.name) {
    throw new AppError('Account name is required.', 400);
  }

  const normalizedName = String(payload.name).trim();

  if (!normalizedName) {
    throw new AppError('Account name is required.', 400);
  }

  const marketplace = normalizeMarketplace(payload.marketplace, 'ebay');
  const country = normalizeCountry(payload.country);
  const currency = normalizeCurrency(payload.currency, country);
  const isActive = payload.isActive ?? true;
  const clientProfitPercentage = normalizeProfitPercentage(
    payload.clientProfitPercentage,
    'Client profit percentage',
  );
  const companyProfitPercentage = normalizeProfitPercentage(
    payload.companyProfitPercentage,
    'Company profit percentage',
  );
  const previousOrderCount =
    payload.previousOrderCount === undefined
      ? 0
      : toInteger(payload.previousOrderCount, Number.NaN);
  const lastMonthProfit =
    payload.lastMonthProfit === undefined
      ? 0
      : Number(toMoney(payload.lastMonthProfit, Number.NaN).toFixed(2));

  if (!Number.isFinite(previousOrderCount) || previousOrderCount < 0) {
    throw new AppError('Previous order count must be zero or more.', 400);
  }

  if (!Number.isFinite(lastMonthProfit)) {
    throw new AppError('Last month profit must be a valid number.', 400);
  }

  assertValidProfitSplit(clientProfitPercentage, companyProfitPercentage);

  const result = await pool.query(
    `
      INSERT INTO accounts (
        name,
        marketplace,
        country,
        currency,
        is_active,
        client_profit_percentage,
        company_profit_percentage,
        previous_order_count,
        last_month_profit
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `,
    [
      normalizedName,
      marketplace,
      country,
      currency,
      isActive,
      clientProfitPercentage,
      companyProfitPercentage,
      previousOrderCount,
      lastMonthProfit,
    ],
  );

  return getAccountById(result.rows[0].id);
};

const updateAccountRecord = async (id, payload) => {
  const country =
    payload.country === undefined ? null : normalizeCountry(payload.country);
  const currency =
    payload.currency === undefined && payload.country === undefined
      ? null
      : normalizeCurrency(payload.currency, country);
  const clientProfitPercentage = normalizeProfitPercentage(
    payload.clientProfitPercentage,
    'Client profit percentage',
  );
  const companyProfitPercentage = normalizeProfitPercentage(
    payload.companyProfitPercentage,
    'Company profit percentage',
  );
  const previousOrderCount =
    payload.previousOrderCount === undefined
      ? null
      : toInteger(payload.previousOrderCount, Number.NaN);
  const lastMonthProfit =
    payload.lastMonthProfit === undefined
      ? null
      : Number(toMoney(payload.lastMonthProfit, Number.NaN).toFixed(2));

  if (previousOrderCount !== null && (!Number.isFinite(previousOrderCount) || previousOrderCount < 0)) {
    throw new AppError('Previous order count must be zero or more.', 400);
  }

  if (lastMonthProfit !== null && !Number.isFinite(lastMonthProfit)) {
    throw new AppError('Last month profit must be a valid number.', 400);
  }

  if (
    payload.clientProfitPercentage !== undefined ||
    payload.companyProfitPercentage !== undefined
  ) {
    const existing = await getAccountById(id);
    assertValidProfitSplit(
      clientProfitPercentage ?? existing.clientProfitPercentage ?? null,
      companyProfitPercentage ?? existing.companyProfitPercentage ?? null,
    );
  }

  const result = await pool.query(
    `
      UPDATE accounts
      SET name = COALESCE($1, name),
          marketplace = COALESCE($2, marketplace),
          country = COALESCE($3, country),
          currency = COALESCE($4, currency),
          is_active = COALESCE($5, is_active),
          client_profit_percentage = COALESCE($6, client_profit_percentage),
          company_profit_percentage = COALESCE($7, company_profit_percentage),
          previous_order_count = COALESCE($8, previous_order_count),
          last_month_profit = COALESCE($9, last_month_profit),
          updated_at = NOW()
      WHERE id = $10
      RETURNING id
    `,
    [
      payload.name === undefined ? null : String(payload.name).trim(),
      payload.marketplace === undefined ? null : normalizeMarketplace(payload.marketplace),
      payload.country === undefined ? null : country,
      payload.currency === undefined && payload.country === undefined ? null : currency,
      payload.isActive === undefined ? null : Boolean(payload.isActive),
      clientProfitPercentage,
      companyProfitPercentage,
      previousOrderCount,
      lastMonthProfit,
      id,
    ],
  );

  if (result.rowCount === 0) {
    throw new AppError('Account not found.', 404);
  }

  return getAccountById(id);
};

const findAccountByName = async (name) => {
  const result = await pool.query(
    `
      SELECT id
      FROM accounts
      WHERE LOWER(name) = LOWER($1)
      ORDER BY created_at
      LIMIT 1
    `,
    [name],
  );

  return result.rows[0]?.id || null;
};

const resolveBulkInvoiceAmount = (lookup, label, fallback = 0) => {
  const value = readImportValue(
    lookup,
    label,
    `${label} amount`,
    `${label} usd`,
    `${label} value`,
  );

  if (value === undefined) {
    return fallback;
  }

  const amount = Number(toMoney(value, Number.NaN).toFixed(2));

  if (!Number.isFinite(amount)) {
    throw new AppError(`${label} must be a valid number.`, 400);
  }

  return amount;
};

const resolveBulkInvoiceText = (lookup, label) =>
  toText(
    readImportValue(
      lookup,
      `${label} description`,
      `${label} note`,
      `${label} details`,
      `${label} text`,
    ),
  );

const createAccount = async (payload) => {
  await ensureAccountColumns();
  return createAccountRecord(payload);
};

const updateAccount = async (id, payload) => {
  await ensureAccountColumns();
  return updateAccountRecord(id, payload);
};

const bulkImportAccounts = async (actorUserId, rows = []) => {
  await ensureAccountColumns();

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError('Add at least one account row to import.', 400);
  }

  const importRows = rows.filter((row) => !isImportRowEmpty(row));

  if (!importRows.length) {
    throw new AppError('Add at least one account row to import.', 400);
  }

  const importedAccounts = [];
  const errors = [];
  let created = 0;
  let updated = 0;

  for (const [index, row] of importRows.entries()) {
    const lookup = buildImportLookup(row);
    const name = String(readImportValue(lookup, 'name', 'account name') ?? '').trim();
    const marketplace = readImportValue(lookup, 'marketplace');
    const country = readImportValue(lookup, 'country', 'account country');
    const currency = readImportValue(lookup, 'currency');
    const isActive = normalizeImportBoolean(
      readImportValue(lookup, 'isActive', 'active', 'enabled', 'status'),
      true,
    );
    const clientProfitPercentage = readImportValue(
      lookup,
      'client profit percentage',
      'client percentage',
      'client share',
    );
    const companyProfitPercentage = readImportValue(
      lookup,
      'company profit percentage',
      'company percentage',
      'company share',
    );
    const previousOrderValue = readImportValue(
      lookup,
      'previousOrderCount',
      'previous orders',
      'previous order count',
      'order count',
    );
    const previousOrderCount =
      previousOrderValue === undefined ? 0 : toInteger(previousOrderValue, Number.NaN);
    const lastMonthProfitValue = readImportValue(
      lookup,
      'lastMonthProfit',
      'last month profit',
      'previous profit',
      'profit',
    );
    const lastMonthProfit =
      lastMonthProfitValue === undefined
        ? 0
        : Number(toMoney(lastMonthProfitValue, Number.NaN).toFixed(2));

    try {
      if (!name) {
        throw new AppError('Account name is required.', 400);
      }

      if (!Number.isFinite(previousOrderCount) || previousOrderCount < 0) {
        throw new AppError('Previous order count must be zero or more.', 400);
      }

      if (!Number.isFinite(lastMonthProfit)) {
        throw new AppError('Last month profit must be a valid number.', 400);
      }

      const existingAccountId = await findAccountByName(name);
      const payload = {
        name,
        marketplace,
        country,
        currency,
        isActive,
        clientProfitPercentage,
        companyProfitPercentage,
        previousOrderCount,
        lastMonthProfit,
      };

      if (existingAccountId) {
        importedAccounts.push(await updateAccountRecord(existingAccountId, payload));
        updated += 1;
      } else {
        importedAccounts.push(await createAccountRecord(payload));
        created += 1;
      }
    } catch (error) {
      errors.push({
        row: index + 2,
        name: name || null,
        message: error?.message || 'Could not import this account row.',
      });
    }
  }

  if (created > 0 || updated > 0) {
    await writeAuditLog({
      actorUserId,
      action: 'account.bulk_import',
      targetType: 'account',
      details: {
        totalRows: importRows.length,
        created,
        updated,
        failed: errors.length,
      },
    });
  }

  return {
    summary: {
      total: importRows.length,
      created,
      updated,
      failed: errors.length,
    },
    accounts: importedAccounts,
    errors,
  };
};

const assignListersToAccount = async (actorUserId, accountId, listerIds = []) => {
  const uniqueListerIds = [...new Set((Array.isArray(listerIds) ? listerIds : []).filter(Boolean))];
  const account = await getAccountById(accountId);

  if (uniqueListerIds.length > 0) {
    const listerResult = await pool.query(
      `
        SELECT id::text AS id
        FROM users
        WHERE role = 'lister'
          AND id = ANY($1::uuid[])
      `,
      [uniqueListerIds],
    );

    if (listerResult.rowCount !== uniqueListerIds.length) {
      throw new AppError('One or more selected listers were not found.', 400);
    }
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM lister_account_assignments WHERE account_id = $1', [accountId]);

    if (uniqueListerIds.length > 0) {
      await client.query(
        `
          INSERT INTO lister_account_assignments (account_id, lister_id)
          SELECT $1, UNNEST($2::uuid[])
        `,
        [accountId, uniqueListerIds],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await writeAuditLog({
    actorUserId,
    action: 'account.assignment.update',
    targetType: 'account',
    targetId: accountId,
    details: {
      accountName: account.name,
      listerIds: uniqueListerIds,
    },
  });

  return getAccountById(accountId);
};

const createAccountInvoice = async (actorUserId, accountId, payload = {}) => {
  await ensureAccountInvoiceTable();
  const account = await getAccountById(accountId);

  const billToName = toText(payload.billToName) || account.name;
  const invoiceMonth = toDateOnly(payload.invoiceMonth);
  const invoiceDate = toDateOnly(payload.invoiceDate);
  const currency = toText(payload.currency) || DEFAULT_INVOICE_CURRENCY;
  const lineItems = normalizeInvoiceLineItems(payload.lineItems);
  const primaryPayment = buildDefaultPaymentBlock(payload.primaryPayment, DEFAULT_PRIMARY_PAYMENT);
  const alternatePayment = buildDefaultPaymentBlock(
    payload.alternatePayment,
    DEFAULT_ALTERNATE_PAYMENT,
  );
  const notes = toText(payload.notes);

  if (!invoiceMonth) {
    throw new AppError('Invoice month is required.', 400);
  }

  if (!invoiceDate) {
    throw new AppError('Invoice date is required.', 400);
  }

  const invoiceCode = buildInvoiceCode(invoiceMonth);

  const result = await pool.query(
    `
      INSERT INTO account_invoices (
        invoice_code,
        account_id,
        bill_to_name,
        invoice_month,
        invoice_date,
        currency,
        line_items,
        primary_payment,
        alternate_payment,
        notes,
        created_by,
        updated_by,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $11, NOW())
      RETURNING id
    `,
    [
      invoiceCode,
      accountId,
      billToName,
      invoiceMonth,
      invoiceDate,
      currency,
      JSON.stringify(lineItems),
      JSON.stringify(primaryPayment),
      alternatePayment ? JSON.stringify(alternatePayment) : null,
      notes,
      actorUserId,
    ],
  );

  const invoices = await listAccountInvoices(accountId);
  const invoice = invoices.find((entry) => entry.id === result.rows[0].id);

  await writeAuditLog({
    actorUserId,
    action: 'account.invoice.create',
    targetType: 'account',
    targetId: accountId,
    details: {
      accountName: account.name,
      invoiceCode,
      billToName,
      invoiceMonth: formatInvoiceMonthLabel(invoiceMonth),
      totalNetPayable: invoice?.totalNetPayable || calculateNetPayable(lineItems),
    },
  });

  return invoice;
};

const bulkCreateAccountInvoices = async (actorUserId, rows = []) => {
  await ensureAccountInvoiceTable();

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError('Add at least one invoice row to import.', 400);
  }

  const importRows = rows.filter((row) => !isImportRowEmpty(row));

  if (!importRows.length) {
    throw new AppError('Add at least one invoice row to import.', 400);
  }

  const invoices = [];
  const errors = [];

  for (const [index, row] of importRows.entries()) {
    const lookup = buildImportLookup(row);
    const accountName = String(
      readImportValue(lookup, 'account name', 'account', 'accountName') ?? '',
    ).trim();

    try {
      if (!accountName) {
        throw new AppError('Account name is required.', 400);
      }

      const accountId = await findAccountByName(accountName);

      if (!accountId) {
        throw new AppError('Account not found.', 404);
      }

      const totalProfit = resolveBulkInvoiceAmount(lookup, 'Total Profit', 0);
      const companyProfit = resolveBulkInvoiceAmount(lookup, 'Company Profit', 0);
      const clientProfit = resolveBulkInvoiceAmount(lookup, 'Client Profit', totalProfit);
      const trackingFees = resolveBulkInvoiceAmount(lookup, 'Tracking Fees', 0);
      const currency =
        toText(readImportValue(lookup, 'currency')) || DEFAULT_INVOICE_CURRENCY;

      const invoice = await createAccountInvoice(actorUserId, accountId, {
        billToName:
          toText(readImportValue(lookup, 'bill to name', 'billToName', 'client name')) ||
          accountName,
        invoiceMonth:
          toDateOnly(readImportValue(lookup, 'invoice month', 'month', 'invoiceMonth')) ||
          new Date().toISOString().slice(0, 10),
        invoiceDate:
          toDateOnly(readImportValue(lookup, 'invoice date', 'date', 'invoiceDate')) ||
          new Date().toISOString().slice(0, 10),
        currency,
        lineItems: [
          {
            title: toText(readImportValue(lookup, 'total profit title')) || 'Total Profit',
            description: resolveBulkInvoiceText(lookup, 'Total Profit'),
            amount: totalProfit,
            includeInTotal: false,
          },
          {
            title: toText(readImportValue(lookup, 'company profit title')) || 'Company Profit',
            description: resolveBulkInvoiceText(lookup, 'Company Profit'),
            amount: companyProfit,
            includeInTotal: normalizeImportBoolean(
              readImportValue(
                lookup,
                'company profit include in total',
                'company profit payable',
              ),
              true,
            ),
          },
          {
            title: toText(readImportValue(lookup, 'client profit title')) || 'Client Profit',
            description: resolveBulkInvoiceText(lookup, 'Client Profit'),
            amount: clientProfit,
            includeInTotal:
              normalizeImportBoolean(
                readImportValue(
                  lookup,
                  'client profit include in total',
                  'client profit payable',
                ),
                false,
              ) !== false,
          },
          {
            title: toText(readImportValue(lookup, 'tracking fees title')) || 'Tracking Fees',
            description: resolveBulkInvoiceText(lookup, 'Tracking Fees'),
            amount: trackingFees,
            includeInTotal: normalizeImportBoolean(
              readImportValue(
                lookup,
                'tracking fees include in total',
                'tracking fees payable',
              ),
              true,
            ),
          },
        ],
        primaryPayment: {
          title:
            toText(readImportValue(lookup, 'primary title', 'primary account title')) ||
            DEFAULT_PRIMARY_PAYMENT.title,
          bankName:
            toText(readImportValue(lookup, 'primary bank', 'primary bank / holder', 'primary bankname')) ||
            DEFAULT_PRIMARY_PAYMENT.bankName,
          accountNumber:
            toText(readImportValue(lookup, 'primary account number', 'primary account no')) ||
            DEFAULT_PRIMARY_PAYMENT.accountNumber,
          iban:
            toText(readImportValue(lookup, 'primary iban')) || DEFAULT_PRIMARY_PAYMENT.iban,
          branch:
            toText(readImportValue(lookup, 'primary branch')) || DEFAULT_PRIMARY_PAYMENT.branch,
        },
        alternatePayment: {
          title:
            toText(readImportValue(lookup, 'alternate title', 'alternate account title')) ||
            DEFAULT_ALTERNATE_PAYMENT.title,
          bankName:
            toText(
              readImportValue(
                lookup,
                'alternate bank',
                'alternate bank / holder',
                'alternate bankname',
              ),
            ) || DEFAULT_ALTERNATE_PAYMENT.bankName,
          accountNumber:
            toText(readImportValue(lookup, 'alternate account number', 'alternate account no')) ||
            DEFAULT_ALTERNATE_PAYMENT.accountNumber,
          iban:
            toText(readImportValue(lookup, 'alternate iban')) ||
            DEFAULT_ALTERNATE_PAYMENT.iban,
          branch:
            toText(readImportValue(lookup, 'alternate branch')) ||
            DEFAULT_ALTERNATE_PAYMENT.branch,
        },
        notes: toText(readImportValue(lookup, 'notes', 'invoice notes')),
      });

      invoices.push(invoice);
    } catch (error) {
      errors.push({
        row: index + 2,
        accountName: accountName || null,
        message: error?.message || 'Could not create this invoice row.',
      });
    }
  }

  if (invoices.length > 0) {
    await writeAuditLog({
      actorUserId,
      action: 'account.invoice.bulk_create',
      targetType: 'account',
      details: {
        totalRows: importRows.length,
        created: invoices.length,
        failed: errors.length,
      },
    });
  }

  return {
    summary: {
      total: importRows.length,
      created: invoices.length,
      failed: errors.length,
    },
    invoices,
    errors,
  };
};

module.exports = {
  listAccounts,
  getAccountById,
  getAccountSummary,
  listAccountInvoices,
  createAccount,
  updateAccount,
  bulkImportAccounts,
  assignListersToAccount,
  createAccountInvoice,
  bulkCreateAccountInvoices,
  ensureAccountSummaryDependencies,
  ensureAccountInvoiceTable,
};
