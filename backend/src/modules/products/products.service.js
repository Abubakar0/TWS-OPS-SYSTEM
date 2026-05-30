const { pool } = require("../../db/pool");
const { AppError } = require("../../middleware/error");
const {
  normalizePageRequest,
  buildPageMeta,
} = require("../../utils/pagination");
const {
  analyzeProduct,
  normalizeProductPayload,
  isEbayUrl,
  getQualityLabel,
} = require("../../utils/productAnalysis");
const { getCriteria } = require("../criteria/criteria.service");
const { writeAuditLog } = require("../users/audit.service");
const { getConfiguredLimit } = require("../system/system.service");
const {
  assertHunterReviewComplete,
} = require("../weekly-review/weekly-review.service");
const {
  assertListerListingUnblocked,
} = require("../change-requests/change-requests.service");

const PRODUCT_LIMIT_CATEGORY = "products";
const LISTING_QUEUE_LIMIT_CATEGORY = "listingQueue";
const REJECTION_LIMIT_CATEGORY = "rejections";

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
  p.category,
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
  p.basket_count AS "basketCount",
  p.delivery_days AS "deliveryDays",
  p.monthly_graph_uptrend AS "monthlyGraphUptrend",
  p.profit,
  p.roi,
  p.status,
  p.rejection_reason AS "rejectionReason",
  p.validation_notes AS "validationNotes",
  p.deleted_by AS "deletedBy",
  p.deleted_at AS "deletedAt",
  p.delete_reason AS "deleteReason",
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

const productFromRow = (row, criteria = null) => {
  const normalized = {
    ...row,
    amazonPrice: row.amazonPrice === null ? null : Number(row.amazonPrice),
    ebayPrice: row.ebayPrice === null ? null : Number(row.ebayPrice),
    amazonStockCount:
      row.amazonStockCount === null ? null : Number(row.amazonStockCount),
    stockQuantity:
      row.stockQuantity === null ? null : Number(row.stockQuantity),
    alternateAmazonStockCount:
      row.alternateAmazonStockCount === null
        ? null
        : Number(row.alternateAmazonStockCount),
    rating: row.rating === null ? null : Number(row.rating),
    productWatchers:
      row.productWatchers === null ? null : Number(row.productWatchers),
    salesLastTwoMonths:
      row.salesLastTwoMonths === null ? null : Number(row.salesLastTwoMonths),
    basketCount: row.basketCount === null ? null : Number(row.basketCount),
    deliveryDays: row.deliveryDays === null ? null : Number(row.deliveryDays),
    monthlyGraphUptrend:
      row.monthlyGraphUptrend === null || row.monthlyGraphUptrend === undefined
        ? null
        : Boolean(row.monthlyGraphUptrend),
    fees: Number(row.fees),
    soldCount: Number(row.soldCount || 0),
    profit: Number(row.profit),
    roi: Number(row.roi),
    validationNotes: Array.isArray(row.validationNotes)
      ? row.validationNotes
      : [],
    deletedBy: row.deletedBy || null,
    deletedAt: row.deletedAt || null,
    deleteReason: row.deleteReason || null,
  };

  if (!criteria) {
    return normalized;
  }

  return {
    ...normalized,
    qualityLabel: getQualityLabel(
      {
        amazonStockCount: normalized.amazonStockCount,
        salesLastTwoMonths: normalized.salesLastTwoMonths,
        rating: normalized.rating,
      },
      criteria,
      normalized,
    ),
    primaryFailure:
      normalized.validationNotes.find((note) => !note.passed)?.message ||
      normalized.rejectionReason,
  };
};

const getDuplicateProductByAsin = async (asin) => {
  if (!asin) {
    return null;
  }

  const criteria = await getCriteria();
  const result = await pool.query(
    `
      SELECT ${productSelect}
      ${productJoins}
      WHERE p.asin = $1
        AND p.deleted_at IS NULL
      ORDER BY
        CASE p.status
          WHEN 'listed' THEN 1
          WHEN 'assigned' THEN 2
          WHEN 'approved' THEN 3
          ELSE 4
        END,
        p.created_at DESC
      LIMIT 1
    `,
    [asin],
  );

  return result.rows[0] ? productFromRow(result.rows[0], criteria) : null;
};

