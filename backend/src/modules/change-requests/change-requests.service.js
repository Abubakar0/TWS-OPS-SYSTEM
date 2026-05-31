const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');
const { getConfiguredLimit } = require('../system/system.service');
const { writeAuditLog } = require('../users/audit.service');

const CHANGE_REQUEST_STATUSES = ['OPEN', 'IN_PROGRESS', 'FIXED', 'REJECTED', 'CLOSED'];
const ISSUE_TYPES = [
  'PRODUCT_NOT_AVAILABLE',
  'PRICE_INCREASED',
  'ORDER_IN_LOSS',
  'LOW_STOCK',
  'WRONG_PRODUCT_LINK',
  'AMAZON_LINK_NOT_WORKING',
  'SUPPLIER_CANCELLED',
  'BUYER_ADDRESS_ISSUE',
  'TRACKING_ISSUE',
  'OTHER',
];

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS'];

const toText = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const toUpper = (value) => {
  const normalized = toText(value);
  return normalized ? normalized.toUpperCase() : null;
};

const toMoney = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const toInteger = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const isValidMarketplaceUrl = (value, marketplace) => {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    if (marketplace === 'amazon') {
      return hostname.includes('amazon.');
    }

    if (marketplace === 'ebay') {
      return hostname.includes('ebay.');
    }

    return true;
  } catch (error) {
    return false;
  }
};

const formatStatusLabel = (status) =>
  String(status || '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const ensureChangeRequestTable = async () => {
  await pool.query(`
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
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      started_at TIMESTAMPTZ,
      started_by UUID REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ,
      resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
      completion_notes TEXT,
      completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE product_change_requests
      ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS issue_type TEXT,
      ADD COLUMN IF NOT EXISTS issue_reason TEXT,
      ADD COLUMN IF NOT EXISTS current_amazon_link TEXT,
      ADD COLUMN IF NOT EXISTS current_ebay_link TEXT,
      ADD COLUMN IF NOT EXISTS current_price NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS new_amazon_link TEXT,
      ADD COLUMN IF NOT EXISTS new_ebay_link TEXT,
      ADD COLUMN IF NOT EXISTS new_price NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS new_stock_count INTEGER,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS started_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS completion_notes TEXT,
      ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ
  `);

  await pool.query(`
    ALTER TABLE product_change_requests
    DROP CONSTRAINT IF EXISTS product_change_requests_status_check
  `);

  await pool.query(`
    UPDATE product_change_requests
    SET status = CASE
      WHEN LOWER(status) = 'pending' THEN 'OPEN'
      WHEN LOWER(status) = 'completed' THEN 'FIXED'
      WHEN LOWER(status) = 'open' THEN 'OPEN'
      WHEN LOWER(status) = 'in_progress' THEN 'IN_PROGRESS'
      WHEN LOWER(status) = 'fixed' THEN 'FIXED'
      WHEN LOWER(status) = 'rejected' THEN 'REJECTED'
      WHEN LOWER(status) = 'closed' THEN 'CLOSED'
      ELSE 'OPEN'
    END
    WHERE status IS NULL
       OR status <> CASE
         WHEN LOWER(status) = 'pending' THEN 'OPEN'
         WHEN LOWER(status) = 'completed' THEN 'FIXED'
         WHEN LOWER(status) = 'open' THEN 'OPEN'
         WHEN LOWER(status) = 'in_progress' THEN 'IN_PROGRESS'
         WHEN LOWER(status) = 'fixed' THEN 'FIXED'
         WHEN LOWER(status) = 'rejected' THEN 'REJECTED'
         WHEN LOWER(status) = 'closed' THEN 'CLOSED'
         ELSE 'OPEN'
       END
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'product_change_requests_status_check'
      ) THEN
        ALTER TABLE product_change_requests
        ADD CONSTRAINT product_change_requests_status_check
        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'FIXED', 'REJECTED', 'CLOSED'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_product_change_requests_hunter_id
      ON product_change_requests(hunter_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_product_change_requests_lister_id
      ON product_change_requests(lister_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_product_change_requests_status
      ON product_change_requests(status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_product_change_requests_order_id
      ON product_change_requests(order_id)
  `);
};

