const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');
const { getConfiguredLimit } = require('../system/system.service');
const { writeAuditLog } = require('../users/audit.service');
const { createLinkedChangeRequest } = require('../change-requests/change-requests.service');

const ORDER_LIMIT_CATEGORY = 'orders';
const ORDER_STATUSES = ['NEW', 'READY_TO_PLACE', 'PLACED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'ISSUE', 'ON_HOLD'];
const PLACEMENT_STATUSES = ['NOT_PLACED', 'PLACED', 'FAILED', 'CANCELLED'];
const PAYMENT_STATUSES = ['PAID', 'PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED'];
const MATCH_STATUSES = ['matched', 'unmatched'];
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
const ISSUE_STATUSES = ['OPEN', 'IN_REVIEW', 'FIXED', 'REJECTED', 'CLOSED'];
const ORDER_IMPACTS = [
  'Product unavailable',
  'Product in loss',
  'Price changed',
  'Stock not enough',
  'Wrong listing/product',
  'Other',
];

const hasOrderWriteAccess = (user) =>
  ['admin', 'super_admin', 'order_processor'].includes(user.role) || Boolean(user.permissions?.canProcessOrders);

const hasGlobalOrderReadAccess = (user) =>
  ['admin', 'super_admin'].includes(user.role) || Boolean(user.permissions?.canViewAllOrders);

const toMoney = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toInteger = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toText = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const toUpper = (value) => {
  const normalized = toText(value);
  return normalized ? normalized.toUpperCase() : null;
};

const toBooleanText = (value, allowedValues, fallback) => {
  const normalized = toUpper(value);

  if (!normalized) {
    return fallback;
  }

  if (!allowedValues.includes(normalized)) {
    throw new AppError(`Invalid value: ${normalized}.`, 400);
  }

  return normalized;
};

const isClosedOrderStatus = (status) => ['CANCELLED', 'REFUNDED'].includes(status);

const hasOpenIssue = (order) =>
  Boolean(
    order &&
    order.orderStatus === 'ISSUE' &&
    (!order.issueStatus || ['OPEN', 'IN_REVIEW'].includes(order.issueStatus)),
  );

const isPlacedOrder = (order) =>
  Boolean(
    order &&
    (order.placementStatus === 'PLACED' ||
      order.orderStatus === 'PLACED' ||
      order.orderStatus === 'SHIPPED' ||
      order.orderStatus === 'DELIVERED' ||
      order.placedDate),
  );

const SIMPLE_ORDER_STATUSES = ['NEW', 'READY_TO_PLACE', 'ON_HOLD', 'CANCELLED', 'REFUNDED'];

const isValidHttpUrl = (value, marketplace = null) => {
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

const computeFinancials = ({
  salePrice,
  ebayFee,
  amazonBuyingPrice,
  supplierShippingCost,
  otherCost,
}) => {
  const safeSalePrice = toMoney(salePrice, 0);
  const safeFee = toMoney(ebayFee, 0);
  const safeBuying = toMoney(amazonBuyingPrice, 0);
  const safeSupplierShipping = toMoney(supplierShippingCost, 0);
  const safeOtherCost = toMoney(otherCost, 0);
  const totalCost = safeBuying + safeSupplierShipping + safeOtherCost;
  const profit = safeSalePrice - safeFee - totalCost;
  const roi = safeBuying > 0 ? (profit / safeBuying) * 100 : 0;

  return {
    totalCost,
    profit,
    roi,
  };
};

const orderSelect = `
  o.id,
  o.order_code AS "orderCode",
  o.ebay_order_id AS "ebayOrderId",
  o.ebay_item_id AS "ebayItemId",
  o.ebay_listing_url AS "ebayListingUrl",
  o.product_id AS "productId",
  o.asin,
  o.product_title AS "productTitle",
  o.custom_label AS "customLabel",
  product.category AS "productCategory",
  o.hunter_id AS "hunterId",
  hunter.name AS "hunterName",
  o.lister_id AS "listerId",
  lister.name AS "listerName",
  o.account_id AS "accountId",
  account.name AS "accountName",
  account.marketplace AS "accountMarketplace",
  o.buyer_name AS "buyerName",
  o.buyer_country AS "buyerCountry",
  o.buyer_state AS "buyerState",
  o.buyer_city AS "buyerCity",
  o.quantity,
  o.sale_price AS "salePrice",
  o.ebay_fee AS "ebayFee",
  o.shipping_charged AS "shippingCharged",
  o.tax_collected AS "taxCollected",
  o.amazon_buying_price AS "amazonBuyingPrice",
  o.supplier_shipping_cost AS "supplierShippingCost",
  o.other_cost AS "otherCost",
  o.total_cost AS "totalCost",
  o.profit,
  o.roi,
  o.currency,
  o.order_date AS "orderDate",
  o.payment_date AS "paymentDate",
  o.expected_ship_date AS "expectedShipDate",
  o.placed_date AS "placedDate",
  o.delivered_date AS "deliveredDate",
  o.tracking_number AS "trackingNumber",
  o.carrier,
  o.amazon_order_id AS "amazonOrderId",
  o.amazon_order_link AS "amazonOrderLink",
  o.supplier_order_status AS "supplierOrderStatus",
  o.order_status AS "orderStatus",
  o.placement_status AS "placementStatus",
  o.payment_status AS "paymentStatus",
  o.match_status AS "matchStatus",
  o.issue_type AS "issueType",
  o.issue_status AS "issueStatus",
  o.order_impact AS "orderImpact",
  o.notes,
  o.issue_reason AS "issueReason",
  o.issue_created_at AS "issueCreatedAt",
  o.issue_created_by AS "issueCreatedBy",
  issue_creator.name AS "issueCreatedByName",
  o.issue_resolved_at AS "issueResolvedAt",
  o.issue_resolved_by AS "issueResolvedBy",
  issue_resolver.name AS "issueResolvedByName",
  o.created_by AS "createdBy",
  creator.name AS "createdByName",
  o.updated_by AS "updatedBy",
  updater.name AS "updatedByName",
  o.deleted_by AS "deletedBy",
  deleter.name AS "deletedByName",
  o.deleted_at AS "deletedAt",
  o.delete_reason AS "deleteReason",
  o.created_at AS "createdAt",
  o.updated_at AS "updatedAt",
  product.amazon_url AS "productAmazonUrl",
  product.ebay_url AS "productEbayUrl",
  listing.listing_url AS "listingUrl",
  listing.item_id AS "listingItemId"
`;

const orderJoins = `
  FROM orders o
  LEFT JOIN products product ON product.id = o.product_id
  LEFT JOIN listings listing ON listing.product_id = o.product_id
  LEFT JOIN users hunter ON hunter.id = o.hunter_id
  LEFT JOIN users lister ON lister.id = o.lister_id
  LEFT JOIN accounts account ON account.id = o.account_id
  LEFT JOIN users creator ON creator.id = o.created_by
  LEFT JOIN users updater ON updater.id = o.updated_by
  LEFT JOIN users deleter ON deleter.id = o.deleted_by
  LEFT JOIN users issue_creator ON issue_creator.id = o.issue_created_by
  LEFT JOIN users issue_resolver ON issue_resolver.id = o.issue_resolved_by
`;

const orderCandidateSelect = `
  p.id,
  p.asin,
  p.title,
  p.custom_label AS "customLabel",
  p.category,
  p.hunter_id AS "hunterId",
  hunter.name AS "hunterName",
  p.assigned_lister_id AS "listerId",
  lister.name AS "listerName",
  COALESCE(listing.account_id, p.account_used) AS "accountId",
  account.name AS "accountName",
  p.amazon_url AS "amazonUrl",
  p.ebay_url AS "ebayUrl",
  listing.listing_url AS "listingUrl",
  listing.item_id AS "itemId",
  p.profit,
  p.roi,
  p.status
`;

const mapOrderRow = (row) => ({
  ...row,
  quantity: Number(row.quantity || 0),
  salePrice: Number(row.salePrice || 0),
  ebayFee: row.ebayFee === null ? null : Number(row.ebayFee),
  shippingCharged: row.shippingCharged === null ? null : Number(row.shippingCharged),
  taxCollected: row.taxCollected === null ? null : Number(row.taxCollected),
  amazonBuyingPrice: Number(row.amazonBuyingPrice || 0),
  supplierShippingCost: row.supplierShippingCost === null ? null : Number(row.supplierShippingCost),
  otherCost: row.otherCost === null ? null : Number(row.otherCost),
  totalCost: Number(row.totalCost || 0),
  profit: Number(row.profit || 0),
  roi: Number(row.roi || 0),
});

const ensureOrdersTable = async () => {
  await pool.query(`
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
      order_status TEXT NOT NULL DEFAULT 'NEW',
      placement_status TEXT NOT NULL DEFAULT 'NOT_PLACED',
      payment_status TEXT NOT NULL DEFAULT 'PENDING',
      match_status TEXT NOT NULL DEFAULT 'matched',
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
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS order_code TEXT,
      ADD COLUMN IF NOT EXISTS ebay_order_id TEXT,
      ADD COLUMN IF NOT EXISTS ebay_item_id TEXT,
      ADD COLUMN IF NOT EXISTS ebay_listing_url TEXT,
      ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS asin TEXT,
      ADD COLUMN IF NOT EXISTS product_title TEXT,
      ADD COLUMN IF NOT EXISTS custom_label TEXT,
      ADD COLUMN IF NOT EXISTS hunter_id UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS lister_id UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id),
      ADD COLUMN IF NOT EXISTS buyer_name TEXT,
      ADD COLUMN IF NOT EXISTS buyer_country TEXT,
      ADD COLUMN IF NOT EXISTS buyer_state TEXT,
      ADD COLUMN IF NOT EXISTS buyer_city TEXT,
      ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ebay_fee NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS shipping_charged NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS tax_collected NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS amazon_buying_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS supplier_shipping_cost NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS other_cost NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS profit NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS roi NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
      ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS expected_ship_date TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS placed_date TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS delivered_date TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS tracking_number TEXT,
      ADD COLUMN IF NOT EXISTS carrier TEXT,
      ADD COLUMN IF NOT EXISTS amazon_order_id TEXT,
      ADD COLUMN IF NOT EXISTS amazon_order_link TEXT,
      ADD COLUMN IF NOT EXISTS supplier_order_status TEXT NOT NULL DEFAULT 'NOT_PLACED',
      ADD COLUMN IF NOT EXISTS order_status TEXT NOT NULL DEFAULT 'NEW',
      ADD COLUMN IF NOT EXISTS placement_status TEXT NOT NULL DEFAULT 'NOT_PLACED',
      ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS match_status TEXT NOT NULL DEFAULT 'matched',
      ADD COLUMN IF NOT EXISTS issue_type TEXT,
      ADD COLUMN IF NOT EXISTS issue_status TEXT,
      ADD COLUMN IF NOT EXISTS order_impact TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS issue_reason TEXT,
      ADD COLUMN IF NOT EXISTS issue_created_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS issue_created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS issue_resolved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS issue_resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS delete_reason TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    UPDATE orders
    SET order_code = COALESCE(order_code, 'ORD-' || UPPER(SUBSTRING(id::text, 1, 8))),
        match_status = COALESCE(match_status, CASE WHEN product_id IS NULL THEN 'unmatched' ELSE 'matched' END),
        order_status = COALESCE(order_status, 'NEW'),
        placement_status = COALESCE(placement_status, 'NOT_PLACED'),
        payment_status = COALESCE(payment_status, 'PENDING'),
        supplier_order_status = COALESCE(supplier_order_status, 'NOT_PLACED')
    WHERE order_code IS NULL
       OR match_status IS NULL
       OR order_status IS NULL
       OR placement_status IS NULL
       OR payment_status IS NULL
       OR supplier_order_status IS NULL
  `);

  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_ebay_order_id_unique ON orders (LOWER(ebay_order_id))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_hunter_id ON orders(hunter_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_lister_id ON orders(lister_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_account_id ON orders(account_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_placement_status ON orders(placement_status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at)`);
};

const buildAccessFilters = (user, query = {}, { column = 'o.order_date' } = {}) => {
  const where = [];
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
      throw new AppError('You do not have access to orders.', 403);
    }
  }

  const deletedState = query.deletedState || 'active';

  if (deletedState === 'deleted') {
    where.push('o.deleted_at IS NOT NULL');
  } else if (deletedState !== 'all') {
    where.push('o.deleted_at IS NULL');
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

  if (query.category) {
    add('EXISTS (SELECT 1 FROM products p WHERE p.id = o.product_id AND p.category = ?)', query.category);
  }

  if (query.status) {
    add('o.order_status = ?', query.status);
  }

  if (query.placementStatus) {
    add('o.placement_status = ?', query.placementStatus);
  }

  if (query.asin) {
    add('o.asin = ?', String(query.asin).trim().toUpperCase());
  }

  if (query.ebayOrderId) {
    add('LOWER(o.ebay_order_id) = LOWER(?)', String(query.ebayOrderId).trim());
  }

  if (query.amazonOrderId) {
    add('LOWER(COALESCE(o.amazon_order_id, \'\')) = LOWER(?)', String(query.amazonOrderId).trim());
  }

  if (query.unmatched === 'true') {
    where.push("o.match_status = 'unmatched'");
  }

  if (query.dateFrom) {
    add(`${column} >= ?`, query.dateFrom);
  }

  if (query.dateTo) {
    add(`${column} < (?::date + INTERVAL '1 day')`, query.dateTo);
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    where.push(`(
      o.ebay_order_id ILIKE $${index}
      OR COALESCE(o.ebay_item_id, '') ILIKE $${index}
      OR COALESCE(o.amazon_order_id, '') ILIKE $${index}
      OR COALESCE(o.product_title, '') ILIKE $${index}
      OR COALESCE(o.asin, '') ILIKE $${index}
      OR COALESCE(hunter.name, '') ILIKE $${index}
      OR COALESCE(lister.name, '') ILIKE $${index}
      OR COALESCE(account.name, '') ILIKE $${index}
      OR COALESCE(o.notes, '') ILIKE $${index}
    )`);
  }

  if (query.minProfit !== undefined && query.minProfit !== null && query.minProfit !== '') {
    add('o.profit >= ?', toMoney(query.minProfit, 0));
  }

  if (query.maxProfit !== undefined && query.maxProfit !== null && query.maxProfit !== '') {
    add('o.profit <= ?', toMoney(query.maxProfit, 0));
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
};

const findDuplicateOrder = async ({ ebayOrderId, ebayItemId, excludeId = null }) => {
  const params = [String(ebayOrderId).trim().toLowerCase()];
  let sql = `
    SELECT id, order_status AS "orderStatus"
    FROM orders
    WHERE LOWER(ebay_order_id) = $1
      AND deleted_at IS NULL
  `;

  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }

  if (ebayItemId) {
    params.push(String(ebayItemId).trim().toLowerCase());
    sql += ` AND (
      LOWER(COALESCE(ebay_item_id, '')) = $${params.length}
      OR COALESCE(ebay_item_id, '') = ''
    )`;
  }

  sql += ' LIMIT 1';
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
};

const matchProducts = async (query = {}, { limit = 10 } = {}) => {
  await ensureOrdersTable();
  const params = [];
  const conditions = ['p.deleted_at IS NULL'];
  const scoreParts = [];
  const add = (sql, value, scoreSql = null) => {
    params.push(value);
    const placeholder = `$${params.length}`;
    conditions.push(sql.replace('?', placeholder));

    if (scoreSql) {
      scoreParts.push(scoreSql.replaceAll('?', placeholder));
    }
  };

  if (query.productId) {
    add('p.id = ?::uuid', query.productId, '100');
  }

  if (query.customLabel) {
    add('p.custom_label ILIKE ?', `%${String(query.customLabel).trim()}%`, "CASE WHEN LOWER(COALESCE(p.custom_label, '')) = LOWER(?) THEN 80 ELSE 40 END");
  }

  if (query.asin) {
    add('p.asin = ?', String(query.asin).trim().toUpperCase(), '90');
  }

  if (query.ebayListingUrl) {
    add('COALESCE(listing.listing_url, p.ebay_url) ILIKE ?', `%${String(query.ebayListingUrl).trim()}%`, '70');
  }

  if (query.ebayItemId) {
    add('listing.item_id ILIKE ?', `%${String(query.ebayItemId).trim()}%`, '75');
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    conditions.push(`(
      p.title ILIKE $${index}
      OR COALESCE(p.custom_label, '') ILIKE $${index}
      OR COALESCE(p.asin, '') ILIKE $${index}
      OR COALESCE(listing.listing_url, '') ILIKE $${index}
      OR COALESCE(listing.item_id, '') ILIKE $${index}
    )`);
    scoreParts.push(`CASE WHEN p.title ILIKE $${index} THEN 30 ELSE 0 END`);
    scoreParts.push(`CASE WHEN COALESCE(p.custom_label, '') ILIKE $${index} THEN 45 ELSE 0 END`);
  }

  if (query.title) {
    params.push(`%${String(query.title).trim()}%`);
    const index = params.length;
    conditions.push(`p.title ILIKE $${index}`);
    scoreParts.push(`CASE WHEN p.title ILIKE $${index} THEN 35 ELSE 0 END`);
  }

  const sql = `
    SELECT
      ${orderCandidateSelect},
      (${scoreParts.length ? scoreParts.join(' + ') : '0'})::int AS score
    FROM products p
    JOIN users hunter ON hunter.id = p.hunter_id
    LEFT JOIN users lister ON lister.id = COALESCE(p.assigned_lister_id, p.listed_by)
    LEFT JOIN listings listing ON listing.product_id = p.id
    LEFT JOIN accounts account ON account.id = COALESCE(listing.account_id, p.account_used)
    WHERE ${conditions.join(' AND ')}
    ORDER BY score DESC, p.created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 25)}
  `;
  const result = await pool.query(sql, params);
  return result.rows;
};

const getMatchedProduct = async (payload = {}) => {
  if (payload.productId) {
    const result = await matchProducts({ productId: payload.productId }, { limit: 1 });
    return result[0] || null;
  }

  const candidates = await matchProducts(
    {
      customLabel: payload.customLabel,
      asin: payload.asin,
      ebayListingUrl: payload.ebayListingUrl,
      ebayItemId: payload.ebayItemId,
      title: payload.productTitle,
      search: payload.search,
    },
    { limit: 1 },
  );

  return candidates[0] || null;
};

const validateUrls = (payload) => {
  if (!isValidHttpUrl(payload.ebayListingUrl, 'ebay')) {
    throw new AppError('Enter a valid eBay listing URL.', 400);
  }

  if (!isValidHttpUrl(payload.amazonOrderLink, 'amazon')) {
    throw new AppError('Enter a valid Amazon order URL.', 400);
  }
};

const prepareOrderPayload = async (payload, { existingOrder = null } = {}) => {
  validateUrls(payload);
  const isCreate = !existingOrder;

  const quantity = toInteger(payload.quantity, existingOrder?.quantity ?? 1);

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError('Quantity must be a whole number greater than zero.', 400);
  }

  const matchedProduct = await getMatchedProduct(payload);
  const hunterId = payload.hunterId || matchedProduct?.hunterId || existingOrder?.hunterId || null;
  const listerId = payload.listerId || matchedProduct?.listerId || existingOrder?.listerId || null;
  const accountId = payload.accountId || matchedProduct?.accountId || existingOrder?.accountId || null;
  const productId = matchedProduct?.id || payload.productId || existingOrder?.productId || null;
  const asin = toUpper(payload.asin) || matchedProduct?.asin || existingOrder?.asin || null;
  const productTitle = toText(payload.productTitle) || matchedProduct?.title || existingOrder?.productTitle || null;
  const customLabel = toText(payload.customLabel) || matchedProduct?.customLabel || existingOrder?.customLabel || null;
  const matchStatus = matchedProduct || productId ? 'matched' : 'unmatched';
  const shouldPersistIssueState = Boolean(
    toText(payload.issueReason) ||
      toText(payload.orderImpact) ||
      existingOrder?.issueStatus ||
      existingOrder?.issueReason ||
      existingOrder?.orderStatus === 'ISSUE',
  );
  const issueType = shouldPersistIssueState
    ? toBooleanText(payload.issueType, ISSUE_TYPES, existingOrder?.issueType || 'OTHER')
    : null;
  const issueStatus = shouldPersistIssueState
    ? toBooleanText(payload.issueStatus, ISSUE_STATUSES, existingOrder?.issueStatus || null)
    : existingOrder?.issueStatus || null;
  const orderImpact = shouldPersistIssueState
    ? toText(payload.orderImpact) || existingOrder?.orderImpact || null
    : null;

  if (!accountId) {
    throw new AppError('Account is required.', 400);
  }

  if (!asin) {
    throw new AppError('ASIN is required.', 400);
  }

  const ebayOrderId = toText(payload.ebayOrderId) || existingOrder?.ebayOrderId;

  if (!ebayOrderId) {
    throw new AppError('eBay Order ID is required.', 400);
  }

  const orderDate = payload.orderDate || existingOrder?.orderDate || new Date().toISOString();

  const salePrice = toMoney(payload.salePrice, existingOrder?.salePrice ?? 0);

  if (salePrice <= 0) {
    throw new AppError('Sale price is required.', 400);
  }

  const amazonBuyingPrice = toMoney(payload.amazonBuyingPrice, existingOrder?.amazonBuyingPrice ?? 0);

  if (amazonBuyingPrice <= 0) {
    throw new AppError('Purchasing price is required.', 400);
  }

  const amazonOrderId = toText(payload.amazonOrderId) || existingOrder?.amazonOrderId || null;

  if (isCreate && !amazonOrderId) {
    throw new AppError('Amazon Order ID is required.', 400);
  }

  const ebayFee = toMoney(payload.ebayFee, existingOrder?.ebayFee ?? 0);
  const supplierShippingCost = toMoney(payload.supplierShippingCost, existingOrder?.supplierShippingCost ?? 0);
  const otherCost = toMoney(payload.otherCost, existingOrder?.otherCost ?? 0);

  const financials = computeFinancials({
    salePrice,
    ebayFee,
    amazonBuyingPrice,
    supplierShippingCost,
    otherCost,
  });

  return {
    ebayOrderId,
    ebayItemId: toText(payload.ebayItemId) || existingOrder?.ebayItemId || null,
    ebayListingUrl: toText(payload.ebayListingUrl) || existingOrder?.ebayListingUrl || null,
    productId,
    asin,
    productTitle,
    customLabel,
    hunterId,
    listerId,
    accountId,
    buyerName: toText(payload.buyerName) || existingOrder?.buyerName || null,
    buyerCountry: toText(payload.buyerCountry) || existingOrder?.buyerCountry || null,
    buyerState: toText(payload.buyerState) || existingOrder?.buyerState || null,
    buyerCity: toText(payload.buyerCity) || existingOrder?.buyerCity || null,
    quantity,
    salePrice,
    ebayFee,
    shippingCharged: toMoney(payload.shippingCharged, existingOrder?.shippingCharged ?? 0),
    taxCollected: toMoney(payload.taxCollected, existingOrder?.taxCollected ?? 0),
    amazonBuyingPrice,
    supplierShippingCost,
    otherCost,
    totalCost: financials.totalCost,
    profit: financials.profit,
    roi: financials.roi,
    currency: toText(payload.currency) || existingOrder?.currency || 'USD',
    orderDate,
    paymentDate: payload.paymentDate || existingOrder?.paymentDate || null,
    expectedShipDate: payload.expectedShipDate || existingOrder?.expectedShipDate || null,
    placedDate: payload.placedDate || existingOrder?.placedDate || null,
    deliveredDate: payload.deliveredDate || existingOrder?.deliveredDate || null,
    trackingNumber: toText(payload.trackingNumber) || existingOrder?.trackingNumber || null,
    carrier: toText(payload.carrier) || existingOrder?.carrier || null,
    amazonOrderId,
    amazonOrderLink: toText(payload.amazonOrderLink) || existingOrder?.amazonOrderLink || null,
    supplierOrderStatus:
      toBooleanText(payload.supplierOrderStatus, [...PLACEMENT_STATUSES, ...ORDER_STATUSES], existingOrder?.supplierOrderStatus || 'NOT_PLACED'),
    orderStatus: toBooleanText(payload.orderStatus, ORDER_STATUSES, existingOrder?.orderStatus || 'NEW'),
    placementStatus: toBooleanText(payload.placementStatus, PLACEMENT_STATUSES, existingOrder?.placementStatus || 'NOT_PLACED'),
    paymentStatus: toBooleanText(payload.paymentStatus, PAYMENT_STATUSES, existingOrder?.paymentStatus || 'PENDING'),
    matchStatus,
    issueType,
    issueStatus,
    orderImpact,
    notes: toText(payload.notes) || existingOrder?.notes || null,
    issueReason: shouldPersistIssueState
      ? toText(payload.issueReason) || existingOrder?.issueReason || null
      : null,
    matchedProduct,
  };
};

const listOrders = async (user, query = {}) => {
  await ensureOrdersTable();
  const filters = buildAccessFilters(user, query);
  const defaultLimit = await getConfiguredLimit(ORDER_LIMIT_CATEGORY, query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT COUNT(*) OVER()::int AS "totalCount", ${orderSelect}
      ${orderJoins}
      ${filters.whereSql}
      ORDER BY o.order_date DESC, o.created_at DESC
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );

  const items = result.rows.map(mapOrderRow);
  const total = result.rows[0]?.totalCount || 0;

  return {
    items,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

const getOrderById = async (user, id, { includeDeleted = false } = {}) => {
  await ensureOrdersTable();
  const filters = buildAccessFilters(
    user,
    { deletedState: includeDeleted ? 'all' : 'active' },
    { column: 'o.order_date' },
  );
  filters.params.push(id);

  const result = await pool.query(
    `
      SELECT ${orderSelect}
      ${orderJoins}
      ${filters.whereSql ? `${filters.whereSql} AND o.id = $${filters.params.length}` : `WHERE o.id = $${filters.params.length}`}
      LIMIT 1
    `,
    filters.params,
  );

  if (result.rowCount === 0) {
    throw new AppError('Order not found.', 404);
  }

  return mapOrderRow(result.rows[0]);
};

const listOrderActivity = async (user, id, { limit = 20 } = {}) => {
  await getOrderById(user, id, { includeDeleted: true });
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 5), 100);
  const result = await pool.query(
    `
      SELECT
        log.id::text AS id,
        log.action,
        log.target_id AS "targetId",
        log.details,
        log.created_at AS "createdAt",
        actor.id AS "actorUserId",
        actor.name AS "actorName",
        actor.email AS "actorEmail",
        actor.role AS "actorRole"
      FROM audit_logs log
      LEFT JOIN users actor ON actor.id = log.actor_user_id
      WHERE log.target_type = 'order'
        AND log.target_id = $1
      ORDER BY log.created_at DESC
      LIMIT $2
    `,
    [id, safeLimit],
  );

  return result.rows.map((row) => ({
    ...row,
    details: row.details && typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
  }));
};

const createOrder = async (user, payload = {}) => {
  await ensureOrdersTable();

  if (!hasOrderWriteAccess(user)) {
    throw new AppError('You do not have permission to create orders.', 403);
  }

  const normalized = await prepareOrderPayload(payload);
  const duplicate = await findDuplicateOrder({
    ebayOrderId: normalized.ebayOrderId,
    ebayItemId: normalized.ebayItemId,
  });

  if (duplicate) {
    throw new AppError('This eBay order already exists.', 409);
  }

  const result = await pool.query(
    `
      INSERT INTO orders (
        ebay_order_id,
        ebay_item_id,
        ebay_listing_url,
        product_id,
        asin,
        product_title,
        custom_label,
        hunter_id,
        lister_id,
        account_id,
        buyer_name,
        buyer_country,
        buyer_state,
        buyer_city,
        quantity,
        sale_price,
        ebay_fee,
        shipping_charged,
        tax_collected,
        amazon_buying_price,
        supplier_shipping_cost,
        other_cost,
        total_cost,
        profit,
        roi,
        currency,
        order_date,
        payment_date,
        expected_ship_date,
        placed_date,
        delivered_date,
        tracking_number,
        carrier,
        amazon_order_id,
        amazon_order_link,
        supplier_order_status,
        order_status,
        placement_status,
        payment_status,
        match_status,
        issue_type,
        issue_status,
        order_impact,
        notes,
        issue_reason,
        issue_created_at,
        issue_created_by,
        issue_resolved_at,
        issue_resolved_by,
        created_by,
        updated_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
        $41, $42, $43, $44, $45, $46, $47, $48, $49, $50,
        $51
      )
      RETURNING id
    `,
    [
      normalized.ebayOrderId,
      normalized.ebayItemId,
      normalized.ebayListingUrl,
      normalized.productId,
      normalized.asin,
      normalized.productTitle,
      normalized.customLabel,
      normalized.hunterId,
      normalized.listerId,
      normalized.accountId,
      normalized.buyerName,
      normalized.buyerCountry,
      normalized.buyerState,
      normalized.buyerCity,
      normalized.quantity,
      normalized.salePrice,
      normalized.ebayFee,
      normalized.shippingCharged,
      normalized.taxCollected,
      normalized.amazonBuyingPrice,
      normalized.supplierShippingCost,
      normalized.otherCost,
      normalized.totalCost,
      normalized.profit,
      normalized.roi,
      normalized.currency,
      normalized.orderDate,
      normalized.paymentDate,
      normalized.expectedShipDate,
      normalized.placedDate,
      normalized.deliveredDate,
      normalized.trackingNumber,
      normalized.carrier,
      normalized.amazonOrderId,
      normalized.amazonOrderLink,
      normalized.supplierOrderStatus,
      normalized.orderStatus,
      normalized.placementStatus,
      normalized.paymentStatus,
      normalized.matchStatus,
      normalized.issueType,
      normalized.issueStatus,
      normalized.orderImpact,
      normalized.notes,
      normalized.issueReason,
      null,
      null,
      null,
      null,
      user.id,
      user.id,
    ],
  );

  const order = await getOrderById(user, result.rows[0].id, { includeDeleted: true });

  await writeAuditLog({
    actorUserId: user.id,
    action: 'order.create',
    targetType: 'order',
    targetId: order.id,
    details: {
      orderCode: order.orderCode,
      ebayOrderId: order.ebayOrderId,
      hunterName: order.hunterName,
      accountName: order.accountName,
      matchStatus: order.matchStatus,
    },
  });

  return order;
};

const updateOrder = async (user, id, payload = {}) => {
  await ensureOrdersTable();

  if (!hasOrderWriteAccess(user)) {
    throw new AppError('You do not have permission to update orders.', 403);
  }

  const existingOrder = await getOrderById(user, id, { includeDeleted: true });

  if (existingOrder.deletedAt) {
    throw new AppError('Deleted orders cannot be updated.', 400);
  }

  const normalized = await prepareOrderPayload(payload, { existingOrder });
  const duplicate = await findDuplicateOrder({
    ebayOrderId: normalized.ebayOrderId,
    ebayItemId: normalized.ebayItemId,
    excludeId: id,
  });

  if (duplicate) {
    throw new AppError('This eBay order already exists.', 409);
  }

  await pool.query(
    `
      UPDATE orders
      SET ebay_order_id = $1,
          ebay_item_id = $2,
          ebay_listing_url = $3,
          product_id = $4,
          asin = $5,
          product_title = $6,
          custom_label = $7,
          hunter_id = $8,
          lister_id = $9,
          account_id = $10,
          buyer_name = $11,
          buyer_country = $12,
          buyer_state = $13,
          buyer_city = $14,
          quantity = $15,
          sale_price = $16,
          ebay_fee = $17,
          shipping_charged = $18,
          tax_collected = $19,
          amazon_buying_price = $20,
          supplier_shipping_cost = $21,
          other_cost = $22,
          total_cost = $23,
          profit = $24,
          roi = $25,
          currency = $26,
          order_date = $27,
          payment_date = $28,
          expected_ship_date = $29,
          placed_date = $30,
          delivered_date = $31,
          tracking_number = $32,
          carrier = $33,
          amazon_order_id = $34,
          amazon_order_link = $35,
          supplier_order_status = $36,
          order_status = $37,
          placement_status = $38,
          payment_status = $39,
          match_status = $40,
          issue_type = $41,
          issue_status = $42,
          order_impact = $43,
          notes = $44,
          issue_reason = $45,
          updated_by = $46,
          updated_at = NOW()
      WHERE id = $47
    `,
    [
      normalized.ebayOrderId,
      normalized.ebayItemId,
      normalized.ebayListingUrl,
      normalized.productId,
      normalized.asin,
      normalized.productTitle,
      normalized.customLabel,
      normalized.hunterId,
      normalized.listerId,
      normalized.accountId,
      normalized.buyerName,
      normalized.buyerCountry,
      normalized.buyerState,
      normalized.buyerCity,
      normalized.quantity,
      normalized.salePrice,
      normalized.ebayFee,
      normalized.shippingCharged,
      normalized.taxCollected,
      normalized.amazonBuyingPrice,
      normalized.supplierShippingCost,
      normalized.otherCost,
      normalized.totalCost,
      normalized.profit,
      normalized.roi,
      normalized.currency,
      normalized.orderDate,
      normalized.paymentDate,
      normalized.expectedShipDate,
      normalized.placedDate,
      normalized.deliveredDate,
      normalized.trackingNumber,
      normalized.carrier,
      normalized.amazonOrderId,
      normalized.amazonOrderLink,
      normalized.supplierOrderStatus,
      normalized.orderStatus,
      normalized.placementStatus,
      normalized.paymentStatus,
      normalized.matchStatus,
      normalized.issueType,
      normalized.issueStatus,
      normalized.orderImpact,
      normalized.notes,
      normalized.issueReason,
      user.id,
      id,
    ],
  );

  const order = await getOrderById(user, id, { includeDeleted: true });

  await writeAuditLog({
    actorUserId: user.id,
    action: 'order.update',
    targetType: 'order',
    targetId: order.id,
    details: {
      orderCode: order.orderCode,
      ebayOrderId: order.ebayOrderId,
      orderStatus: order.orderStatus,
      placementStatus: order.placementStatus,
    },
  });

  return order;
};

const markOrderPlaced = async (user, id, payload = {}) => {
  if (!hasOrderWriteAccess(user)) {
    throw new AppError('You do not have permission to place orders.', 403);
  }

  const order = await getOrderById(user, id, { includeDeleted: true });

  if (order.deletedAt) {
    throw new AppError('Deleted orders cannot be updated.', 409);
  }

  if (order.placementStatus === 'PLACED') {
    throw new AppError('This order is already marked as placed.', 409);
  }

  if (isClosedOrderStatus(order.orderStatus) || order.orderStatus === 'SHIPPED' || order.orderStatus === 'DELIVERED') {
    throw new AppError('Only active pre-shipment orders can be marked as placed.', 409);
  }

  if (order.orderStatus === 'ISSUE' || hasOpenIssue(order)) {
    throw new AppError('Resolve the active issue before marking this order as placed.', 409);
  }

  const amazonBuyingPrice = payload.amazonBuyingPrice !== undefined ? toMoney(payload.amazonBuyingPrice, 0) : order.amazonBuyingPrice;
  const amazonOrderId = toText(payload.amazonOrderId) || order.amazonOrderId || null;
  const amazonOrderLink = toText(payload.amazonOrderLink) || order.amazonOrderLink || null;

  if (amazonBuyingPrice <= 0) {
    throw new AppError('Amazon buying price is required before marking the order as placed.', 400);
  }

  if (!amazonOrderId) {
    throw new AppError('Add an Amazon order ID before marking the order as placed.', 400);
  }

  const financials = computeFinancials({
    salePrice: order.salePrice,
    ebayFee: order.ebayFee,
    amazonBuyingPrice,
    supplierShippingCost:
      payload.supplierShippingCost !== undefined ? toMoney(payload.supplierShippingCost, 0) : order.supplierShippingCost,
    otherCost: payload.otherCost !== undefined ? toMoney(payload.otherCost, 0) : order.otherCost,
  });

  await pool.query(
    `
      UPDATE orders
      SET amazon_order_id = $1,
          amazon_order_link = $2,
          amazon_buying_price = $3,
          supplier_shipping_cost = $4,
          other_cost = $5,
          total_cost = $6,
          profit = $7,
          roi = $8,
          placed_date = COALESCE($9, NOW()),
          placement_status = 'PLACED',
          supplier_order_status = 'PLACED',
          order_status = CASE WHEN order_status = 'DELIVERED' THEN order_status ELSE 'PLACED' END,
          updated_by = $10,
          updated_at = NOW()
      WHERE id = $11
        AND deleted_at IS NULL
    `,
    [
      amazonOrderId,
      amazonOrderLink,
      amazonBuyingPrice,
      payload.supplierShippingCost !== undefined ? toMoney(payload.supplierShippingCost, 0) : order.supplierShippingCost,
      payload.otherCost !== undefined ? toMoney(payload.otherCost, 0) : order.otherCost,
      financials.totalCost,
      financials.profit,
      financials.roi,
      payload.placedDate || null,
      user.id,
      id,
    ],
  );

  const updated = await getOrderById(user, id);
  await writeAuditLog({
    actorUserId: user.id,
    action: 'ORDER_PLACED',
    targetType: 'order',
    targetId: id,
    details: {
      orderCode: updated.orderCode,
      amazonOrderId: updated.amazonOrderId,
    },
  });
  return updated;
};

const markOrderShipped = async (user, id, payload = {}) => {
  if (!hasOrderWriteAccess(user)) {
    throw new AppError('You do not have permission to ship orders.', 403);
  }

  const order = await getOrderById(user, id, { includeDeleted: true });

  if (order.deletedAt) {
    throw new AppError('Deleted orders cannot be updated.', 409);
  }

  if (order.orderStatus === 'SHIPPED') {
    throw new AppError('This order is already marked as shipped.', 409);
  }

  if (order.orderStatus === 'DELIVERED') {
    throw new AppError('Delivered orders cannot be marked as shipped again.', 409);
  }

  if (isClosedOrderStatus(order.orderStatus) || order.orderStatus === 'ISSUE') {
    throw new AppError('This order cannot be marked as shipped in its current state.', 409);
  }

  if (!isPlacedOrder(order)) {
    throw new AppError('Order must be placed before it can be marked as shipped.', 409);
  }

  const trackingNumber = toText(payload.trackingNumber) || order.trackingNumber;
  const carrier = toText(payload.carrier) || order.carrier;

  if (!trackingNumber || !carrier) {
    throw new AppError('Tracking number and carrier are required before marking the order as shipped.', 400);
  }

  await pool.query(
    `
      UPDATE orders
      SET tracking_number = $1,
          carrier = $2,
          order_status = 'SHIPPED',
          supplier_order_status = 'SHIPPED',
          updated_by = $3,
          updated_at = NOW()
      WHERE id = $4
        AND deleted_at IS NULL
    `,
    [trackingNumber, carrier, user.id, id],
  );

  const updated = await getOrderById(user, id);
  await writeAuditLog({
    actorUserId: user.id,
    action: 'ORDER_SHIPPED',
    targetType: 'order',
    targetId: id,
    details: {
      orderCode: updated.orderCode,
      trackingNumber: updated.trackingNumber,
      carrier: updated.carrier,
    },
  });
  return updated;
};

const markOrderDelivered = async (user, id, payload = {}) => {
  if (!hasOrderWriteAccess(user)) {
    throw new AppError('You do not have permission to mark delivery.', 403);
  }

  const order = await getOrderById(user, id, { includeDeleted: true });

  if (order.deletedAt) {
    throw new AppError('Deleted orders cannot be updated.', 409);
  }

  if (order.orderStatus === 'DELIVERED') {
    throw new AppError('This order is already marked as delivered.', 409);
  }

  if (isClosedOrderStatus(order.orderStatus)) {
    throw new AppError('Cancelled or refunded orders cannot be marked as delivered.', 409);
  }

  if (order.orderStatus !== 'SHIPPED') {
    throw new AppError('Only shipped orders can be marked as delivered.', 409);
  }

  await pool.query(
    `
      UPDATE orders
      SET order_status = 'DELIVERED',
          delivered_date = COALESCE($1, NOW()),
          supplier_order_status = 'DELIVERED',
          updated_by = $2,
          updated_at = NOW()
      WHERE id = $3
        AND deleted_at IS NULL
    `,
    [payload.deliveredDate || null, user.id, id],
  );

  const updated = await getOrderById(user, id);
  await writeAuditLog({
    actorUserId: user.id,
    action: 'ORDER_DELIVERED',
    targetType: 'order',
    targetId: id,
    details: {
      orderCode: updated.orderCode,
    },
  });
  return updated;
};

const updateOrderStatus = async (user, id, payload = {}) => {
  if (!hasOrderWriteAccess(user)) {
    throw new AppError('You do not have permission to update order status.', 403);
  }

  const nextStatus = toBooleanText(payload.orderStatus, ORDER_STATUSES, null);

  if (!nextStatus) {
    throw new AppError('Order status is required.', 400);
  }

  switch (nextStatus) {
    case 'PLACED':
      return markOrderPlaced(user, id, payload);
    case 'SHIPPED':
      return markOrderShipped(user, id, payload);
    case 'DELIVERED':
      return markOrderDelivered(user, id, payload);
    case 'ISSUE':
      return markOrderIssue(user, id, payload);
    case 'NEW':
    case 'READY_TO_PLACE':
    case 'ON_HOLD':
    case 'CANCELLED':
    case 'REFUNDED':
      break;
    default:
      throw new AppError('Unsupported order status transition.', 400);
  }

  const existingOrder = await getOrderById(user, id, { includeDeleted: true });

  if (existingOrder.deletedAt) {
    throw new AppError('Deleted orders cannot be updated.', 409);
  }

  if (existingOrder.orderStatus === nextStatus) {
    throw new AppError(`This order is already marked as ${nextStatus.replaceAll('_', ' ').toLowerCase()}.`, 409);
  }

  if (nextStatus === 'NEW' && !['ON_HOLD', 'READY_TO_PLACE', 'ISSUE'].includes(existingOrder.orderStatus)) {
    throw new AppError('Only on-hold, ready-to-place, or issue orders can be reset to new.', 409);
  }

  if (nextStatus === 'READY_TO_PLACE' && (isClosedOrderStatus(existingOrder.orderStatus) || isPlacedOrder(existingOrder))) {
    throw new AppError('Only active unplaced orders can move to ready-to-place.', 409);
  }

  if (nextStatus === 'ON_HOLD' && (isClosedOrderStatus(existingOrder.orderStatus) || existingOrder.orderStatus === 'DELIVERED')) {
    throw new AppError('Delivered, cancelled, or refunded orders cannot be placed on hold.', 409);
  }

  if (nextStatus === 'CANCELLED' && (isClosedOrderStatus(existingOrder.orderStatus) || existingOrder.orderStatus === 'DELIVERED')) {
    throw new AppError('Delivered or already closed orders cannot be cancelled.', 409);
  }

  if (nextStatus === 'REFUNDED' && !['DELIVERED', 'CANCELLED', 'ISSUE'].includes(existingOrder.orderStatus)) {
    throw new AppError('Only delivered, cancelled, or issue orders can be refunded.', 409);
  }

  const nextPlacementStatus =
    nextStatus === 'CANCELLED'
      ? 'CANCELLED'
      : nextStatus === 'NEW' || nextStatus === 'READY_TO_PLACE' || nextStatus === 'ON_HOLD'
        ? existingOrder.placementStatus === 'CANCELLED'
          ? 'NOT_PLACED'
          : existingOrder.placementStatus
        : existingOrder.placementStatus;
  const nextPaymentStatus = nextStatus === 'REFUNDED' ? 'REFUNDED' : existingOrder.paymentStatus;

  await pool.query(
    `
      UPDATE orders
      SET order_status = $1,
          placement_status = $2,
          payment_status = $3,
          updated_by = $4,
          updated_at = NOW()
      WHERE id = $5
        AND deleted_at IS NULL
    `,
    [nextStatus, nextPlacementStatus, nextPaymentStatus, user.id, id],
  );

  const updated = await getOrderById(user, id);
  await writeAuditLog({
    actorUserId: user.id,
    action:
      nextStatus === 'CANCELLED'
        ? 'ORDER_CANCELLED'
        : nextStatus === 'REFUNDED'
          ? 'ORDER_REFUNDED'
          : nextStatus === 'ON_HOLD'
            ? 'ORDER_ON_HOLD'
            : 'ORDER_STATUS_UPDATED',
    targetType: 'order',
    targetId: id,
    details: {
      orderCode: updated.orderCode,
      orderStatus: updated.orderStatus,
    },
  });
  return updated;
};

const bulkUpdateOrderStatus = async (user, payload = {}) => {
  if (!hasOrderWriteAccess(user)) {
    throw new AppError('You do not have permission to bulk update orders.', 403);
  }

  const ids = Array.from(
    new Set((Array.isArray(payload.ids) ? payload.ids : []).map((entry) => String(entry || '').trim()).filter(Boolean)),
  );
  if (!ids.length) {
    throw new AppError('Select at least one order.', 400);
  }

  const orderStatus = toBooleanText(payload.orderStatus, [...SIMPLE_ORDER_STATUSES, 'DELIVERED'], null);
  if (!orderStatus) {
    throw new AppError('Bulk status is required.', 400);
  }

  const updated = [];
  const skipped = [];

  for (const orderId of ids) {
    try {
      const order =
        orderStatus === 'DELIVERED'
          ? await markOrderDelivered(user, orderId, payload)
          : await updateOrderStatus(user, orderId, { orderStatus });
      updated.push(order);
    } catch (error) {
      skipped.push({
        id: orderId,
        message: error?.message || 'Could not update order.',
      });
    }
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: 'ORDER_BULK_UPDATED',
    targetType: 'order',
    details: {
      ids,
      orderStatus,
      updatedCount: updated.length,
      skippedCount: skipped.length,
    },
  });

  return {
    updated,
    skipped,
    requested: ids.length,
  };
};

const markOrderIssue = async (user, id, payload = {}) => {
  if (!hasOrderWriteAccess(user)) {
    throw new AppError('You do not have permission to flag order issues.', 403);
  }

  const issueType = toBooleanText(payload.issueType, ISSUE_TYPES, null);
  const issueReason = toText(payload.issueReason);
  const orderImpact = toText(payload.orderImpact);

  if (!issueType) {
    throw new AppError('Issue type is required.', 400);
  }

  if (!issueReason) {
    throw new AppError('Issue reason is required.', 400);
  }

  if (!orderImpact || !ORDER_IMPACTS.includes(orderImpact)) {
    throw new AppError('Order impact is required.', 400);
  }

  const existingOrder = await getOrderById(user, id, { includeDeleted: true });

  if (existingOrder.deletedAt) {
    throw new AppError('Deleted orders cannot be updated.', 409);
  }

  if (isClosedOrderStatus(existingOrder.orderStatus)) {
    throw new AppError('Cancelled or refunded orders cannot be flagged as issues.', 409);
  }

  if (hasOpenIssue(existingOrder)) {
    throw new AppError('This order already has an open issue.', 409);
  }

  await pool.query(
    `
      UPDATE orders
      SET order_status = 'ISSUE',
          issue_type = $1,
          issue_reason = $2,
          issue_status = 'OPEN',
          order_impact = $3,
          issue_created_at = COALESCE(issue_created_at, NOW()),
          issue_created_by = COALESCE(issue_created_by, $4),
          issue_resolved_at = NULL,
          issue_resolved_by = NULL,
          updated_by = $4,
          updated_at = NOW()
      WHERE id = $5
        AND deleted_at IS NULL
    `,
    [issueType, issueReason, orderImpact, user.id, id],
  );

  const updated = await getOrderById(user, id);

  if (updated.productId && updated.hunterId && updated.listerId) {
    await createLinkedChangeRequest({
      actorUserId: user.id,
      productId: updated.productId,
      orderId: updated.id,
      hunterId: updated.hunterId,
      listerId: updated.listerId,
      accountId: updated.accountId,
      asin: updated.asin,
      productTitle: updated.productTitle || existingOrder.productTitle,
      issueType,
      issueReason,
      requestedChanges: `${issueType.replaceAll('_', ' ')}: ${issueReason}`,
      currentAmazonLink: updated.productAmazonUrl || updated.amazonOrderLink || null,
      currentEbayLink: updated.listingUrl || updated.productEbayUrl || updated.ebayListingUrl || null,
      currentPrice: updated.salePrice,
    });
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: 'ORDER_ISSUE_CREATED',
    targetType: 'order',
    targetId: id,
    details: {
      orderCode: updated.orderCode,
      issueType: updated.issueType,
      issueReason: updated.issueReason,
      orderImpact,
    },
  });
  return updated;
};

const deleteOrder = async (user, id, { permanent = false, reason = null } = {}) => {
  await ensureOrdersTable();

  if (!['admin', 'super_admin'].includes(user.role)) {
    throw new AppError('You do not have permission to delete orders.', 403);
  }

  const order = await getOrderById(user, id, { includeDeleted: true });

  if (permanent) {
    if (user.role !== 'super_admin') {
      throw new AppError('Only Super Admin can permanently delete orders.', 403);
    }

    await pool.query('DELETE FROM orders WHERE id = $1', [id]);
    await writeAuditLog({
      actorUserId: user.id,
      action: 'order.delete',
      targetType: 'order',
      targetId: id,
      details: {
        orderCode: order.orderCode,
        permanent: true,
      },
    });
    return { deleted: true, permanent: true };
  }

  await pool.query(
    `
      UPDATE orders
      SET deleted_at = NOW(),
          deleted_by = $1,
          delete_reason = $2,
          updated_by = $1,
          updated_at = NOW()
      WHERE id = $3
    `,
    [user.id, reason || null, id],
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'order.delete',
    targetType: 'order',
    targetId: id,
    details: {
      orderCode: order.orderCode,
      permanent: false,
      reason: reason || null,
    },
  });

  return { deleted: true, permanent: false };
};

const restoreOrder = async (user, id) => {
  await ensureOrdersTable();

  if (user.role !== 'super_admin') {
    throw new AppError('Only Super Admin can restore deleted orders.', 403);
  }

  await pool.query(
    `
      UPDATE orders
      SET deleted_at = NULL,
          deleted_by = NULL,
          delete_reason = NULL,
          updated_by = $1,
          updated_at = NOW()
      WHERE id = $2
    `,
    [user.id, id],
  );

  const order = await getOrderById(user, id, { includeDeleted: true });

  await writeAuditLog({
    actorUserId: user.id,
    action: 'order.restore',
    targetType: 'order',
    targetId: id,
    details: {
      orderCode: order.orderCode,
    },
  });

  return order;
};

const getOrderStats = async (user, query = {}) => {
  await ensureOrdersTable();
  const filters = buildAccessFilters(user, query, { column: 'o.order_date' });
  const whereSql = filters.whereSql;
  const baseParams = filters.params;

  const [summary, byHunter, byAccount, byStatus, daily, bestProduct] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*)::int AS "totalOrders",
          COALESCE(SUM(o.sale_price), 0)::numeric(10, 2) AS "totalRevenue",
          COALESCE(SUM(o.total_cost), 0)::numeric(10, 2) AS "totalCost",
          COALESCE(SUM(o.profit), 0)::numeric(10, 2) AS "totalProfit",
          COALESCE(AVG(NULLIF(o.roi, 0)), 0)::numeric(10, 2) AS "averageRoi",
          COUNT(*) FILTER (WHERE o.placement_status = 'NOT_PLACED' OR o.order_status IN ('NEW', 'READY_TO_PLACE', 'ON_HOLD'))::int AS "pendingPlacement",
          COUNT(*) FILTER (WHERE o.order_status IN ('PLACED', 'SHIPPED', 'DELIVERED'))::int AS "placedOrders",
          COUNT(*) FILTER (WHERE o.order_status = 'DELIVERED')::int AS "deliveredOrders",
          COUNT(*) FILTER (WHERE COALESCE(o.issue_status, '') IN ('OPEN', 'IN_REVIEW'))::int AS "issueOrders",
          COUNT(*) FILTER (WHERE o.profit < 0)::int AS "lossOrders",
          COUNT(*) FILTER (WHERE o.issue_type = 'PRODUCT_NOT_AVAILABLE' AND COALESCE(o.issue_status, '') IN ('OPEN', 'IN_REVIEW'))::int AS "unavailableIssues",
          COUNT(*) FILTER (WHERE o.match_status = 'unmatched')::int AS "unmatchedOrders",
          COUNT(*) FILTER (WHERE o.order_date::date = CURRENT_DATE)::int AS "ordersToday",
          COUNT(*) FILTER (WHERE o.placed_date::date = CURRENT_DATE)::int AS "placedToday",
          COUNT(*) FILTER (WHERE date_trunc('month', o.order_date) = date_trunc('month', CURRENT_DATE))::int AS "ordersThisMonth"
        FROM orders o
        ${whereSql}
      `,
      baseParams,
    ),
    pool.query(
      `
        SELECT
          hunter.id::text AS "hunterId",
          hunter.name AS "hunterName",
          COUNT(o.id)::int AS "orderCount",
          COALESCE(SUM(o.sale_price), 0)::numeric(10, 2) AS "revenue",
          COALESCE(SUM(o.profit), 0)::numeric(10, 2) AS "profit",
          COALESCE(AVG(NULLIF(o.roi, 0)), 0)::numeric(10, 2) AS "roi"
        FROM orders o
        JOIN users hunter ON hunter.id = o.hunter_id
        ${whereSql}
        GROUP BY hunter.id, hunter.name
        ORDER BY "orderCount" DESC, hunter.name
      `,
      baseParams,
    ),
    pool.query(
      `
        SELECT
          account.id::text AS "accountId",
          account.name AS "accountName",
          COUNT(o.id)::int AS "orderCount",
          COALESCE(SUM(o.sale_price), 0)::numeric(10, 2) AS "revenue",
          COALESCE(SUM(o.profit), 0)::numeric(10, 2) AS "profit"
        FROM orders o
        JOIN accounts account ON account.id = o.account_id
        ${whereSql}
        GROUP BY account.id, account.name
        ORDER BY "orderCount" DESC, account.name
      `,
      baseParams,
    ),
    pool.query(
      `
        SELECT
          o.order_status AS "status",
          COUNT(o.id)::int AS "count"
        FROM orders o
        ${whereSql}
        GROUP BY o.order_status
        ORDER BY "count" DESC, o.order_status
      `,
      baseParams,
    ),
    pool.query(
      `
        SELECT
          date_trunc('day', o.order_date)::date AS "date",
          COUNT(o.id)::int AS "orders",
          COALESCE(SUM(o.sale_price), 0)::numeric(10, 2) AS "revenue",
          COALESCE(SUM(o.profit), 0)::numeric(10, 2) AS "profit"
        FROM orders o
        ${whereSql}
        GROUP BY date_trunc('day', o.order_date)::date
        ORDER BY "date" DESC
        LIMIT 31
      `,
      baseParams,
    ),
    pool.query(
      `
        SELECT
          COALESCE(o.product_title, p.title, o.asin, 'Unmatched order') AS "label",
          COUNT(o.id)::int AS "orderCount"
        FROM orders o
        LEFT JOIN products p ON p.id = o.product_id
        ${whereSql}
        GROUP BY COALESCE(o.product_title, p.title, o.asin, 'Unmatched order')
        ORDER BY "orderCount" DESC, "label"
        LIMIT 1
      `,
      baseParams,
    ),
  ]);

  const row = summary.rows[0] || {};

  return {
    totalOrders: row.totalOrders || 0,
    totalRevenue: Number(row.totalRevenue || 0),
    totalCost: Number(row.totalCost || 0),
    totalProfit: Number(row.totalProfit || 0),
    averageRoi: Number(row.averageRoi || 0),
    pendingPlacement: row.pendingPlacement || 0,
    placedOrders: row.placedOrders || 0,
    deliveredOrders: row.deliveredOrders || 0,
    issueOrders: row.issueOrders || 0,
    lossOrders: row.lossOrders || 0,
    unavailableIssues: row.unavailableIssues || 0,
    unmatchedOrders: row.unmatchedOrders || 0,
    ordersToday: row.ordersToday || 0,
    placedToday: row.placedToday || 0,
    ordersThisMonth: row.ordersThisMonth || 0,
    bestSellingProduct: bestProduct.rows[0]?.label || null,
    byHunter: byHunter.rows.map((entry) => ({
      ...entry,
      revenue: Number(entry.revenue || 0),
      profit: Number(entry.profit || 0),
      roi: Number(entry.roi || 0),
    })),
    byAccount: byAccount.rows.map((entry) => ({
      ...entry,
      revenue: Number(entry.revenue || 0),
      profit: Number(entry.profit || 0),
    })),
    byStatus: byStatus.rows,
    daily: daily.rows.map((entry) => ({
      ...entry,
      revenue: Number(entry.revenue || 0),
      profit: Number(entry.profit || 0),
    })),
  };
};

const getOrderReports = async (user, query = {}) => getOrderStats(user, query);

module.exports = {
  ORDER_STATUSES,
  PLACEMENT_STATUSES,
  PAYMENT_STATUSES,
  ISSUE_TYPES,
  ISSUE_STATUSES,
  ORDER_IMPACTS,
  hasOrderWriteAccess,
  hasGlobalOrderReadAccess,
  listOrders,
  getOrderById,
  listOrderActivity,
  createOrder,
  updateOrder,
  deleteOrder,
  restoreOrder,
  updateOrderStatus,
  bulkUpdateOrderStatus,
  markOrderPlaced,
  markOrderShipped,
  markOrderDelivered,
  markOrderIssue,
  getOrderStats,
  getOrderReports,
  matchProducts,
  ensureOrdersTable,
};
