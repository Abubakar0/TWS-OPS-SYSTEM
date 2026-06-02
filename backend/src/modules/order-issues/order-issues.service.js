const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');
const { getConfiguredLimit } = require('../system/system.service');
const { writeAuditLog } = require('../users/audit.service');
const { ensureOrdersTable, ISSUE_TYPES, ISSUE_STATUSES, ORDER_IMPACTS, hasGlobalOrderReadAccess } = require('../orders/orders.service');

const toText = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const buildAccessFilters = (user, query = {}) => {
  const where = ["(o.issue_status IS NOT NULL OR o.order_status = 'ISSUE')"];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (!hasGlobalOrderReadAccess(user)) {
    if (user.role === 'hunter') {
      add('o.hunter_id = ?', user.id);
    } else if (user.role === 'lister') {
      add('o.lister_id = ?', user.id);
    } else if (user.role === 'order_processor' || user.permissions?.canProcessOrders) {
      add('o.created_by = ?', user.id);
    } else {
      throw new AppError('You do not have access to order issues.', 403);
    }
  }

  if (query.issueType) {
    add('o.issue_type = ?', String(query.issueType).toUpperCase());
  }

  if (query.status) {
    add('o.issue_status = ?', String(query.status).toUpperCase());
  }

  if (query.hunterId) {
    add('o.hunter_id = ?', query.hunterId);
  }

  if (query.listerId) {
    add('o.lister_id = ?', query.listerId);
  }

  if (query.accountId) {
    add('o.account_id = ?', query.accountId);
  }

  if (query.dateFrom) {
    add('o.order_date >= ?', query.dateFrom);
  }

  if (query.dateTo) {
    add("o.order_date < (?::date + INTERVAL '1 day')", query.dateTo);
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    where.push(`(
      COALESCE(o.order_code, '') ILIKE $${index}
      OR COALESCE(o.ebay_order_id, '') ILIKE $${index}
      OR COALESCE(o.asin, '') ILIKE $${index}
      OR COALESCE(o.product_title, '') ILIKE $${index}
      OR COALESCE(o.issue_reason, '') ILIKE $${index}
      OR COALESCE(hunter.name, '') ILIKE $${index}
      OR COALESCE(lister.name, '') ILIKE $${index}
      OR COALESCE(account.name, '') ILIKE $${index}
    )`);
  }

  return {
    whereSql: `WHERE ${where.join(' AND ')}`,
    params,
  };
};

const issueSelect = `
  o.id,
  o.order_code AS "orderCode",
  o.ebay_order_id AS "ebayOrderId",
  o.product_id AS "productId",
  o.asin,
  o.product_title AS "productTitle",
  o.hunter_id AS "hunterId",
  hunter.name AS "hunterName",
  o.lister_id AS "listerId",
  lister.name AS "listerName",
  o.account_id AS "accountId",
  account.name AS "accountName",
  o.sale_price AS "salePrice",
  o.total_cost AS "totalCost",
  o.profit,
  o.roi,
  o.order_date AS "orderDate",
  o.order_status AS "orderStatus",
  o.issue_type AS "issueType",
  o.issue_reason AS "issueReason",
  COALESCE(o.issue_status, CASE WHEN o.order_status = 'ISSUE' THEN 'OPEN' ELSE NULL END) AS "issueStatus",
  o.order_impact AS "orderImpact",
  o.issue_created_at AS "issueCreatedAt",
  o.issue_created_by AS "issueCreatedBy",
  issue_creator.name AS "issueCreatedByName",
  o.issue_resolved_at AS "issueResolvedAt",
  o.issue_resolved_by AS "issueResolvedBy",
  issue_resolver.name AS "issueResolvedByName",
  o.notes,
  o.amazon_order_id AS "amazonOrderId",
  o.amazon_order_link AS "amazonOrderLink",
  o.tracking_number AS "trackingNumber",
  o.carrier,
  product.amazon_url AS "productAmazonUrl",
  product.ebay_url AS "productEbayUrl",
  listing.listing_url AS "listingUrl",
  change_request.id AS "changeRequestId",
  change_request.status AS "changeRequestStatus"
`;

const issueJoins = `
  FROM orders o
  LEFT JOIN products product ON product.id = o.product_id
  LEFT JOIN listings listing ON listing.product_id = o.product_id
  LEFT JOIN users hunter ON hunter.id = o.hunter_id
  LEFT JOIN users lister ON lister.id = o.lister_id
  LEFT JOIN accounts account ON account.id = o.account_id
  LEFT JOIN users issue_creator ON issue_creator.id = o.issue_created_by
  LEFT JOIN users issue_resolver ON issue_resolver.id = o.issue_resolved_by
  LEFT JOIN LATERAL (
    SELECT req.id, req.status
    FROM product_change_requests req
    WHERE req.order_id = o.id
    ORDER BY req.created_at DESC
    LIMIT 1
  ) change_request ON TRUE
`;