const changeRequestSelect = `
  req.id,
  req.product_id AS "productId",
  req.order_id AS "orderId",
  req.hunter_id AS "hunterId",
  hunter.name AS "hunterName",
  hunter.email AS "hunterEmail",
  req.lister_id AS "listerId",
  lister.name AS "listerName",
  lister.email AS "listerEmail",
  req.account_id AS "accountId",
  account.name AS "accountName",
  req.asin,
  req.product_title AS "productTitle",
  req.requested_changes AS "requestedChanges",
  req.issue_type AS "issueType",
  req.issue_reason AS "issueReason",
  req.current_amazon_link AS "currentAmazonLink",
  req.current_ebay_link AS "currentEbayLink",
  req.current_price AS "currentPrice",
  req.new_amazon_link AS "newAmazonLink",
  req.new_ebay_link AS "newEbayLink",
  req.new_price AS "newPrice",
  req.new_stock_count AS "newStockCount",
  req.notes,
  req.rejected_reason AS "rejectedReason",
  req.status,
  req.created_by AS "createdBy",
  creator.name AS "createdByName",
  req.started_at AS "startedAt",
  req.started_by AS "startedBy",
  started_user.name AS "startedByName",
  req.resolved_at AS "resolvedAt",
  req.resolved_by AS "resolvedBy",
  resolved_user.name AS "resolvedByName",
  req.completion_notes AS "completionNotes",
  req.completed_by AS "completedBy",
  completed_user.name AS "completedByName",
  req.completed_at AS "completedAt",
  req.created_at AS "createdAt",
  req.updated_at AS "updatedAt",
  product.status AS "productStatus",
  product.amazon_url AS "productAmazonUrl",
  product.ebay_url AS "productEbayUrl",
  product.stock_quantity AS "currentStockCount",
  product.ebay_price AS "productEbayPrice",
  listing.listing_url AS "listingUrl",
  issue_order.order_code AS "orderCode",
  issue_order.order_status AS "orderStatus",
  issue_order.issue_status AS "orderIssueStatus"
`;

const changeRequestJoins = `
  FROM product_change_requests req
  JOIN products product ON product.id = req.product_id
  JOIN users hunter ON hunter.id = req.hunter_id
  LEFT JOIN users lister ON lister.id = req.lister_id
  LEFT JOIN users creator ON creator.id = req.created_by
  LEFT JOIN users started_user ON started_user.id = req.started_by
  LEFT JOIN users resolved_user ON resolved_user.id = req.resolved_by
  LEFT JOIN users completed_user ON completed_user.id = req.completed_by
  LEFT JOIN accounts account ON account.id = COALESCE(req.account_id, product.account_used)
  LEFT JOIN listings listing ON listing.product_id = req.product_id
  LEFT JOIN orders issue_order ON issue_order.id = req.order_id
`;

const parseChangeRequestRow = (row) => ({
  ...row,
  currentPrice: row.currentPrice === null ? null : Number(row.currentPrice),
  newPrice: row.newPrice === null ? null : Number(row.newPrice),
  newStockCount: row.newStockCount === null ? null : Number(row.newStockCount),
  currentStockCount: row.currentStockCount === null ? null : Number(row.currentStockCount),
  productEbayPrice: row.productEbayPrice === null ? null : Number(row.productEbayPrice),
});

