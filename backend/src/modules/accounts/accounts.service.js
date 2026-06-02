const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');
const { writeAuditLog } = require('../users/audit.service');
const { getConfiguredLimit } = require('../system/system.service');
const { ensureOrdersTable } = require('../orders/orders.service');
const { ensureChangeRequestTable } = require('../change-requests/change-requests.service');

const DEFAULT_INVOICE_CURRENCY = 'USD';
let ensureAccountInvoiceTablePromise = null;
let ensureAccountSummaryDependenciesPromise = null;

const accountSelect = `
  accounts.id,
  accounts.name,
  accounts.marketplace,
  accounts.is_active AS "isActive",
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
    .slice(0, 3);

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

const calculateNetPayable = (lineItems = []) =>
  Number(
    lineItems.reduce(
      (total, item) => total + (item.includeInTotal === false ? 0 : Number(item.amount || 0)),
      0,
    ).toFixed(2),
  );

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
  const { includeInactive, marketplace, status, search } = query;
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
    params.push(marketplace);
    where.push(`accounts.marketplace = $${params.length}`);
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
            COALESCE(SUM(profit) FILTER (WHERE deleted_at IS NULL), 0)::numeric(10, 2) AS "totalProfit",
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND order_status = 'DELIVERED')::int AS "deliveredOrders",
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
      totalProfit: Number(orderRow.totalProfit || 0),
      deliveredOrders: orderRow.deliveredOrders || 0,
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

const createAccount = async (payload) => {
  if (!payload.name) {
    throw new AppError('Account name is required.', 400);
  }

  const result = await pool.query(
    `
      INSERT INTO accounts (name, marketplace, is_active)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [payload.name.trim(), payload.marketplace || 'ebay', payload.isActive ?? true],
  );

  return getAccountById(result.rows[0].id);
};

const updateAccount = async (id, payload) => {
  const result = await pool.query(
    `
      UPDATE accounts
      SET name = COALESCE($1, name),
          marketplace = COALESCE($2, marketplace),
          is_active = COALESCE($3, is_active),
          updated_at = NOW()
      WHERE id = $4
      RETURNING id
    `,
    [
      payload.name === undefined ? null : String(payload.name).trim(),
      payload.marketplace === undefined ? null : payload.marketplace,
      payload.isActive === undefined ? null : Boolean(payload.isActive),
      id,
    ],
  );

  if (result.rowCount === 0) {
    throw new AppError('Account not found.', 404);
  }

  return getAccountById(id);
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
  const primaryPayment = normalizePaymentBlock(payload.primaryPayment);
  const alternatePayment = normalizePaymentBlock(payload.alternatePayment);
  const notes = toText(payload.notes);

  if (!invoiceMonth) {
    throw new AppError('Invoice month is required.', 400);
  }

  if (!invoiceDate) {
    throw new AppError('Invoice date is required.', 400);
  }

  if (!primaryPayment) {
    throw new AppError('Primary payment details are required.', 400);
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

module.exports = {
  listAccounts,
  getAccountById,
  getAccountSummary,
  listAccountInvoices,
  createAccount,
  updateAccount,
  assignListersToAccount,
  createAccountInvoice,
  ensureAccountInvoiceTable,
};