const mapIssueRow = (row) => ({
  ...row,
  salePrice: Number(row.salePrice || 0),
  totalCost: Number(row.totalCost || 0),
  profit: Number(row.profit || 0),
  roi: Number(row.roi || 0),
});

const getIssueById = async (user, id) => {
  await ensureOrdersTable();
  const filters = buildAccessFilters(user);
  const params = [...filters.params, id];
  const result = await pool.query(
    `
      SELECT ${issueSelect}
      ${issueJoins}
      ${filters.whereSql} AND o.id = $${params.length}
      LIMIT 1
    `,
    params,
  );

  if (!result.rows[0]) {
    throw new AppError('Order issue not found.', 404);
  }

  return mapIssueRow(result.rows[0]);
};

const listOrderIssues = async (user, query = {}) => {
  await ensureOrdersTable();
  const filters = buildAccessFilters(user, query);
  const defaultLimit = await getConfiguredLimit('orders', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        ${issueSelect}
      ${issueJoins}
      ${filters.whereSql}
      ORDER BY o.issue_created_at DESC NULLS LAST, o.updated_at DESC
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );

  const total = result.rows[0]?.totalCount || 0;
  return {
    items: result.rows.map(mapIssueRow),
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

const restoreOrderStatusSql = `
  CASE
    WHEN o.order_status <> 'ISSUE' THEN o.order_status
    WHEN o.delivered_date IS NOT NULL THEN 'DELIVERED'
    WHEN COALESCE(o.tracking_number, '') <> '' THEN 'SHIPPED'
    WHEN o.placement_status = 'PLACED' OR COALESCE(o.amazon_order_id, o.amazon_order_link) IS NOT NULL THEN 'PLACED'
    ELSE 'NEW'
  END
`;

const updateOrderIssue = async (user, id, payload = {}) => {
  if (!['admin', 'super_admin', 'order_processor'].includes(user.role)) {
    throw new AppError('You do not have permission to update order issues.', 403);
  }

  const current = await getIssueById(user, id);
  const issueType = toText(payload.issueType)
    ? String(payload.issueType).toUpperCase()
    : current.issueType;
  const issueStatus = toText(payload.issueStatus)
    ? String(payload.issueStatus).toUpperCase()
    : current.issueStatus;
  const issueReason = toText(payload.issueReason) || current.issueReason;
  const orderImpact = toText(payload.orderImpact) || current.orderImpact;
  const notes = toText(payload.notes);

  if (issueType && !ISSUE_TYPES.includes(issueType)) {
    throw new AppError('Invalid order issue type.', 400);
  }

  if (issueStatus && !ISSUE_STATUSES.includes(issueStatus)) {
    throw new AppError('Invalid order issue status.', 400);
  }

  if (orderImpact && !ORDER_IMPACTS.includes(orderImpact)) {
    throw new AppError('Invalid order impact.', 400);
  }

  await pool.query(
    `
      UPDATE orders o
      SET issue_type = $2,
          issue_reason = $3,
          issue_status = $4,
          order_impact = $5,
          notes = COALESCE($6, o.notes),
          issue_resolved_at = CASE WHEN $4 IN ('FIXED', 'CLOSED', 'REJECTED') THEN NOW() ELSE o.issue_resolved_at END,
          issue_resolved_by = CASE WHEN $4 IN ('FIXED', 'CLOSED', 'REJECTED') THEN $7 ELSE o.issue_resolved_by END,
          order_status = CASE WHEN $4 IN ('FIXED', 'CLOSED') THEN ${restoreOrderStatusSql} ELSE o.order_status END,
          updated_by = $7,
          updated_at = NOW()
      WHERE o.id = $1
    `,
    [id, issueType, issueReason, issueStatus, orderImpact, notes, user.id],
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'ORDER_ISSUE_UPDATED',
    targetType: 'order',
    targetId: id,
    details: {
      issueType,
      issueStatus,
      orderImpact,
    },
  });

  return getIssueById(user, id);
};

const closeOrderIssue = async (user, id, payload = {}) => {
  if (!['admin', 'super_admin', 'order_processor'].includes(user.role)) {
    throw new AppError('You do not have permission to close order issues.', 403);
  }

  await getIssueById(user, id);
  await pool.query(
    `
      UPDATE orders o
      SET issue_status = 'CLOSED',
          notes = CONCAT_WS(E'\n', NULLIF(o.notes, ''), NULLIF($2, '')),
          issue_resolved_at = NOW(),
          issue_resolved_by = $3,
          order_status = ${restoreOrderStatusSql},
          updated_by = $3,
          updated_at = NOW()
      WHERE o.id = $1
    `,
    [id, toText(payload.notes), user.id],
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'ORDER_ISSUE_CLOSED',
    targetType: 'order',
    targetId: id,
    details: {},
  });

  return getIssueById(user, id);
};

module.exports = {
  listOrderIssues,
  getIssueById,
  updateOrderIssue,
  closeOrderIssue,
};