const buildFilters = (user, query = {}) => {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (user.role === 'hunter') {
    add('req.hunter_id = ?', user.id);
  } else if (user.role === 'lister') {
    add('req.lister_id = ?', user.id);
  }

  if (query.status) {
    add('req.status = ?', String(query.status).toUpperCase());
  }

  if (query.hunterId) {
    add('req.hunter_id = ?', query.hunterId);
  }

  if (query.listerId) {
    add('req.lister_id = ?', query.listerId);
  }

  if (query.accountId) {
    add('COALESCE(req.account_id, product.account_used) = ?', query.accountId);
  }

  if (query.issueType) {
    add('req.issue_type = ?', String(query.issueType).toUpperCase());
  }

  if (query.dateFrom) {
    add('req.created_at >= ?', query.dateFrom);
  }

  if (query.dateTo) {
    add("req.created_at < (?::date + INTERVAL '1 day')", query.dateTo);
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    where.push(`(
      req.asin ILIKE $${index}
      OR COALESCE(req.product_title, '') ILIKE $${index}
      OR COALESCE(req.requested_changes, '') ILIKE $${index}
      OR COALESCE(req.issue_reason, '') ILIKE $${index}
      OR COALESCE(hunter.name, '') ILIKE $${index}
      OR COALESCE(lister.name, '') ILIKE $${index}
      OR COALESCE(account.name, '') ILIKE $${index}
      OR COALESCE(issue_order.order_code, '') ILIKE $${index}
      OR COALESCE(issue_order.ebay_order_id, '') ILIKE $${index}
    )`);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
};

const getChangeRequestRecord = async (user, id, { forUpdate = false } = {}) => {
  await ensureChangeRequestTable();
  const filters = buildFilters(user, {});
  const params = [...filters.params, id];
  const where = [filters.whereSql ? filters.whereSql.replace(/^WHERE\s+/i, '') : 'TRUE', `req.id = $${params.length}`];

  const lockSql = forUpdate ? 'FOR UPDATE OF req' : '';
  const result = await pool.query(
    `
      SELECT ${changeRequestSelect}
      ${changeRequestJoins}
      WHERE ${where.join(' AND ')}
      LIMIT 1
      ${lockSql}
    `,
    params,
  );

  if (!result.rows[0]) {
    throw new AppError('Change request not found.', 404);
  }

  return parseChangeRequestRow(result.rows[0]);
};

const listChangeRequests = async (user, query = {}) => {
  await ensureChangeRequestTable();
  const filters = buildFilters(user, query);
  const defaultLimit = await getConfiguredLimit('products', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        ${changeRequestSelect}
      ${changeRequestJoins}
      ${filters.whereSql}
      ORDER BY
        CASE req.status
          WHEN 'OPEN' THEN 1
          WHEN 'IN_PROGRESS' THEN 2
          WHEN 'FIXED' THEN 3
          WHEN 'REJECTED' THEN 4
          ELSE 5
        END,
        req.created_at DESC
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );

  const total = result.rows[0]?.totalCount || 0;
  return {
    items: result.rows.map(parseChangeRequestRow),
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

const getChangeRequestById = async (user, id) => getChangeRequestRecord(user, id);

const getChangeRequestSummary = async (user) => {
  await ensureChangeRequestTable();
  const filters = buildFilters(user);
  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE req.status IN ('OPEN', 'IN_PROGRESS'))::int AS pending,
        COUNT(*) FILTER (WHERE req.status = 'OPEN')::int AS open,
        COUNT(*) FILTER (WHERE req.status = 'IN_PROGRESS')::int AS "inProgress",
        COUNT(*) FILTER (WHERE req.status = 'FIXED')::int AS fixed,
        COUNT(*) FILTER (WHERE req.status = 'REJECTED')::int AS rejected,
        COUNT(*) FILTER (WHERE req.status = 'CLOSED')::int AS closed,
        COUNT(*) FILTER (WHERE req.status = 'FIXED' AND req.resolved_at::date = CURRENT_DATE)::int AS "fixedToday"
      ${changeRequestJoins}
      ${filters.whereSql}
    `,
    filters.params,
  );

  const row = result.rows[0] || {};

  return {
    total: row.total || 0,
    pending: row.pending || 0,
    completed: (row.fixed || 0) + (row.closed || 0),
    open: row.open || 0,
    inProgress: row.inProgress || 0,
    fixed: row.fixed || 0,
    rejected: row.rejected || 0,
    closed: row.closed || 0,
    fixedToday: row.fixedToday || 0,
  };
};

const createChangeRequest = async (user, payload = {}) => {
  await ensureChangeRequestTable();
  const asin = String(payload.asin || '').trim().toUpperCase();
  const requestedChanges = String(payload.requestedChanges || payload.details || '').trim();

  if (!asin) {
    throw new AppError('ASIN is required.', 400);
  }

  if (requestedChanges.length < 5) {
    throw new AppError('Please describe the requested changes in a little more detail.', 400);
  }

  const productResult = await pool.query(
    `
      SELECT
        p.id,
        p.asin,
        p.title,
        p.assigned_lister_id AS "assignedListerId",
        p.listed_by AS "listedBy",
        p.account_used AS "accountId",
        p.amazon_url AS "amazonUrl",
        p.ebay_url AS "ebayUrl",
        p.ebay_price AS "currentPrice",
        listing.listing_url AS "listingUrl"
      FROM products p
      LEFT JOIN listings listing ON listing.product_id = p.id
      WHERE p.hunter_id = $1
        AND p.asin = $2
        AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT 1
    `,
    [user.id, asin],
  );

  const product = productResult.rows[0];

  if (!product) {
    throw new AppError('We could not find one of your products with this ASIN.', 404);
  }

  const resolvedListerId = product.assignedListerId || product.listedBy || null;
  const result = await pool.query(
    `
      INSERT INTO product_change_requests (
        product_id,
        hunter_id,
        lister_id,
        account_id,
        asin,
        product_title,
        requested_changes,
        issue_type,
        issue_reason,
        current_amazon_link,
        current_ebay_link,
        current_price,
        status,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'OTHER', $7, $8, $9, $10, 'OPEN', $11, NOW(), NOW())
      RETURNING id
    `,
    [
      product.id,
      user.id,
      resolvedListerId,
      product.accountId,
      asin,
      product.title || null,
      requestedChanges,
      product.amazonUrl || null,
      product.listingUrl || product.ebayUrl || null,
      product.currentPrice === null ? null : Number(product.currentPrice),
      user.id,
    ],
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'PRODUCT_CHANGE_REQUEST_CREATED',
    targetType: 'change_request',
    targetId: result.rows[0].id,
    details: {
      asin,
      productId: product.id,
      listerId: resolvedListerId,
      source: 'hunter_request',
    },
  });

  return getChangeRequestById(user, result.rows[0].id);
};

const createLinkedChangeRequest = async ({
  actorUserId = null,
  productId,
  orderId = null,
  hunterId,
  listerId = null,
  accountId = null,
  asin,
  productTitle = null,
  issueType = 'OTHER',
  issueReason,
  requestedChanges = null,
  currentAmazonLink = null,
  currentEbayLink = null,
  currentPrice = null,
}) => {
  await ensureChangeRequestTable();
  const resolvedAsin = String(asin || '').trim().toUpperCase();
  const resolvedIssueReason = String(issueReason || requestedChanges || '').trim();
  const resolvedRequestedChanges =
    String(requestedChanges || `${formatStatusLabel(issueType)}: ${resolvedIssueReason}` || '').trim();

  if (!productId || !hunterId || !resolvedAsin || resolvedRequestedChanges.length < 5) {
    return null;
  }

  const existing = await pool.query(
    `
      SELECT id
      FROM product_change_requests
      WHERE product_id = $1
        AND COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid) =
            COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status IN ('OPEN', 'IN_PROGRESS')
        AND LOWER(COALESCE(issue_reason, '')) = LOWER($3)
      LIMIT 1
    `,
    [productId, orderId, resolvedIssueReason],
  );

  if (existing.rowCount > 0) {
    return existing.rows[0].id;
  }

  const result = await pool.query(
    `
      INSERT INTO product_change_requests (
        product_id,
        order_id,
        hunter_id,
        lister_id,
        account_id,
        asin,
        product_title,
        requested_changes,
        issue_type,
        issue_reason,
        current_amazon_link,
        current_ebay_link,
        current_price,
        status,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, 'OPEN', $14, NOW(), NOW()
      )
      RETURNING id
    `,
    [
      productId,
      orderId,
      hunterId,
      listerId,
      accountId,
      resolvedAsin,
      productTitle || null,
      resolvedRequestedChanges,
      issueType,
      resolvedIssueReason,
      currentAmazonLink,
      currentEbayLink,
      currentPrice,
      actorUserId,
    ],
  );

  await writeAuditLog({
    actorUserId,
    action: 'PRODUCT_CHANGE_REQUEST_CREATED',
    targetType: 'change_request',
    targetId: result.rows[0].id,
    details: {
      asin: resolvedAsin,
      productId,
      orderId,
      listerId,
      issueType,
      source: 'order_issue',
    },
  });

  return result.rows[0].id;
};

const startChangeRequest = async (user, id) => {
  const changeRequest = await getChangeRequestRecord(user, id, { forUpdate: true });

  if (!['lister', 'admin', 'super_admin'].includes(user.role)) {
    throw new AppError('You do not have permission to start this change request.', 403);
  }

  if (changeRequest.status !== 'OPEN') {
    return changeRequest;
  }

  await pool.query(
    `
      UPDATE product_change_requests
      SET status = 'IN_PROGRESS',
          started_at = COALESCE(started_at, NOW()),
          started_by = COALESCE(started_by, $2),
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, user.id],
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'PRODUCT_CHANGE_REQUEST_STARTED',
    targetType: 'change_request',
    targetId: id,
    details: {
      orderId: changeRequest.orderId,
      productId: changeRequest.productId,
      issueType: changeRequest.issueType,
    },
  });

  return getChangeRequestById(user, id);
};

