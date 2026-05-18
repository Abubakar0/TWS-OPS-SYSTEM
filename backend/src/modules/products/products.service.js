const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { analyzeProduct, normalizeProductPayload } = require('../../utils/productAnalysis');

const productSelect = `
  p.id,
  p.hunter_id AS "hunterId",
  hunter.name AS "hunterName",
  p.listed_by AS "listedBy",
  lister.name AS "listedByName",
  p.account_used AS "accountUsed",
  account.name AS "accountName",
  p.amazon_url AS "amazonUrl",
  p.ebay_url AS "ebayUrl",
  p.asin,
  p.title,
  p.amazon_price AS "amazonPrice",
  p.ebay_price AS "ebayPrice",
  p.fees,
  p.stock_quantity AS "stockQuantity",
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

const productFromRow = (row) => ({
  ...row,
  amazonPrice: row.amazonPrice === null ? null : Number(row.amazonPrice),
  ebayPrice: row.ebayPrice === null ? null : Number(row.ebayPrice),
  fees: Number(row.fees),
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

const createProduct = async (user, payload) => {
  const input = normalizeProductPayload(payload);
  const hasDuplicateAsin = await findDuplicateAsin(input.asin);
  const analysis = analyzeProduct(input, { hasDuplicateAsin });

  const result = await pool.query(
    `
      INSERT INTO products (
        hunter_id,
        amazon_url,
        ebay_url,
        asin,
        title,
        amazon_price,
        ebay_price,
        fees,
        stock_quantity,
        delivery_days,
        profit,
        roi,
        status,
        rejection_reason,
        validation_notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
      RETURNING id
    `,
    [
      user.id,
      input.amazonUrl,
      input.ebayUrl,
      input.asin || null,
      input.title || null,
      input.amazonPrice,
      input.ebayPrice,
      input.fees,
      input.stockQuantity,
      input.deliveryDays,
      analysis.profit,
      analysis.roi,
      analysis.status,
      analysis.rejectionReason || null,
      JSON.stringify(analysis.validationNotes),
    ],
  );

  return getProductById(user, result.rows[0].id);
};

const listProducts = async (user) => {
  const params = [];
  let where = '';

  if (user.role === 'hunter') {
    params.push(user.id);
    where = 'WHERE p.hunter_id = $1';
  }

  if (user.role === 'lister') {
    where = "WHERE p.status = 'approved'";
  }

  const result = await pool.query(
    `
      SELECT ${productSelect}
      FROM products p
      JOIN users hunter ON hunter.id = p.hunter_id
      LEFT JOIN users lister ON lister.id = p.listed_by
      LEFT JOIN accounts account ON account.id = p.account_used
      ${where}
      ORDER BY p.created_at DESC
      LIMIT 100
    `,
    params,
  );

  return result.rows.map(productFromRow);
};

const getProductById = async (user, id) => {
  const result = await pool.query(
    `
      SELECT ${productSelect}
      FROM products p
      JOIN users hunter ON hunter.id = p.hunter_id
      LEFT JOIN users lister ON lister.id = p.listed_by
      LEFT JOIN accounts account ON account.id = p.account_used
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

  if (user.role === 'lister' && product.status !== 'approved') {
    throw new AppError('Product not found.', 404);
  }

  return product;
};

module.exports = {
  createProduct,
  listProducts,
  getProductById,
};
