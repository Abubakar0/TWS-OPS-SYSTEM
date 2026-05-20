const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { analyzeProduct, normalizeProductPayload } = require('../../utils/productAnalysis');
const { getCriteria } = require('../criteria/criteria.service');

const productSelect = `
  p.id,
  p.hunter_id AS "hunterId",
  hunter.name AS "hunterName",
  p.assigned_lister_id AS "assignedListerId",
  assigned_lister.name AS "assignedListerName",
  p.listed_by AS "listedBy",
  lister.name AS "listedByName",
  p.account_used AS "accountUsed",
  account.name AS "accountName",
  listing.listing_url AS "listingUrl",
  listing.item_id AS "itemId",
  p.amazon_url AS "amazonUrl",
  p.amazon_alt_url AS "amazonAltUrl",
  p.ebay_url AS "ebayUrl",
  p.asin,
  p.title,
  p.custom_label AS "customLabel",
  p.amazon_price AS "amazonPrice",
  p.ebay_price AS "ebayPrice",
  p.fees,
  p.sold_count AS "soldCount",
  p.stock_quantity AS "amazonStockCount",
  p.stock_quantity AS "stockQuantity",
  p.alternate_stock_quantity AS "alternateAmazonStockCount",
  p.rating,
  p.product_watchers AS "productWatchers",
  p.sales_last_two_months AS "salesLastTwoMonths",
  p.delivery_days AS "deliveryDays",
  p.profit,
  p.roi,
  p.status,
  p.rejection_reason AS "rejectionReason",
  p.validation_notes AS "validationNotes",
  p.listed_at AS "listedAt",
  p.created_at AS "createdAt",
  p.updated_at AS "updatedAt"
`;

const productJoins = `
  FROM products p
  JOIN users hunter ON hunter.id = p.hunter_id
  LEFT JOIN users assigned_lister ON assigned_lister.id = p.assigned_lister_id
  LEFT JOIN users lister ON lister.id = p.listed_by
  LEFT JOIN accounts account ON account.id = p.account_used
  LEFT JOIN listings listing ON listing.product_id = p.id
`;

const productFromRow = (row) => ({
  ...row,
  amazonPrice: row.amazonPrice === null ? null : Number(row.amazonPrice),
  ebayPrice: row.ebayPrice === null ? null : Number(row.ebayPrice),
  amazonStockCount: row.amazonStockCount === null ? null : Number(row.amazonStockCount),
  stockQuantity: row.stockQuantity === null ? null : Number(row.stockQuantity),
  alternateAmazonStockCount:
    row.alternateAmazonStockCount === null ? null : Number(row.alternateAmazonStockCount),
  rating: row.rating === null ? null : Number(row.rating),
  productWatchers: row.productWatchers === null ? null : Number(row.productWatchers),
  salesLastTwoMonths: row.salesLastTwoMonths === null ? null : Number(row.salesLastTwoMonths),
  fees: Number(row.fees),
  soldCount: Number(row.soldCount || 0),
  profit: Number(row.profit),
  roi: Number(row.roi),
});

const findDuplicateAsin = async (asin) => {
  if (!asin) {
    return false;
  }

  const result = await pool.query('SELECT id FROM products WHERE asin = $1 LIMIT 1', [asin]);
  return result.rowCount > 0;
};

const getAssignedListerId = async (hunterId) => {
  const result = await pool.query(
    'SELECT lister_id FROM hunter_lister_assignments WHERE hunter_id = $1',
    [hunterId],
  );
  return result.rows[0]?.lister_id || null;
};

const createProduct = async (user, payload) => {
  const input = normalizeProductPayload(payload);
  const criteria = await getCriteria();
  const hasDuplicateAsin = await findDuplicateAsin(input.asin);
  const analysis = analyzeProduct(input, criteria, { hasDuplicateAsin });
  const assignedListerId = await getAssignedListerId(user.id);
  const status = analysis.status === 'approved' && assignedListerId ? 'assigned' : analysis.status;

  const result = await pool.query(
    `
      INSERT INTO products (
        hunter_id,
        assigned_lister_id,
        amazon_url,
        amazon_alt_url,
        ebay_url,
        asin,
        title,
        custom_label,
        amazon_price,
        ebay_price,
        fees,
        sold_count,
        stock_quantity,
        alternate_stock_quantity,
        rating,
        product_watchers,
        sales_last_two_months,
        delivery_days,
        profit,
        roi,
        status,
        rejection_reason,
        validation_notes
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23::jsonb
      )
      RETURNING id
    `,
    [
      user.id,
      assignedListerId,
      input.amazonUrl,
      input.amazonAltUrl || null,
      input.ebayUrl,
      input.asin || null,
      input.title || null,
      input.customLabel || null,
      input.amazonPrice,
      input.ebayPrice,
      analysis.fees,
      input.soldCount,
      input.amazonStockCount,
      input.alternateAmazonStockCount,
      input.rating,
      input.productWatchers,
      input.salesLastTwoMonths,
      input.deliveryDays,
      analysis.profit,
      analysis.roi,
      status,
      analysis.rejectionReason || null,
      JSON.stringify(analysis.validationNotes),
    ],
  );

  return getProductById(user, result.rows[0].id);
};