const resolveOrderAfterFix = async (orderId, resolvedBy) => {
  if (!orderId) {
    return;
  }

  await pool.query(
    `
      UPDATE orders
      SET issue_status = 'FIXED',
          issue_resolved_at = NOW(),
          issue_resolved_by = $2,
          notes = CONCAT_WS(E'\n', NULLIF(notes, ''), 'Product fixed by assigned lister.'),
          order_status = CASE
            WHEN order_status <> 'ISSUE' THEN order_status
            WHEN delivered_date IS NOT NULL THEN 'DELIVERED'
            WHEN COALESCE(tracking_number, '') <> '' THEN 'SHIPPED'
            WHEN placement_status = 'PLACED' OR COALESCE(amazon_order_id, amazon_order_link) IS NOT NULL THEN 'PLACED'
            ELSE 'NEW'
          END,
          updated_by = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [orderId, resolvedBy],
  );
};

const fixChangeRequest = async (user, id, payload = {}) => {
  const changeRequest = await getChangeRequestRecord(user, id, { forUpdate: true });

  if (!['lister', 'admin', 'super_admin'].includes(user.role)) {
    throw new AppError('You do not have permission to fix this change request.', 403);
  }

  const newAmazonLink = toText(payload.newAmazonLink);
  const newEbayLink = toText(payload.newEbayLink);
  const newPrice = toMoney(payload.newPrice);
  const newStockCount = toInteger(payload.newStockCount);
  const notes = toText(payload.notes) || toText(payload.completionNotes);

  if (newAmazonLink && !isValidMarketplaceUrl(newAmazonLink, 'amazon')) {
    throw new AppError('Enter a valid Amazon URL for the updated product.', 400);
  }

  if (newEbayLink && !isValidMarketplaceUrl(newEbayLink, 'ebay')) {
    throw new AppError('Enter a valid eBay URL for the updated listing.', 400);
  }

  if (
    !newAmazonLink &&
    !newEbayLink &&
    newPrice === null &&
    newStockCount === null &&
    !notes
  ) {
    throw new AppError('Add at least one fix detail before submitting.', 400);
  }

  await pool.query(
    `
      UPDATE products
      SET amazon_url = COALESCE($2, amazon_url),
          ebay_url = COALESCE($3, ebay_url),
          ebay_price = COALESCE($4, ebay_price),
          stock_quantity = COALESCE($5, stock_quantity),
          updated_at = NOW()
      WHERE id = $1
    `,
    [changeRequest.productId, newAmazonLink, newEbayLink, newPrice, newStockCount],
  );

  if (newEbayLink) {
    await pool.query(
      `
        UPDATE listings
        SET listing_url = $2,
            updated_at = NOW()
        WHERE product_id = $1
      `,
      [changeRequest.productId, newEbayLink],
    );
  }

  await pool.query(
    `
      UPDATE product_change_requests
      SET status = 'FIXED',
          new_amazon_link = COALESCE($2, new_amazon_link),
          new_ebay_link = COALESCE($3, new_ebay_link),
          new_price = COALESCE($4, new_price),
          new_stock_count = COALESCE($5, new_stock_count),
          notes = $6,
          completion_notes = $6,
          resolved_at = NOW(),
          resolved_by = $7,
          completed_at = NOW(),
          completed_by = $7,
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, newAmazonLink, newEbayLink, newPrice, newStockCount, notes, user.id],
  );

  await resolveOrderAfterFix(changeRequest.orderId, user.id);

  await writeAuditLog({
    actorUserId: user.id,
    action: 'PRODUCT_CHANGE_REQUEST_FIXED',
    targetType: 'change_request',
    targetId: id,
    details: {
      orderId: changeRequest.orderId,
      productId: changeRequest.productId,
      issueType: changeRequest.issueType,
    },
  });

  if (changeRequest.orderId) {
    await writeAuditLog({
      actorUserId: user.id,
      action: 'ORDER_ISSUE_FIXED',
      targetType: 'order',
      targetId: changeRequest.orderId,
      details: {
        productId: changeRequest.productId,
        changeRequestId: id,
      },
    });
  }

  const blockStatus = await getListerBlockStatus(changeRequest.listerId);
  if (!blockStatus.blocked && changeRequest.listerId) {
    await writeAuditLog({
      actorUserId: user.id,
      action: 'LISTER_UNBLOCKED_FROM_LISTING',
      targetType: 'user',
      targetId: changeRequest.listerId,
      details: {
        changeRequestId: id,
      },
    });
  }

  return getChangeRequestById(user, id);
};