const ensureProductColumns = async () => {
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS basket_count INTEGER,
      ADD COLUMN IF NOT EXISTS delivery_days INTEGER,
      ADD COLUMN IF NOT EXISTS monthly_graph_uptrend BOOLEAN,
      ADD COLUMN IF NOT EXISTS category TEXT
  `);
};

const getAssignedListerId = async (hunterId) => {
  const result = await pool.query(
    "SELECT lister_id FROM hunter_lister_assignments WHERE hunter_id = $1",
    [hunterId],
  );
  return result.rows[0]?.lister_id || null;
};

const buildQualitySql = (criteria) => {
  const excellentRoi = Math.max(
    criteria.minRoi + 15,
    criteria.minRoi * 1.35,
    35,
  );
  const excellentProfit = Math.max(
    criteria.minProfit + 5,
    criteria.minProfit * 1.5,
    5,
  );
  const excellentSales = Math.max(
    criteria.minSalesLastTwoMonths + 12,
    criteria.minSalesLastTwoMonths * 1.4,
    12,
  );
  const excellentStock = Math.max(
    criteria.minStockCount + 4,
    criteria.minStockCount * 1.3,
    12,
  );
  const excellentRating = Math.max(criteria.minRating + 0.5, 4.2);

  return `
    CASE
      WHEN p.status = 'rejected' THEN 'Rejected'
      WHEN (
        (CASE WHEN COALESCE(p.roi, 0) >= ${excellentRoi} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.profit, 0) >= ${excellentProfit} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.sales_last_two_months, 0) >= ${excellentSales} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.stock_quantity, 0) >= ${excellentStock} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.rating, 0) >= ${excellentRating} THEN 1 ELSE 0 END)
      ) >= 4 THEN 'Best Hunt'
      WHEN (
        (CASE WHEN COALESCE(p.roi, 0) >= ${excellentRoi} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.profit, 0) >= ${excellentProfit} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.sales_last_two_months, 0) >= ${excellentSales} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.stock_quantity, 0) >= ${excellentStock} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.rating, 0) >= ${excellentRating} THEN 1 ELSE 0 END)
      ) >= 2 THEN 'Good Hunt'
      ELSE 'Avg Hunt'
    END
  `;
};

const buildProductFilters = (user, query = {}, criteria = null) => {
  const where = [];
  const params = [];

  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };

  const addLike = (sql, value) => {
    params.push(`%${String(value).trim()}%`);
    where.push(sql.replace("?", `$${params.length}`));
  };

  if (user.role === "hunter") {
    add("p.hunter_id = ?", user.id);
    where.push("p.deleted_at IS NULL");
  }

  if (user.role === "lister") {
    add("p.assigned_lister_id = ?", user.id);
    where.push("p.deleted_at IS NULL");
  }

  if (user.role !== "hunter" && user.role !== "lister") {
    const deletedState = query.deletedState || "active";

    if (deletedState === "deleted") {
      where.push("p.deleted_at IS NOT NULL");
    } else if (deletedState !== "all") {
      where.push("p.deleted_at IS NULL");
    }
  }

  if (query.hunterId) {
    add("p.hunter_id = ?", query.hunterId);
  }

  if (query.listerId) {
    add("p.assigned_lister_id = ?", query.listerId);
  }

  if (query.status) {
    add("p.status = ?", query.status);
  }

  if (query.category) {
    add("p.category = ?", query.category);
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
    addLike("account.name ILIKE ?", query.accountName);
  }

  if (query.accountId) {
    add("p.account_used = ?", query.accountId);
  }

  if (query.from) {
    add("p.created_at >= ?", query.from);
  }

  if (query.to) {
    add("p.created_at < (?::date + INTERVAL '1 day')", query.to);
  }

  if (query.listedFrom) {
    add("p.listed_at >= ?", query.listedFrom);
  }

  if (query.listedTo) {
    add("p.listed_at < (?::date + INTERVAL '1 day')", query.listedTo);
  }

  if (criteria && query.quality) {
    const qualitySql = buildQualitySql(criteria);
    params.push(query.quality);
    where.push(`${qualitySql} = $${params.length}`);
  }

  return {
    where: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
};

const getListCategory = (user, query = {}) => {
  if (user.role === "lister") {
    if (query.status === "rejected") {
      return REJECTION_LIMIT_CATEGORY;
    }

    return LISTING_QUEUE_LIMIT_CATEGORY;
  }

  return PRODUCT_LIMIT_CATEGORY;
};

const listProducts = async (user, query = {}) => {
  await ensureProductColumns();
  const criteria = await getCriteria();
  const filters = buildProductFilters(user, query, criteria);
  const defaultLimit = await getConfiguredLimit(
    getListCategory(user, query),
    query.limit,
  );
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        ${productSelect}
      ${productJoins}
      ${filters.where}
      ORDER BY p.created_at DESC
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );

  const products = result.rows.map((row) => productFromRow(row, criteria));
  const total = result.rows[0]?.totalCount || 0;

  return {
    items: products,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

const getProductById = async (user, id) => {
  await ensureProductColumns();
  const criteria = await getCriteria();
  const result = await pool.query(
    `
      SELECT ${productSelect}
      ${productJoins}
      WHERE p.id = $1
      LIMIT 1
    `,
    [id],
  );

  const product = result.rows[0] && productFromRow(result.rows[0], criteria);

  if (
    !product ||
    (product.deletedAt && !["admin", "super_admin"].includes(user.role))
  ) {
    throw new AppError("Product not found.", 404);
  }

  if (user.role === "hunter" && product.hunterId !== user.id) {
    throw new AppError("Product not found.", 404);
  }

  if (user.role === "lister" && product.assignedListerId !== user.id) {
    throw new AppError("Product not found.", 404);
  }

  return product;
};

const checkAsinAvailability = async (asin) => {
  await ensureProductColumns();
  const normalizedAsin = String(asin || "")
    .trim()
    .toUpperCase();

  if (!normalizedAsin) {
    throw new AppError("ASIN is required.", 400);
  }

  if (!/^[A-Z0-9]{10}$/.test(normalizedAsin)) {
    throw new AppError("Enter a valid 10-character ASIN.", 400);
  }

  const product = await getDuplicateProductByAsin(normalizedAsin);

  return {
    asin: normalizedAsin,
    isDuplicate: Boolean(product),
    product,
  };
};

const createProduct = async (user, payload) => {
  await ensureProductColumns();
  await assertHunterReviewComplete(user);
  const input = normalizeProductPayload(payload);
  const criteria = await getCriteria();
  const duplicateProduct = await getDuplicateProductByAsin(input.asin);

  if (duplicateProduct) {
    throw new AppError("ASIN already exists in the system.", 409, {
      product: {
        id: duplicateProduct.id,
        title: duplicateProduct.title,
        asin: duplicateProduct.asin,
        status: duplicateProduct.status,
        listedAt: duplicateProduct.listedAt,
        accountName: duplicateProduct.accountName,
      },
    });
  }

  const analysis = analyzeProduct(input, criteria, { hasDuplicateAsin: false });
  const assignedListerId = await getAssignedListerId(user.id);
  const status =
    analysis.status === "approved" && assignedListerId
      ? "assigned"
      : analysis.status;

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
        category,
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
        basket_count,
        delivery_days,
        monthly_graph_uptrend,
        profit,
        roi,
        status,
        rejection_reason,
        validation_notes
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26::jsonb
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
      input.category || null,
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
      input.basketCount,
      input.deliveryDays,
      input.monthlyGraphUptrend,
      analysis.profit,
      analysis.roi,
      status,
      status === "rejected"
        ? analysis.primaryFailure || analysis.rejectionReason || null
        : null,
      JSON.stringify(analysis.validationNotes),
    ],
  );

  const product = await getProductById(user, result.rows[0].id);

  await writeAuditLog({
    actorUserId: user.id,
    action: status === "rejected" ? "product.rejected" : "product.approved",
    targetType: "product",
    targetId: product.id,
    details: {
      status: product.status,
      asin: product.asin,
      title: product.title,
      assignedListerId,
    },
  });

  return product;
};

const listAssignedHunters = async (user) => {
  const defaultLimit = await getConfiguredLimit("hunters");
  const pageRequest = normalizePageRequest(
    { page: 1, limit: defaultLimit },
    defaultLimit,
  );

  if (user.role === "admin") {
    const result = await pool.query(
      `
        SELECT id, name, email, is_active AS "isActive"
        FROM users
        WHERE role = 'hunter'
          AND deleted_at IS NULL
        ORDER BY name
        LIMIT $1
      `,
      [pageRequest.limit],
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
        COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL)::int AS "productCount",
        COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL AND p.status IN ('approved', 'assigned'))::int AS "readyCount",
        COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL AND p.status = 'listed')::int AS "listedCount",
        COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL AND p.status = 'rejected')::int AS "rejectedCount",
        COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL AND p.status IN ('approved', 'assigned'))::int AS "pendingCount"
      FROM hunter_lister_assignments hla
      JOIN users hunter ON hunter.id = hla.hunter_id
      LEFT JOIN products p ON p.hunter_id = hunter.id
      WHERE hla.lister_id = $1
        AND hunter.deleted_at IS NULL
      GROUP BY hunter.id, hunter.name, hunter.email, hunter.is_active
      ORDER BY hunter.name
      LIMIT $2
    `,
    [user.id, pageRequest.limit],
  );

  return result.rows;
};