const buildProductFilters = (user, query = {}) => {
  const where = [];
  const params = [];

  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  const addLike = (sql, value) => {
    params.push(`%${String(value).trim()}%`);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (user.role === 'hunter') {
    add('p.hunter_id = ?', user.id);
  }

  if (user.role === 'lister') {
    add('p.assigned_lister_id = ?', user.id);
    where.push("p.status <> 'rejected'");
  }

  if (query.hunterId) {
    add('p.hunter_id = ?', query.hunterId);
  }

  if (query.status) {
    add('p.status = ?', query.status);
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    where.push(`(
      p.title ILIKE $${index}
      OR p.custom_label ILIKE $${index}
      OR p.asin ILIKE $${index}
      OR p.amazon_url ILIKE $${index}
      OR p.amazon_alt_url ILIKE $${index}
      OR p.ebay_url ILIKE $${index}
      OR listing.listing_url ILIKE $${index}
      OR p.rejection_reason ILIKE $${index}
      OR hunter.name ILIKE $${index}
      OR assigned_lister.name ILIKE $${index}
      OR lister.name ILIKE $${index}
      OR account.name ILIKE $${index}
    )`);
  }

  if (query.listerName) {
    params.push(`%${String(query.listerName).trim()}%`);
    const index = params.length;
    where.push(`(
      assigned_lister.name ILIKE $${index}
      OR lister.name ILIKE $${index}
    )`);
  }

  if (query.accountName) {
    addLike('account.name ILIKE ?', query.accountName);
  }

  if (query.from) {
    add('p.created_at >= ?', query.from);
  }

  if (query.to) {
    add('p.created_at < (?::date + INTERVAL \'1 day\')', query.to);
  }

  if (query.listedFrom) {
    add('p.listed_at >= ?', query.listedFrom);
  }

  if (query.listedTo) {
    add('p.listed_at <= ?', query.listedTo);
  }

  return {
    where: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
};

const listProducts = async (user, query = {}) => {
  const filters = buildProductFilters(user, query);
  const result = await pool.query(
    `
      SELECT ${productSelect}
      ${productJoins}
      ${filters.where}
      ORDER BY p.created_at DESC
      LIMIT 250
    `,
    filters.params,
  );

  return result.rows.map(productFromRow);
};

const getProductById = async (user, id) => {
  const result = await pool.query(
    `
      SELECT ${productSelect}
      ${productJoins}
      WHERE p.id = $1
      LIMIT 1
    `,
    [id],
  );

  const product = result.rows[0] && productFromRow(result.rows[0]);

  if (!product) {
    throw new AppError('Product not found.', 404);
  }

  if (user.role === 'hunter' && product.hunterId !== user.id) {
    throw new AppError('Product not found.', 404);
  }

  if (user.role === 'lister' && product.assignedListerId !== user.id) {
    throw new AppError('Product not found.', 404);
  }

  return product;
};

const listAssignedHunters = async (user) => {
  if (user.role === 'admin') {
    const result = await pool.query(
      `
        SELECT id, name, email, is_active AS "isActive"
        FROM users
        WHERE role = 'hunter'
        ORDER BY name
      `,
    );
    return result.rows;
  }

  const result = await pool.query(
    `
      SELECT
        hunter.id,
        hunter.name,
        hunter.email,
        hunter.is_active AS "isActive",
        COUNT(p.id)::int AS "productCount",
        COUNT(p.id) FILTER (WHERE p.status IN ('approved', 'assigned'))::int AS "readyCount",
        COUNT(p.id) FILTER (WHERE p.status = 'listed')::int AS "listedCount"
      FROM hunter_lister_assignments hla
      JOIN users hunter ON hunter.id = hla.hunter_id
      LEFT JOIN products p ON p.hunter_id = hunter.id
      WHERE hla.lister_id = $1
      GROUP BY hunter.id, hunter.name, hunter.email, hunter.is_active
      ORDER BY hunter.name
    `,
    [user.id],
  );

  return result.rows;
};

const markProductsListed = async (user, payload) => {
  const items = Array.isArray(payload.items)
    ? payload.items
    : (payload.productIds || []).map((id) => ({ id }));
  const productIds = [...new Set(items.map((item) => item.id || item.productId).filter(Boolean))];
  const accountId = payload.accountId;

  if (!accountId || productIds.length === 0) {
    throw new AppError('Account and at least one product are required.', 400);
  }

  const account = await pool.query('SELECT id FROM accounts WHERE id = $1 AND is_active = TRUE', [accountId]);

  if (account.rowCount === 0) {
    throw new AppError('Active account not found.', 404);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const params = [productIds, accountId, user.id];
    let accessSql = '';

    if (user.role === 'lister') {
      params.push(user.id);
      accessSql = `AND assigned_lister_id = $${params.length}`;
    }

    const update = await client.query(
      `
        UPDATE products
        SET status = 'listed',
            account_used = $2,
            listed_by = $3,
            listed_at = NOW(),
            updated_at = NOW()
        WHERE id = ANY($1::uuid[])
          AND status IN ('approved', 'assigned', 'listed')
          ${accessSql}
        RETURNING id
      `,
      params,
    );

    if (update.rowCount !== productIds.length) {
      throw new AppError('Some products could not be updated for this lister.', 403);
    }

    const itemById = new Map(items.map((item) => [item.id || item.productId, item]));

    for (const productId of productIds) {
      const item = itemById.get(productId) || {};

      await client.query(
        `
          INSERT INTO listings (product_id, lister_id, account_id, listing_url, item_id)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (product_id) DO UPDATE
          SET lister_id = EXCLUDED.lister_id,
              account_id = EXCLUDED.account_id,
              listing_url = COALESCE(EXCLUDED.listing_url, listings.listing_url),
              item_id = COALESCE(EXCLUDED.item_id, listings.item_id),
              updated_at = NOW()
        `,
        [productId, user.id, accountId, item.listingUrl || null, item.itemId || null],
      );
    }

    await client.query('COMMIT');

    return listProducts(user, {});
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  listAssignedHunters,
  markProductsListed,
};