const rejectChangeRequest = async (user, id, payload = {}) => {
  const changeRequest = await getChangeRequestRecord(user, id, { forUpdate: true });

  if (!['lister', 'admin', 'super_admin'].includes(user.role)) {
    throw new AppError('You do not have permission to reject this change request.', 403);
  }

  const rejectedReason = toText(payload.rejectedReason) || toText(payload.notes);

  if (!rejectedReason) {
    throw new AppError('Notes are required when rejecting a change request.', 400);
  }

  await pool.query(
    `
      UPDATE product_change_requests
      SET status = 'REJECTED',
          rejected_reason = $2,
          notes = $2,
          resolved_at = NOW(),
          resolved_by = $3,
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, rejectedReason, user.id],
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'PRODUCT_CHANGE_REQUEST_REJECTED',
    targetType: 'change_request',
    targetId: id,
    details: {
      orderId: changeRequest.orderId,
      productId: changeRequest.productId,
      rejectedReason,
    },
  });

  return getChangeRequestById(user, id);
};

const reassignChangeRequest = async (user, id, payload = {}) => {
  if (!['admin', 'super_admin'].includes(user.role)) {
    throw new AppError('Only Admin can reassign change requests.', 403);
  }

  const listerId = toText(payload.listerId);

  if (!listerId) {
    throw new AppError('Lister is required for reassignment.', 400);
  }

  const changeRequest = await getChangeRequestRecord(user, id, { forUpdate: true });

  await pool.query(
    `
      UPDATE product_change_requests
      SET lister_id = $2,
          status = CASE WHEN status = 'REJECTED' THEN 'OPEN' ELSE status END,
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, listerId],
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'PRODUCT_CHANGE_REQUEST_REASSIGNED',
    targetType: 'change_request',
    targetId: id,
    details: {
      fromListerId: changeRequest.listerId,
      toListerId: listerId,
      orderId: changeRequest.orderId,
    },
  });

  return getChangeRequestById(user, id);
};

