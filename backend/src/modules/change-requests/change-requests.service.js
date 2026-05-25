const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');
const { getConfiguredLimit } = require('../system/system.service');
const { writeAuditLog } = require('../users/audit.service');

const ensureChangeRequestTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_change_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      hunter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lister_id UUID REFERENCES users(id) ON DELETE SET NULL,
      asin TEXT NOT NULL,
      product_title TEXT,
      requested_changes TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
      completion_notes TEXT,
      completed_by UUID REFERENCES users(id),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_product_change_requests_hunter_id
      ON product_change_requests(hunter_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_product_change_requests_lister_id
      ON product_change_requests(lister_id)
  `);
};

const changeRequestSelect = `
  req.id,
  req.product_id AS "productId",
  req.hunter_id AS "hunterId",
  hunter.name AS "hunterName",
  hunter.email AS "hunterEmail",
  req.lister_id AS "listerId",
  lister.name AS "listerName",
  lister.email AS "listerEmail",
  req.asin,
  req.product_title AS "productTitle",
  req.requested_changes AS "requestedChanges",
  req.status,
  req.completion_notes AS "completionNotes",
  req.completed_by AS "completedBy",
  completed_user.name AS "completedByName",
  req.completed_at AS "completedAt",
  req.created_at AS "createdAt",
  req.updated_at AS "updatedAt",
  product.account_used AS "accountId",
  account.name AS "accountName",
  product.status AS "productStatus",
  listing.listing_url AS "listingUrl"
`;

const changeRequestJoins = `
  FROM product_change_requests req
  JOIN products product ON product.id = req.product_id
  JOIN users hunter ON hunter.id = req.hunter_id
  LEFT JOIN users lister ON lister.id = req.lister_id
  LEFT JOIN users completed_user ON completed_user.id = req.completed_by
  LEFT JOIN accounts account ON account.id = product.account_used
  LEFT JOIN listings listing ON listing.product_id = product.id
`;

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
    add('req.status = ?', query.status);
  }

  if (query.hunterId) {
    add('req.hunter_id = ?', query.hunterId);
  }

  if (query.listerId) {
    add('req.lister_id = ?', query.listerId);
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    where.push(`(
      req.asin ILIKE $${index}
      OR req.product_title ILIKE $${index}
      OR req.requested_changes ILIKE $${index}
      OR hunter.name ILIKE $${index}
      OR COALESCE(lister.name, '') ILIKE $${index}
      OR COALESCE(account.name, '') ILIKE $${index}
    )`);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
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
          WHEN 'pending' THEN 1
          ELSE 2
        END,
        req.created_at DESC
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );

  const total = result.rows[0]?.totalCount || 0;
  return {
    items: result.rows,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

const getChangeRequestSummary = async (user) => {
  await ensureChangeRequestTable();
  const filters = buildFilters(user);
  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE req.status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE req.status = 'completed')::int AS completed
      ${changeRequestJoins}
      ${filters.whereSql}
    `,
    filters.params,
  );

  return result.rows[0] || { total: 0, pending: 0, completed: 0 };
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
        p.listed_by AS "listedBy"
      FROM products p
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
        asin,
        product_title,
        requested_changes,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())
      RETURNING id
    `,
    [product.id, user.id, resolvedListerId, asin, product.title || null, requestedChanges],
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'product.change_request.create',
    targetType: 'change_request',
    targetId: result.rows[0].id,
    details: {
      asin,
      productId: product.id,
      listerId: resolvedListerId,
    },
  });

  const created = await listChangeRequests(user, { page: 1, limit: 1, search: asin });
  return created.items.find((request) => request.id === result.rows[0].id) || created.items[0];
};

const completeChangeRequest = async (user, id, payload = {}) => {
  await ensureChangeRequestTable();
  const completionNotes = String(payload.completionNotes || '').trim() || null;
  const params = [id, user.id, completionNotes];
  let accessSql = '';

  if (user.role === 'lister') {
    params.push(user.id);
    accessSql = `AND req.lister_id = $${params.length}`;
  }

  const result = await pool.query(
    `
      UPDATE product_change_requests req
      SET status = 'completed',
          completion_notes = $3,
          completed_by = $2,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE req.id = $1
        AND req.status = 'pending'
        ${accessSql}
      RETURNING req.id
    `,
    params,
  );

  if (result.rowCount === 0) {
    throw new AppError('This change request is not available for completion.', 404);
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: 'product.change_request.complete',
    targetType: 'change_request',
    targetId: id,
    details: {
      completionNotes,
    },
  });

  const list = await listChangeRequests(user, { page: 1, limit: 20 });
  return list.items.find((request) => request.id === id) || null;
};

module.exports = {
  listChangeRequests,
  getChangeRequestSummary,
  createChangeRequest,
  completeChangeRequest,
};