const getProductsByIds = async (user, ids) => {
  if (!ids.length) {
    return [];
  }

  const criteria = await getCriteria();
  const params = [ids];
  const accessClauses = ["p.id = ANY($1::uuid[])"];

  if (user.role === "hunter") {
    params.push(user.id);
    accessClauses.push(`p.hunter_id = $${params.length}`);
  }

  if (user.role === "lister") {
    params.push(user.id);
    accessClauses.push(`p.assigned_lister_id = $${params.length}`);
  }

  const result = await pool.query(
    `
      SELECT ${productSelect}
      ${productJoins}
      WHERE ${accessClauses.join(" AND ")}
      ORDER BY p.created_at DESC
    `,
    params,
  );

  return result.rows.map((row) => productFromRow(row, criteria));
};

const markProductsListed = async (user, payload) => {
  const items = Array.isArray(payload.items)
    ? payload.items
    : (payload.productIds || []).map((id) => ({ id }));
  const productIds = [
    ...new Set(items.map((item) => item.id || item.productId).filter(Boolean)),
  ];
  const accountId = payload.accountId;
  const itemById = new Map(
    items.map((item) => [item.id || item.productId, item]),
  );

  if (!accountId || productIds.length === 0) {
    throw new AppError("Account and at least one product are required.", 400);
  }

  if (user.role === "lister") {
    await assertListerListingUnblocked(user.id);
  }

  for (const productId of productIds) {
    const item = itemById.get(productId) || {};
    const listingUrl = String(item.listingUrl || "").trim();

    if (!listingUrl || !isEbayUrl(listingUrl)) {
      throw new AppError(
        "Each selected product must include a valid listed eBay link.",
        400,
      );
    }
  }

  const account = await pool.query(
    user.role === "lister"
      ? `
          SELECT account.id
          FROM accounts account
          JOIN lister_account_assignments assignment ON assignment.account_id = account.id
          WHERE account.id = $1
            AND account.is_active = TRUE
            AND assignment.lister_id = $2
        `
      : "SELECT id FROM accounts WHERE id = $1 AND is_active = TRUE",
    user.role === "lister" ? [accountId, user.id] : [accountId],
  );

  if (account.rowCount === 0) {
    throw new AppError(
      user.role === "lister"
        ? "This listing account is not assigned to you."
        : "Active account not found.",
      user.role === "lister" ? 403 : 404,
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const params = [productIds, accountId, user.id];
    let accessSql = "";

    if (user.role === "lister") {
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
          AND status IN ('approved', 'assigned')
          AND deleted_at IS NULL
          ${accessSql}
        RETURNING id
      `,
      params,
    );

    if (update.rowCount !== productIds.length) {
      throw new AppError(
        "Some products could not be updated for this lister.",
        403,
      );
    }

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
        [
          productId,
          user.id,
          accountId,
          String(item.listingUrl || "").trim(),
          item.itemId || null,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  for (const productId of productIds) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "listing.complete",
      targetType: "product",
      targetId: productId,
      details: {
        accountId,
        listingUrl: String(
          (itemById.get(productId) || {}).listingUrl || "",
        ).trim(),
      },
    });
  }

  return getProductsByIds(user, productIds);
};

const rejectProduct = async (user, id, payload = {}) => {
  const rejectionReason = String(payload.rejectionReason || "").trim();

  if (!rejectionReason) {
    throw new AppError("Rejection reason is required.", 400);
  }

  if (user.role === "lister") {
    await assertListerListingUnblocked(user.id);
  }

  const params = [id, rejectionReason];
  let accessSql = "";

  if (user.role === "lister") {
    params.push(user.id);
    accessSql = `AND assigned_lister_id = $${params.length}`;
  }

  const result = await pool.query(
    `
      UPDATE products
      SET status = 'rejected',
          rejection_reason = $2,
          updated_at = NOW()
      WHERE id = $1
        AND status IN ('approved', 'assigned')
        AND deleted_at IS NULL
        ${accessSql}
      RETURNING id
    `,
    params,
  );

  if (result.rowCount === 0) {
    throw new AppError("Product could not be rejected for this lister.", 403);
  }

  const product = await getProductById(user, id);

  await writeAuditLog({
    actorUserId: user.id,
    action: "product.rejected",
    targetType: "product",
    targetId: product.id,
    details: {
      rejectionReason,
      assignedListerId: product.assignedListerId,
      hunterId: product.hunterId,
    },
  });

  return product;
};

const assertDeleteReason = (reason) => {
  const normalized = String(reason || "").trim();

  if (normalized.length < 3) {
    throw new AppError("Delete reason must be at least 3 characters.", 400);
  }

  return normalized;
};

const softDeleteProducts = async (user, payload = {}) => {
  const productIds = [...new Set((payload.productIds || []).filter(Boolean))];
  const deleteReason = assertDeleteReason(payload.reason);

  if (productIds.length === 0) {
    throw new AppError("Select at least one product to delete.", 400);
  }

  const result = await pool.query(
    `
      UPDATE products
      SET deleted_at = NOW(),
          deleted_by = $2,
          delete_reason = $3,
          updated_at = NOW()
      WHERE id = ANY($1::uuid[])
        AND deleted_at IS NULL
      RETURNING id
    `,
    [productIds, user.id, deleteReason],
  );

  for (const row of result.rows) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "product.delete.soft",
      targetType: "product",
      targetId: row.id,
      details: { reason: deleteReason },
    });
  }

  return result.rows.map((row) => row.id);
};

const permanentlyDeleteProducts = async (user, payload = {}) => {
  const productIds = [...new Set((payload.productIds || []).filter(Boolean))];
  const deleteReason = assertDeleteReason(payload.reason);

  if (productIds.length === 0) {
    throw new AppError("Select at least one product to delete.", 400);
  }

  const result = await pool.query(
    `
      DELETE FROM products
      WHERE id = ANY($1::uuid[])
      RETURNING id
    `,
    [productIds],
  );

  for (const row of result.rows) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "product.delete.permanent",
      targetType: "product",
      targetId: row.id,
      details: { reason: deleteReason },
    });
  }

  return result.rows.map((row) => row.id);
};

const restoreProduct = async (user, id) => {
  const result = await pool.query(
    `
      UPDATE products
      SET deleted_at = NULL,
          deleted_by = NULL,
          delete_reason = NULL,
          updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NOT NULL
      RETURNING id
    `,
    [id],
  );

  if (result.rowCount === 0) {
    throw new AppError("Deleted product not found.", 404);
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "product.restore",
    targetType: "product",
    targetId: id,
    details: {},
  });

  return getProductById(user, id);
};

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  checkAsinAvailability,
  listAssignedHunters,
  markProductsListed,
  rejectProduct,
  softDeleteProducts,
  permanentlyDeleteProducts,
  restoreProduct,
};