const closeChangeRequest = async (user, id, payload = {}) => {
  if (!['admin', 'super_admin'].includes(user.role)) {
    throw new AppError('Only Admin can close change requests.', 403);
  }

  const notes = toText(payload.notes);
  await getChangeRequestRecord(user, id, { forUpdate: true });

  await pool.query(
    `
      UPDATE product_change_requests
      SET status = 'CLOSED',
          notes = COALESCE($2, notes),
          resolved_at = COALESCE(resolved_at, NOW()),
          resolved_by = COALESCE(resolved_by, $3),
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, notes, user.id],
  );

  return getChangeRequestById(user, id);
};

const getListerBlockStatus = async (listerId) => {
  if (!listerId) {
    return { blocked: false, openRequests: 0 };
  }

  await ensureChangeRequestTable();
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS "openRequests"
      FROM product_change_requests
      WHERE lister_id = $1
        AND status IN ('OPEN', 'IN_PROGRESS')
    `,
    [listerId],
  );

  const openRequests = result.rows[0]?.openRequests || 0;
  return {
    blocked: openRequests > 0,
    openRequests,
  };
};

const assertListerListingUnblocked = async (listerId) => {
  const blockStatus = await getListerBlockStatus(listerId);

  if (!blockStatus.blocked) {
    return blockStatus;
  }

  throw new AppError(
    `You have ${blockStatus.openRequests} product change request${blockStatus.openRequests === 1 ? '' : 's'} pending. Please fix them before listing new products.`,
    409,
    blockStatus,
  );
};

module.exports = {
  CHANGE_REQUEST_STATUSES,
  ISSUE_TYPES,
  OPEN_STATUSES,
  ensureChangeRequestTable,
  listChangeRequests,
  getChangeRequestById,
  getChangeRequestSummary,
  createChangeRequest,
  createLinkedChangeRequest,
  startChangeRequest,
  fixChangeRequest,
  rejectChangeRequest,
  reassignChangeRequest,
  closeChangeRequest,
  getListerBlockStatus,
  assertListerListingUnblocked,
};
