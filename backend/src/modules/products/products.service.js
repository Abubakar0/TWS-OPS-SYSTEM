const { pool } = require("../../db/pool");
const { AppError } = require("../../middleware/error");
const {
  normalizePageRequest,
  buildPageMeta,
} = require("../../utils/pagination");
const {
  analyzeProduct,
  normalizeProductPayload,
  isAmazonUrl,
  isEbayUrl,
  getQualityLabel,
} = require("../../utils/productAnalysis");
const { getCriteria } = require("../criteria/criteria.service");
const { writeAuditLog } = require("../users/audit.service");
const { getConfiguredLimit, getHrSettings } = require("../system/system.service");
const { hasAnyRole, hasRole } = require("../users/permissions");
const {
  assertHunterReviewComplete,
} = require("../weekly-review/weekly-review.service");
const {
  assertListerListingUnblocked,
} = require("../change-requests/change-requests.service");

const PRODUCT_LIMIT_CATEGORY = "products";
const LISTING_QUEUE_LIMIT_CATEGORY = "listingQueue";
const REJECTION_LIMIT_CATEGORY = "rejections";
const LISTING_REVIEW_STATUS = {
  NOT_REQUIRED: "NOT_REQUIRED",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

const WORKFLOW_STATUS = {
  READY_FOR_LISTING: "ready_for_listing",
  LISTED_NEEDS_REVIEW: "listed_needs_review",
  LISTED: "listed",
  LISTING_REJECTED: "listing_rejected",
  REJECTED: "rejected",
};

const REVIEWABLE_WORKFLOW_STATUSES = new Set([
  WORKFLOW_STATUS.LISTED_NEEDS_REVIEW,
  WORKFLOW_STATUS.LISTING_REJECTED,
]);

const isReadyRawStatus = (status) => status === "approved" || status === "assigned";
const resolveReadyRawStatus = (assignedListerId) =>
  assignedListerId ? "assigned" : "approved";
const isTrainingHunter = (user) =>
  hasRole(user, "hunter") && String(user?.hunterStatus || "ACTIVE").toUpperCase() === "TRAINING";
const isDualRoleHunterLister = (user) => hasRole(user, "hunter") && hasRole(user, "lister");
const hasElevatedProductAccess = (user) => hasAnyRole(user, ["admin", "super_admin"]);
const isHunterScopedUser = (user) =>
  !hasElevatedProductAccess(user) &&
  (user.role === "hunter" ||
    (user.role !== "lister" && hasRole(user, "hunter") && !hasRole(user, "lister")));
const isListerScopedUser = (user) =>
  !hasElevatedProductAccess(user) &&
  (user.role === "lister" ||
    (user.role !== "hunter" && hasRole(user, "lister") && !hasRole(user, "hunter")));

const productSelect = `
  p.id,
  p.hunter_id AS "hunterId",
  hunter.name AS "hunterName",
  hunter.hunter_status AS "hunterStatus",
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
  p.status AS "rawStatus",
  p.listing_review_status AS "listingReviewStatus",
  p.listing_submitted_for_review_at AS "listingSubmittedForReviewAt",
  p.listing_reviewed_by AS "listingReviewedBy",
  listing_reviewer.name AS "listingReviewedByName",
  p.listing_reviewed_at AS "listingReviewedAt",
  p.listing_review_rejection_reason AS "listingReviewRejectionReason",
  p.listing_notes AS "listingNotes",
  p.review_notes AS "reviewNotes",
  p.original_hunter_id AS "originalHunterId",
  original_hunter.name AS "originalHunterName",
  p.current_hunter_id AS "currentHunterId",
  current_hunter.name AS "currentHunterName",
  p.rejection_reason AS "rejectionReason",
  p.rejected_by AS "rejectedBy",
  rejected_user.name AS "rejectedByName",
  p.rejected_at AS "rejectedAt",
  p.rejection_previous_status AS "rejectionPreviousStatus",
  p.rejection_previous_listing_review_status AS "rejectionPreviousListingReviewStatus",
  p.rejection_reversed_by AS "rejectionReversedBy",
  rejection_reverser.name AS "rejectionReversedByName",
  p.rejection_reversed_at AS "rejectionReversedAt",
  COALESCE(order_metrics.order_count, 0)::int AS "orderCount",
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
  LEFT JOIN users original_hunter ON original_hunter.id = p.original_hunter_id
  LEFT JOIN users current_hunter ON current_hunter.id = p.current_hunter_id
  LEFT JOIN users assigned_lister ON assigned_lister.id = p.assigned_lister_id
  LEFT JOIN users lister ON lister.id = p.listed_by
  LEFT JOIN users listing_reviewer ON listing_reviewer.id = p.listing_reviewed_by
  LEFT JOIN users rejected_user ON rejected_user.id = p.rejected_by
  LEFT JOIN users rejection_reverser ON rejection_reverser.id = p.rejection_reversed_by
  LEFT JOIN accounts account ON account.id = p.account_used
  LEFT JOIN listings listing ON listing.product_id = p.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS order_count
    FROM orders order_metrics_order
    WHERE order_metrics_order.product_id = p.id
      AND order_metrics_order.deleted_at IS NULL
  ) order_metrics ON TRUE
`;

const deriveWorkflowStatus = (row) => {
  if (row.rawStatus === "rejected") {
    return WORKFLOW_STATUS.REJECTED;
  }

  if (row.listingReviewStatus === LISTING_REVIEW_STATUS.PENDING) {
    return WORKFLOW_STATUS.LISTED_NEEDS_REVIEW;
  }

  if (row.listingReviewStatus === LISTING_REVIEW_STATUS.REJECTED) {
    return WORKFLOW_STATUS.LISTING_REJECTED;
  }

  if (row.rawStatus === "listed") {
    return WORKFLOW_STATUS.LISTED;
  }

  return WORKFLOW_STATUS.READY_FOR_LISTING;
};

const getEffectiveCriteria = (criteria, hunterStatus = "ACTIVE") => {
  if (String(hunterStatus || "").toUpperCase() !== "TRAINING") {
    return {
      minRoi: criteria.minRoi,
      minProfit: criteria.minProfit,
      minSoldCount: criteria.minSoldCount,
      feePercent: criteria.feePercent,
      asinRequired: criteria.asinRequired,
      minStockCount: criteria.minStockCount,
      minAlternateStockCount: criteria.minAlternateStockCount,
      minRating: criteria.minRating,
      customLabelRequired: criteria.customLabelRequired,
      watchersRequired: criteria.watchersRequired,
      minWatcherCount: criteria.minWatcherCount,
      minSalesLastTwoMonths: criteria.minSalesLastTwoMonths,
      basketCountRequired: criteria.basketCountRequired,
      deliveryDaysRequired: criteria.deliveryDaysRequired,
      maxDeliveryDays: criteria.maxDeliveryDays,
      monthlyGraphRequired: criteria.monthlyGraphRequired,
      categoryRequired: criteria.categoryRequired,
      amazonAltUrlRequired: criteria.amazonAltUrlRequired,
    };
  }

  return {
    minRoi: criteria.trainingMinRoi,
    minProfit: criteria.trainingMinProfit,
    minSoldCount: criteria.trainingMinSoldCount,
    feePercent: criteria.feePercent,
    asinRequired: criteria.trainingAsinRequired,
    minStockCount: criteria.trainingMinStockCount,
    minAlternateStockCount: criteria.minAlternateStockCount,
    minRating: criteria.trainingMinRating,
    customLabelRequired: criteria.trainingCustomLabelRequired,
    watchersRequired: true,
    minWatcherCount: criteria.trainingMinWatcherCount,
    minSalesLastTwoMonths: criteria.trainingMinSalesLastTwoMonths,
    basketCountRequired: criteria.basketCountRequired,
    deliveryDaysRequired: criteria.deliveryDaysRequired,
    maxDeliveryDays: criteria.maxDeliveryDays,
    monthlyGraphRequired: criteria.monthlyGraphRequired,
    categoryRequired: criteria.trainingCategoryRequired,
    amazonAltUrlRequired: criteria.trainingAmazonAltUrlRequired,
  };
};

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
    rawStatus: row.rawStatus,
    status: deriveWorkflowStatus(row),
    listingReviewStatus:
      row.listingReviewStatus || LISTING_REVIEW_STATUS.NOT_REQUIRED,
    listingSubmittedForReviewAt: row.listingSubmittedForReviewAt || null,
    listingReviewedBy: row.listingReviewedBy || null,
    listingReviewedByName: row.listingReviewedByName || null,
    listingReviewedAt: row.listingReviewedAt || null,
    listingReviewRejectionReason: row.listingReviewRejectionReason || null,
    listingNotes: row.listingNotes || null,
    reviewNotes: row.reviewNotes || null,
    originalHunterId: row.originalHunterId || row.hunterId,
    originalHunterName: row.originalHunterName || row.hunterName,
    currentHunterId: row.currentHunterId || row.hunterId,
    currentHunterName: row.currentHunterName || row.hunterName,
    rejectedBy: row.rejectedBy || null,
    rejectedByName: row.rejectedByName || null,
    rejectedAt: row.rejectedAt || null,
    rejectionPreviousStatus: row.rejectionPreviousStatus || null,
    rejectionPreviousListingReviewStatus:
      row.rejectionPreviousListingReviewStatus || null,
    rejectionReversedBy: row.rejectionReversedBy || null,
    rejectionReversedByName: row.rejectionReversedByName || null,
    rejectionReversedAt: row.rejectionReversedAt || null,
    orderCount: Number(row.orderCount || 0),
    hasOrders: Number(row.orderCount || 0) > 0,
    hunterStatus: row.hunterStatus || "ACTIVE",
    validationNotes: Array.isArray(row.validationNotes)
      ? row.validationNotes.filter(Boolean)
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
      getEffectiveCriteria(criteria, normalized.hunterStatus),
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

const buildDuplicateProductConflict = (product) =>
  new AppError(
    "This ASIN was submitted while you were filling the form. Please refresh and review the existing product.",
    409,
    {
      product: product
        ? {
            id: product.id,
            title: product.title,
            asin: product.asin,
            status: product.status,
            listedAt: product.listedAt,
            accountName: product.accountName,
          }
        : null,
    },
  );

const ensureProductColumns = async () => {
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS basket_count INTEGER,
      ADD COLUMN IF NOT EXISTS delivery_days INTEGER,
      ADD COLUMN IF NOT EXISTS monthly_graph_uptrend BOOLEAN,
      ADD COLUMN IF NOT EXISTS category TEXT,
      ADD COLUMN IF NOT EXISTS listing_review_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
      ADD COLUMN IF NOT EXISTS listing_submitted_for_review_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS listing_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS listing_reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS listing_review_rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS listing_notes TEXT,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS original_hunter_id UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS current_hunter_id UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejection_previous_status TEXT,
      ADD COLUMN IF NOT EXISTS rejection_previous_listing_review_status TEXT,
      ADD COLUMN IF NOT EXISTS rejection_reversed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS rejection_reversed_at TIMESTAMPTZ
  `);

  await pool.query(`
    UPDATE products
    SET original_hunter_id = COALESCE(original_hunter_id, hunter_id),
        current_hunter_id = COALESCE(current_hunter_id, hunter_id)
    WHERE original_hunter_id IS NULL OR current_hunter_id IS NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_ownership_transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      source_hunter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      target_hunter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      transferred_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_listing_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      field_changed TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
      edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_product_listing_history_product
      ON product_listing_history(product_id, edited_at DESC)
  `);
};

const getAssignedListerId = async (hunterId) => {
  const result = await pool.query(
    "SELECT lister_id FROM hunter_lister_assignments WHERE hunter_id = $1",
    [hunterId],
  );
  return result.rows[0]?.lister_id || null;
};

const EDITABLE_PRODUCT_FIELDS = [
  "title",
  "category",
  "amazonUrl",
  "amazonAltUrl",
  "ebayUrl",
  "customLabel",
  "amazonStockCount",
  "alternateAmazonStockCount",
  "soldCount",
  "rating",
  "productWatchers",
  "salesLastTwoMonths",
  "basketCount",
  "amazonPrice",
  "ebayPrice",
  "deliveryDays",
  "monthlyGraphUptrend",
];

const buildEditableProductPayload = (payload = {}) =>
  Object.fromEntries(
    EDITABLE_PRODUCT_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(payload, field),
    ).map((field) => [field, payload[field]]),
  );

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

const addWorkflowStatusFilter = (status, where, params) => {
  switch (status) {
    case WORKFLOW_STATUS.READY_FOR_LISTING:
      where.push(`p.status IN ('approved', 'assigned')`);
      where.push(
        `(COALESCE(UPPER(p.listing_review_status::text), '') IN ('', '${LISTING_REVIEW_STATUS.NOT_REQUIRED}', '${LISTING_REVIEW_STATUS.APPROVED}'))`,
      );
      return true;
    case WORKFLOW_STATUS.LISTED_NEEDS_REVIEW:
      where.push(
        `UPPER(COALESCE(p.listing_review_status::text, '')) = '${LISTING_REVIEW_STATUS.PENDING}' AND p.deleted_at IS NULL`,
      );
      return true;
    case WORKFLOW_STATUS.LISTING_REJECTED:
      where.push(
        `UPPER(COALESCE(p.listing_review_status::text, '')) = '${LISTING_REVIEW_STATUS.REJECTED}' AND p.deleted_at IS NULL`,
      );
      return true;
    case WORKFLOW_STATUS.LISTED:
      where.push(`p.status = 'listed'`);
      return true;
    case WORKFLOW_STATUS.REJECTED:
      where.push(`p.status = 'rejected'`);
      return true;
    default:
      return false;
  }
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

  if (isHunterScopedUser(user)) {
    add("p.hunter_id = ?", user.id);
    where.push("p.deleted_at IS NULL");
  }

  if (isListerScopedUser(user)) {
    add("p.assigned_lister_id = ?", user.id);
    where.push("p.deleted_at IS NULL");
  }

  if (!isHunterScopedUser(user) && !isListerScopedUser(user)) {
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
    const normalizedStatus = String(query.status).trim().toLowerCase();

    if (!addWorkflowStatusFilter(normalizedStatus, where, params)) {
      add("p.status = ?", query.status);
    }
  }

  if (query.category) {
    add("p.category = ?", query.category);
  }

  if (query.originalHunterId) {
    add("p.original_hunter_id = ?", query.originalHunterId);
  }

  if (query.currentHunterId) {
    add("p.current_hunter_id = ?", query.currentHunterId);
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
  if (isListerScopedUser(user)) {
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
    (product.deletedAt && !hasElevatedProductAccess(user))
  ) {
    throw new AppError("Product not found.", 404);
  }

  if (isHunterScopedUser(user) && product.hunterId !== user.id) {
    throw new AppError("Product not found.", 404);
  }

  if (
    isListerScopedUser(user) &&
    product.assignedListerId !== user.id &&
    product.listedBy !== user.id &&
    product.rejectedBy !== user.id
  ) {
    throw new AppError("Product not found.", 404);
  }

  const history = await pool.query(
    `
      SELECT
        transfer.id,
        transfer.source_hunter_id AS "sourceHunterId",
        source_hunter.name AS "sourceHunterName",
        transfer.target_hunter_id AS "targetHunterId",
        target_hunter.name AS "targetHunterName",
        transfer.transferred_by AS "transferredBy",
        actor.name AS "transferredByName",
        transfer.transferred_at AS "transferredAt"
      FROM product_ownership_transfers transfer
      JOIN users source_hunter ON source_hunter.id = transfer.source_hunter_id
      JOIN users target_hunter ON target_hunter.id = transfer.target_hunter_id
      JOIN users actor ON actor.id = transfer.transferred_by
      WHERE transfer.product_id = $1
      ORDER BY transfer.transferred_at DESC
    `,
    [id],
  );

  const listingHistory = await pool.query(
    `
      SELECT
        history.id,
        history.field_changed AS "fieldChanged",
        history.old_value AS "oldValue",
        history.new_value AS "newValue",
        history.edited_by AS "editedBy",
        actor.name AS "editedByName",
        history.edited_at AS "editedAt"
      FROM product_listing_history history
      LEFT JOIN users actor ON actor.id = history.edited_by
      WHERE history.product_id = $1
      ORDER BY history.edited_at DESC
      LIMIT 50
    `,
    [id],
  );

  return {
    ...product,
    transferHistory: history.rows,
    listingHistory: listingHistory.rows,
  };
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
  if (String(user?.hunterStatus || "ACTIVE").toUpperCase() === "REJECTED") {
    throw new AppError("Rejected hunters cannot submit new products.", 403);
  }

  if (isTrainingHunter(user) && !user.trainingRulesAcknowledgedAt) {
    throw new AppError(
      "Open Hunting Rules and acknowledge the training guide before submitting products.",
      403,
    );
  }

  if (!isTrainingHunter(user)) {
    await assertHunterReviewComplete(user);
  }
  const input = normalizeProductPayload(payload);
  const criteria = await getCriteria();
  const effectiveCriteria = getEffectiveCriteria(criteria, user.hunterStatus);
  const duplicateProduct = await getDuplicateProductByAsin(input.asin);

  if (duplicateProduct) {
    throw buildDuplicateProductConflict(duplicateProduct);
  }

  const analysis = analyzeProduct(input, effectiveCriteria, {
    hasDuplicateAsin: false,
  });
  const assignedListerId = await getAssignedListerId(user.id);
  const status =
    analysis.status === "approved" && assignedListerId
      ? "assigned"
      : analysis.status;
  const client = await pool.connect();
  let createdProductId = null;

  try {
    await client.query("BEGIN");

    if (input.asin) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [input.asin]);
      const lockedDuplicate = await client.query(
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
        [input.asin],
      );

      if (lockedDuplicate.rows[0]) {
        throw buildDuplicateProductConflict(productFromRow(lockedDuplicate.rows[0], criteria));
      }
    }

    const result = await client.query(
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

    createdProductId = result.rows[0].id;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    if (error?.code === "23505" && input.asin) {
      const conflictedProduct = await getDuplicateProductByAsin(input.asin);
      throw buildDuplicateProductConflict(conflictedProduct);
    }

    throw error;
  } finally {
    client.release();
  }

  const product = await getProductById(user, createdProductId);

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

const updateProduct = async (user, id, payload = {}) => {
  await ensureProductColumns();
  const product = await getProductById(user, id);

  if (product.deletedAt) {
    throw new AppError("Deleted products cannot be edited.", 400);
  }

  if (isHunterScopedUser(user) && product.status === "listed") {
    throw new AppError(
      "Listed products can no longer be edited by hunters.",
      403,
    );
  }

  const editablePayload = buildEditableProductPayload(payload);

  if (!Object.keys(editablePayload).length) {
    throw new AppError("No editable product fields were provided.", 400);
  }

  const normalizedExisting = normalizeProductPayload({
    title: product.title,
    category: product.category,
    asin: product.asin,
    amazonUrl: product.amazonUrl,
    amazonAltUrl: product.amazonAltUrl,
    ebayUrl: product.ebayUrl,
    customLabel: product.customLabel,
    amazonPrice: product.amazonPrice,
    ebayPrice: product.ebayPrice,
    amazonStockCount: product.amazonStockCount ?? product.stockQuantity,
    alternateAmazonStockCount: product.alternateAmazonStockCount,
    soldCount: product.soldCount,
    rating: product.rating,
    productWatchers: product.productWatchers,
    salesLastTwoMonths: product.salesLastTwoMonths,
    basketCount: product.basketCount,
    deliveryDays: product.deliveryDays,
    monthlyGraphUptrend: product.monthlyGraphUptrend,
  });
  const normalizedIncoming = normalizeProductPayload(editablePayload);
  const nextInput = { ...normalizedExisting };

  for (const field of EDITABLE_PRODUCT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(editablePayload, field)) {
      nextInput[field] = normalizedIncoming[field];
    }
  }

  const criteria = await getCriteria();
  const effectiveCriteria = getEffectiveCriteria(criteria, product.hunterStatus);
  const analysis = analyzeProduct(nextInput, effectiveCriteria, {
    hasDuplicateAsin: false,
  });
  const nextStatus =
    product.status === "listed"
      ? "listed"
      : analysis.status === "approved" && product.assignedListerId
        ? "assigned"
        : analysis.status;
  const nextRejectionReason =
    nextStatus === "rejected"
      ? analysis.primaryFailure || analysis.rejectionReason || null
      : null;

  await pool.query(
    `
      UPDATE products
      SET title = $2,
          category = $3,
          amazon_url = $4,
          amazon_alt_url = $5,
          ebay_url = $6,
          custom_label = $7,
          amazon_price = $8,
          ebay_price = $9,
          sold_count = $10,
          stock_quantity = $11,
          alternate_stock_quantity = $12,
          rating = $13,
          product_watchers = $14,
          sales_last_two_months = $15,
          basket_count = $16,
          delivery_days = $17,
          monthly_graph_uptrend = $18,
          fees = $19,
          profit = $20,
          roi = $21,
          status = $22,
          rejection_reason = $23,
          validation_notes = $24::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      id,
      nextInput.title || null,
      nextInput.category || null,
      nextInput.amazonUrl,
      nextInput.amazonAltUrl || null,
      nextInput.ebayUrl,
      nextInput.customLabel || null,
      nextInput.amazonPrice,
      nextInput.ebayPrice,
      nextInput.soldCount,
      nextInput.amazonStockCount,
      nextInput.alternateAmazonStockCount,
      nextInput.rating,
      nextInput.productWatchers,
      nextInput.salesLastTwoMonths,
      nextInput.basketCount,
      nextInput.deliveryDays,
      nextInput.monthlyGraphUptrend,
      analysis.fees,
      analysis.profit,
      analysis.roi,
      nextStatus,
      nextRejectionReason,
      JSON.stringify(analysis.validationNotes),
    ],
  );

  const updatedProduct = await getProductById(user, id);
  const action =
    isHunterScopedUser(user)
      ? "PRODUCT_UPDATED_BY_HUNTER"
      : "PRODUCT_EDITED_BY_ADMIN";

  await writeAuditLog({
    actorUserId: user.id,
    action,
    targetType: "product",
    targetId: updatedProduct.id,
    details: {
      status: updatedProduct.status,
      asin: updatedProduct.asin,
      title: updatedProduct.title,
      category: updatedProduct.category,
      qualityLabel: updatedProduct.qualityLabel || null,
    },
  });

  return updatedProduct;
};

const listAssignedHunters = async (user) => {
  const defaultLimit = await getConfiguredLimit("hunters");
  const pageRequest = normalizePageRequest(
    { page: 1, limit: defaultLimit },
    defaultLimit,
  );

  if (hasAnyRole(user, ["admin", "super_admin"])) {
    const result = await pool.query(
      `
        SELECT id, name, email, is_active AS "isActive"
        FROM users
        WHERE COALESCE(roles, jsonb_build_array(role::text)) @> '["hunter"]'::jsonb
          AND deleted_at IS NULL
          AND COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'disabled' END) = 'active'
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

const getListingReviewPermission = (user, product) => {
  if (hasAnyRole(user, ["admin", "super_admin"])) {
    return true;
  }

  if (!hasRole(user, "lister")) {
    return false;
  }

  if (!product.assignedListerId) {
    return false;
  }

  if (product.assignedListerId !== user.id) {
    return false;
  }

  return product.listedBy !== user.id;
};

const canUserSelfListProduct = async (user, product) => {
  if (!isDualRoleHunterLister(user) || product.hunterId !== user.id) {
    return { selfListing: false, allowed: true };
  }

  const hrSettings = await getHrSettings();
  const allowed = Boolean(hrSettings.allowDualRoleSelfListing);

  return {
    selfListing: true,
    allowed,
  };
};

const normalizeNullableText = (value) => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value || "").trim();
  return normalized || null;
};

const canCorrectListing = (user, product) => {
  if (hasElevatedProductAccess(user)) {
    return true;
  }

  if (!hasRole(user, "lister")) {
    return false;
  }

  return product.assignedListerId === user.id || product.listedBy === user.id;
};

const canUndoProductRejection = (user, product) => {
  if (hasElevatedProductAccess(user)) {
    return true;
  }

  if (!hasRole(user, "lister")) {
    return false;
  }

  return product.rejectedBy === user.id;
};

const normalizeListingCorrectionStatus = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = String(value).trim();
  const allowed = new Set([
    WORKFLOW_STATUS.READY_FOR_LISTING,
    WORKFLOW_STATUS.LISTED_NEEDS_REVIEW,
    WORKFLOW_STATUS.LISTED,
    WORKFLOW_STATUS.LISTING_REJECTED,
  ]);

  if (!allowed.has(normalized)) {
    throw new AppError("Listing status is not valid for correction.", 400);
  }

  return normalized;
};

const getCorrectionStatusUpdate = (status, product, user, reviewNotes) => {
  if (!status || status === product.status) {
    return null;
  }

  const readyStatus = resolveReadyRawStatus(product.assignedListerId);

  if (status === WORKFLOW_STATUS.LISTED) {
    return {
      rawStatus: "listed",
      reviewStatus: LISTING_REVIEW_STATUS.APPROVED,
      reviewedBy: user.id,
      reviewedAt: true,
      listedAt: true,
      rejectionReason: null,
    };
  }

  if (status === WORKFLOW_STATUS.LISTED_NEEDS_REVIEW) {
    return {
      rawStatus: readyStatus,
      reviewStatus: LISTING_REVIEW_STATUS.PENDING,
      reviewedBy: null,
      reviewedAt: false,
      listedAt: false,
      rejectionReason: null,
      submittedForReview: true,
    };
  }

  if (status === WORKFLOW_STATUS.LISTING_REJECTED) {
    return {
      rawStatus: readyStatus,
      reviewStatus: LISTING_REVIEW_STATUS.REJECTED,
      reviewedBy: user.id,
      reviewedAt: true,
      listedAt: false,
      rejectionReason:
        reviewNotes ||
        product.listingReviewRejectionReason ||
        "Listing correction requires review.",
    };
  }

  return {
    rawStatus: readyStatus,
    reviewStatus: LISTING_REVIEW_STATUS.NOT_REQUIRED,
    reviewedBy: null,
    reviewedAt: false,
    listedAt: false,
    rejectionReason: null,
  };
};

const formatHistoryValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value);
};

const normalizeTransferMode = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (normalized !== "all" && normalized !== "selected") {
    throw new AppError("Transfer mode must be all or selected.", 400);
  }

  return normalized;
};

const getProductsByIds = async (user, ids) => {
  if (!ids.length) {
    return [];
  }

  const criteria = await getCriteria();
  const params = [ids];
  const accessClauses = ["p.id = ANY($1::uuid[])"];

  if (isHunterScopedUser(user)) {
    params.push(user.id);
    accessClauses.push(`p.hunter_id = $${params.length}`);
  }

  if (isListerScopedUser(user)) {
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

  if (isListerScopedUser(user)) {
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
    isListerScopedUser(user)
      ? `
          SELECT account.id
          FROM accounts account
          JOIN lister_account_assignments assignment ON assignment.account_id = account.id
          WHERE account.id = $1
            AND account.is_active = TRUE
            AND assignment.lister_id = $2
        `
      : "SELECT id FROM accounts WHERE id = $1 AND is_active = TRUE",
    isListerScopedUser(user) ? [accountId, user.id] : [accountId],
  );

  if (account.rowCount === 0) {
    throw new AppError(
      isListerScopedUser(user)
        ? "This listing account is not assigned to you."
        : "Active account not found.",
      isListerScopedUser(user) ? 403 : 404,
    );
  }

  const client = await pool.connect();
  const reviewedProductIds = [];
  const finalListedProductIds = [];

  try {
    await client.query("BEGIN");
    for (const productId of productIds) {
      const item = itemById.get(productId) || {};
      const productResult = await client.query(
        `
          SELECT ${productSelect}
          ${productJoins}
          WHERE p.id = $1
            AND p.deleted_at IS NULL
          LIMIT 1
        `,
        [productId],
      );
      const product = productResult.rows[0]
        ? productFromRow(productResult.rows[0])
        : null;

      if (!product) {
        throw new AppError("Product not found.", 404);
      }

      if (isListerScopedUser(user) && product.assignedListerId !== user.id) {
        throw new AppError("Some products could not be updated for this lister.", 403);
      }

      if (!isReadyRawStatus(product.rawStatus) && !REVIEWABLE_WORKFLOW_STATUSES.has(product.status)) {
        throw new AppError("Only ready products can be listed from this queue.", 400);
      }

      const selfListing = await canUserSelfListProduct(user, product);

      if (selfListing.selfListing && !selfListing.allowed) {
        await writeAuditLog({
          actorUserId: user.id,
          action: "SELF_LISTING_BLOCKED",
          targetType: "product",
          targetId: product.id,
          details: {
            hunterId: product.hunterId,
            assignedListerId: product.assignedListerId,
          },
        });
        throw new AppError("You cannot list your own hunted product.", 403);
      }

      const nextRawStatus =
        selfListing.selfListing && selfListing.allowed
          ? resolveReadyRawStatus(product.assignedListerId)
          : "listed";
      const nextReviewStatus =
        selfListing.selfListing && selfListing.allowed
          ? LISTING_REVIEW_STATUS.PENDING
          : LISTING_REVIEW_STATUS.NOT_REQUIRED;

      await client.query(
        `
          UPDATE products
          SET status = $2,
              account_used = $3,
              listed_by = $4,
              listed_at = CASE WHEN $5 = 'listed' THEN NOW() ELSE NULL END,
              listing_review_status = $6,
              listing_submitted_for_review_at = CASE
                WHEN $6 = '${LISTING_REVIEW_STATUS.PENDING}' THEN NOW()
                ELSE listing_submitted_for_review_at
              END,
              listing_reviewed_by = CASE
                WHEN $6 IN ('${LISTING_REVIEW_STATUS.NOT_REQUIRED}', '${LISTING_REVIEW_STATUS.PENDING}') THEN NULL
                ELSE listing_reviewed_by
              END,
              listing_reviewed_at = CASE
                WHEN $6 IN ('${LISTING_REVIEW_STATUS.NOT_REQUIRED}', '${LISTING_REVIEW_STATUS.PENDING}') THEN NULL
                ELSE listing_reviewed_at
              END,
              listing_review_rejection_reason = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          productId,
          nextRawStatus,
          accountId,
          user.id,
          nextRawStatus,
          nextReviewStatus,
        ],
      );

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

      if (nextReviewStatus === LISTING_REVIEW_STATUS.PENDING) {
        reviewedProductIds.push(productId);
      } else {
        finalListedProductIds.push(productId);
      }
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
      action: reviewedProductIds.includes(productId)
        ? "LISTING_SUBMITTED_FOR_REVIEW"
        : "listing.complete",
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

const approveListingReview = async (user, id) => {
  await ensureProductColumns();
  const product = await getProductById(user, id);

  if (product.status !== WORKFLOW_STATUS.LISTED_NEEDS_REVIEW) {
    throw new AppError("This product is not waiting for listing review.", 400);
  }

  if (!getListingReviewPermission(user, product)) {
    throw new AppError("You cannot approve this listing review.", 403);
  }

  await pool.query(
    `
      UPDATE products
      SET status = 'listed',
          listed_at = NOW(),
          listing_review_status = $2,
          listing_reviewed_by = $3,
          listing_reviewed_at = NOW(),
          listing_review_rejection_reason = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, LISTING_REVIEW_STATUS.APPROVED, user.id],
  );

  const updated = await getProductById(user, id);

  await writeAuditLog({
    actorUserId: user.id,
    action: "LISTING_REVIEW_APPROVED",
    targetType: "product",
    targetId: id,
    details: {
      listedBy: updated.listedBy,
      assignedListerId: updated.assignedListerId,
      reviewedBy: user.id,
    },
  });

  return updated;
};

const rejectListingReview = async (user, id, payload = {}) => {
  await ensureProductColumns();
  const rejectionReason = String(payload.rejectionReason || "").trim();

  if (!rejectionReason) {
    throw new AppError("Rejection reason is required.", 400);
  }

  const product = await getProductById(user, id);

  if (product.status !== WORKFLOW_STATUS.LISTED_NEEDS_REVIEW) {
    throw new AppError("This product is not waiting for listing review.", 400);
  }

  if (!getListingReviewPermission(user, product)) {
    throw new AppError("You cannot reject this listing review.", 403);
  }

  await pool.query(
    `
      UPDATE products
      SET status = $2,
          listed_at = NULL,
          listing_review_status = $3,
          listing_reviewed_by = $4,
          listing_reviewed_at = NOW(),
          listing_review_rejection_reason = $5,
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      id,
      resolveReadyRawStatus(product.assignedListerId),
      LISTING_REVIEW_STATUS.REJECTED,
      user.id,
      rejectionReason,
    ],
  );

  const updated = await getProductById(user, id);

  await writeAuditLog({
    actorUserId: user.id,
    action: "LISTING_REVIEW_REJECTED",
    targetType: "product",
    targetId: id,
    details: {
      rejectionReason,
      listedBy: updated.listedBy,
      assignedListerId: updated.assignedListerId,
      reviewedBy: user.id,
    },
  });

  return updated;
};

const getOwnershipTransferSummary = async (user, sourceHunterId) => {
  if (!hasRole(user, "super_admin")) {
    throw new AppError("Only Super Admin can transfer product ownership.", 403);
  }

  const hunterResult = await pool.query(
    `
      SELECT id, name, email
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
        AND COALESCE(roles, jsonb_build_array(role::text)) @> '["hunter"]'::jsonb
      LIMIT 1
    `,
    [sourceHunterId],
  );

  if (!hunterResult.rows[0]) {
    throw new AppError("Source hunter not found.", 404);
  }

  const summary = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE p.status IN ('approved', 'assigned')
            AND COALESCE(p.listing_review_status, '${LISTING_REVIEW_STATUS.NOT_REQUIRED}') IN ('${LISTING_REVIEW_STATUS.NOT_REQUIRED}', '${LISTING_REVIEW_STATUS.APPROVED}')
        )::int AS "readyForListing",
        COUNT(*) FILTER (
          WHERE p.listing_review_status = '${LISTING_REVIEW_STATUS.PENDING}'
        )::int AS "listedNeedsReview",
        COUNT(*) FILTER (WHERE p.status = 'listed')::int AS listed,
        COUNT(*) FILTER (WHERE p.status = 'rejected')::int AS rejected
      FROM products p
      WHERE COALESCE(p.current_hunter_id, p.hunter_id) = $1
        AND p.deleted_at IS NULL
    `,
    [sourceHunterId],
  );

  const history = await pool.query(
    `
      SELECT
        transfer.id,
        transfer.product_id AS "productId",
        transfer.source_hunter_id AS "sourceHunterId",
        source_hunter.name AS "sourceHunterName",
        transfer.target_hunter_id AS "targetHunterId",
        target_hunter.name AS "targetHunterName",
        transfer.transferred_by AS "transferredBy",
        actor.name AS "transferredByName",
        transfer.transferred_at AS "transferredAt"
      FROM product_ownership_transfers transfer
      JOIN users source_hunter ON source_hunter.id = transfer.source_hunter_id
      JOIN users target_hunter ON target_hunter.id = transfer.target_hunter_id
      JOIN users actor ON actor.id = transfer.transferred_by
      WHERE transfer.source_hunter_id = $1
         OR transfer.target_hunter_id = $1
      ORDER BY transfer.transferred_at DESC
      LIMIT 12
    `,
    [sourceHunterId],
  );

  const totals = summary.rows[0] || {
    total: 0,
    readyForListing: 0,
    listedNeedsReview: 0,
    listed: 0,
    rejected: 0,
  };

  return {
    hunter: hunterResult.rows[0],
    summary: totals,
    warning:
      totals.total > 0
        ? `${hunterResult.rows[0].name} currently owns ${totals.total} active product${totals.total === 1 ? "" : "s"}. Transfer these before disabling the hunter.`
        : null,
    recentTransfers: history.rows,
  };
};

const transferProductOwnership = async (user, payload = {}) => {
  if (!hasRole(user, "super_admin")) {
    throw new AppError("Only Super Admin can transfer product ownership.", 403);
  }

  const sourceHunterId = String(payload.sourceHunterId || "").trim();
  const targetHunterId = String(payload.targetHunterId || "").trim();
  const mode = normalizeTransferMode(payload.transferMode ?? payload.mode);
  const selectedIds = [...new Set((payload.productIds || []).filter(Boolean))];

  if (!sourceHunterId || !targetHunterId) {
    throw new AppError("Source and target hunters are required.", 400);
  }

  if (sourceHunterId === targetHunterId) {
    throw new AppError("Source and target hunters must be different.", 400);
  }

  if (mode === "selected" && !selectedIds.length) {
    throw new AppError("Select at least one product to transfer.", 400);
  }

  const targetHunter = await pool.query(
    `
      SELECT id, name
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
        AND COALESCE(roles, jsonb_build_array(role::text)) @> '["hunter"]'::jsonb
      LIMIT 1
    `,
    [targetHunterId],
  );

  if (!targetHunter.rows[0]) {
    throw new AppError("Target hunter not found.", 404);
  }

  const params = [sourceHunterId];
  let whereSql = `
    WHERE COALESCE(p.current_hunter_id, p.hunter_id) = $1
      AND p.deleted_at IS NULL
  `;

  if (mode === "selected") {
    params.push(selectedIds);
    whereSql += ` AND p.id = ANY($2::uuid[])`;
  }

  const sourceProducts = await pool.query(
    `
      SELECT p.id, p.status, p.assigned_lister_id AS "assignedListerId"
      FROM products p
      ${whereSql}
      ORDER BY p.created_at DESC
    `,
    params,
  );

  if (!sourceProducts.rows.length) {
    throw new AppError("No products matched this transfer request.", 404);
  }

  const targetAssignedListerId = await getAssignedListerId(targetHunterId);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const product of sourceProducts.rows) {
      await client.query(
        `
          UPDATE products
          SET hunter_id = $2,
              current_hunter_id = $2,
              assigned_lister_id = CASE
                WHEN status = 'listed' THEN assigned_lister_id
                ELSE $3
              END,
              updated_at = NOW()
          WHERE id = $1
        `,
        [product.id, targetHunterId, targetAssignedListerId],
      );

      await client.query(
        `
          INSERT INTO product_ownership_transfers (
            product_id,
            source_hunter_id,
            target_hunter_id,
            transferred_by
          )
          VALUES ($1, $2, $3, $4)
        `,
        [product.id, sourceHunterId, targetHunterId, user.id],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  for (const product of sourceProducts.rows) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "PRODUCT_OWNERSHIP_TRANSFERRED",
      targetType: "product",
      targetId: product.id,
      details: {
        sourceHunterId,
        targetHunterId,
        targetAssignedListerId,
      },
    });
  }

  return {
    transferredCount: sourceProducts.rows.length,
    sourceHunterId,
    targetHunter: targetHunter.rows[0],
    products: await getProductsByIds(user, sourceProducts.rows.map((row) => row.id)),
  };
};

const correctListing = async (user, id, payload = {}) => {
  await ensureProductColumns();
  const product = await getProductById(user, id);

  if (!canCorrectListing(user, product)) {
    throw new AppError("You cannot correct this product listing.", 403);
  }

  if (product.hasOrders && !payload.confirmOrderImpact) {
    throw new AppError("This product already has orders associated with it.", 409, {
      orderCount: product.orderCount,
      requiresConfirmation: true,
    });
  }

  const listingUrl = normalizeNullableText(payload.listingUrl);
  const accountId = normalizeNullableText(payload.accountId);
  const listingNotes = normalizeNullableText(payload.listingNotes);
  const reviewNotes = normalizeNullableText(payload.reviewNotes);
  const listingStatus = normalizeListingCorrectionStatus(payload.listingStatus);

  if (listingUrl !== undefined && listingUrl && !isEbayUrl(listingUrl)) {
    throw new AppError("Listed eBay link must be a valid eBay URL.", 400);
  }

  let account = null;

  if (accountId !== undefined) {
    if (!accountId) {
      throw new AppError("Listing account is required.", 400);
    }

    const accountResult = await pool.query(
      isListerScopedUser(user)
        ? `
            SELECT account.id, account.name
            FROM accounts account
            JOIN lister_account_assignments assignment ON assignment.account_id = account.id
            WHERE account.id = $1
              AND account.is_active = TRUE
              AND assignment.lister_id = $2
            LIMIT 1
          `
        : `
            SELECT id, name
            FROM accounts
            WHERE id = $1
              AND is_active = TRUE
            LIMIT 1
          `,
      isListerScopedUser(user) ? [accountId, user.id] : [accountId],
    );

    if (!accountResult.rows[0]) {
      throw new AppError(
        isListerScopedUser(user)
          ? "This listing account is not assigned to you."
          : "Active account not found.",
        isListerScopedUser(user) ? 403 : 404,
      );
    }

    account = accountResult.rows[0];
  }

  const changes = [];
  const addChange = (fieldChanged, oldValue, newValue) => {
    const formattedOld = formatHistoryValue(oldValue);
    const formattedNew = formatHistoryValue(newValue);

    if (formattedOld !== formattedNew) {
      changes.push({ fieldChanged, oldValue: formattedOld, newValue: formattedNew });
    }
  };

  if (listingUrl !== undefined) {
    addChange("Listed Link", product.listingUrl, listingUrl);
  }

  if (accountId !== undefined) {
    addChange("Account", product.accountName || product.accountUsed, account?.name || accountId);
  }

  if (listingNotes !== undefined) {
    addChange("Listing Notes", product.listingNotes, listingNotes);
  }

  if (reviewNotes !== undefined) {
    addChange("Review Notes", product.reviewNotes, reviewNotes);
  }

  if (listingStatus !== undefined) {
    addChange("Listing Status", product.status, listingStatus);
  }

  if (!changes.length) {
    throw new AppError("No listing changes were provided.", 400);
  }

  const statusUpdate = getCorrectionStatusUpdate(listingStatus, product, user, reviewNotes);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updates = [];
    const values = [id];

    if (accountId !== undefined) {
      values.push(accountId);
      updates.push(`account_used = $${values.length}`);
    }

    if (listingNotes !== undefined) {
      values.push(listingNotes);
      updates.push(`listing_notes = $${values.length}`);
    }

    if (reviewNotes !== undefined) {
      values.push(reviewNotes);
      updates.push(`review_notes = $${values.length}`);
    }

    if (statusUpdate) {
      values.push(statusUpdate.rawStatus);
      updates.push(`status = $${values.length}`);
      values.push(statusUpdate.reviewStatus);
      updates.push(`listing_review_status = $${values.length}`);
      values.push(statusUpdate.reviewedBy);
      updates.push(`listing_reviewed_by = $${values.length}`);
      updates.push(
        statusUpdate.reviewedAt
          ? `listing_reviewed_at = NOW()`
          : `listing_reviewed_at = NULL`,
      );
      updates.push(
        statusUpdate.listedAt ? `listed_at = COALESCE(listed_at, NOW())` : `listed_at = NULL`,
      );
      updates.push(
        statusUpdate.submittedForReview
          ? `listing_submitted_for_review_at = COALESCE(listing_submitted_for_review_at, NOW())`
          : `listing_submitted_for_review_at = listing_submitted_for_review_at`,
      );
      values.push(statusUpdate.rejectionReason);
      updates.push(`listing_review_rejection_reason = $${values.length}`);
    }

    if (updates.length) {
      await client.query(
        `
          UPDATE products
          SET ${updates.join(", ")},
              updated_at = NOW()
          WHERE id = $1
        `,
        values,
      );
    }

    if (listingUrl !== undefined || accountId !== undefined) {
      const nextAccountId = accountId || product.accountUsed;
      const nextListingUrl = listingUrl !== undefined ? listingUrl : product.listingUrl;
      const nextListerId = product.listedBy || user.id;

      if (!nextAccountId) {
        throw new AppError("Listing account is required before saving listing data.", 400);
      }

      await client.query(
        `
          INSERT INTO listings (product_id, lister_id, account_id, listing_url)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (product_id) DO UPDATE
          SET lister_id = COALESCE(listings.lister_id, EXCLUDED.lister_id),
              account_id = EXCLUDED.account_id,
              listing_url = EXCLUDED.listing_url,
              updated_at = NOW()
        `,
        [id, nextListerId, nextAccountId, nextListingUrl],
      );
    }

    for (const change of changes) {
      await client.query(
        `
          INSERT INTO product_listing_history (
            product_id,
            field_changed,
            old_value,
            new_value,
            edited_by
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [id, change.fieldChanged, change.oldValue, change.newValue, user.id],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const updated = await getProductById(user, id);
  const details = {
    changes,
    orderCount: product.orderCount,
    confirmedOrderImpact: Boolean(product.hasOrders && payload.confirmOrderImpact),
  };

  await writeAuditLog({
    actorUserId: user.id,
    action: "LISTING_CORRECTED",
    targetType: "product",
    targetId: id,
    details,
  });

  if (changes.some((change) => change.fieldChanged === "Listed Link")) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "LISTING_LINK_CHANGED",
      targetType: "product",
      targetId: id,
      details,
    });
  }

  if (changes.some((change) => change.fieldChanged === "Account")) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "LISTING_ACCOUNT_CHANGED",
      targetType: "product",
      targetId: id,
      details,
    });
  }

  return updated;
};

const undoProductRejection = async (user, id) => {
  await ensureProductColumns();
  const product = await getProductById(user, id);

  if (product.rawStatus !== "rejected") {
    throw new AppError("Only rejected products can have rejection undone.", 400);
  }

  if (!canUndoProductRejection(user, product)) {
    throw new AppError("You cannot undo this product rejection.", 403);
  }

  const previousStatus =
    product.rejectionPreviousStatus || resolveReadyRawStatus(product.assignedListerId);
  const previousReviewStatus =
    product.rejectionPreviousListingReviewStatus || LISTING_REVIEW_STATUS.NOT_REQUIRED;

  await pool.query(
    `
      UPDATE products
      SET status = $2,
          listing_review_status = $3,
          rejection_reversed_by = $4,
          rejection_reversed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND status = 'rejected'
        AND deleted_at IS NULL
    `,
    [id, previousStatus, previousReviewStatus, user.id],
  );

  await pool.query(
    `
      INSERT INTO product_listing_history (
        product_id,
        field_changed,
        old_value,
        new_value,
        edited_by
      )
      VALUES ($1, 'Product Rejection', 'Rejected', 'Rejection undone', $2)
    `,
    [id, user.id],
  );

  const updated = await getProductById(user, id);

  await writeAuditLog({
    actorUserId: user.id,
    action: "PRODUCT_REJECTION_REVERSED",
    targetType: "product",
    targetId: id,
    details: {
      previousStatus,
      previousReviewStatus,
      rejectionReason: product.rejectionReason,
      rejectedBy: product.rejectedBy,
      rejectedAt: product.rejectedAt,
    },
  });

  return updated;
};

const rejectProduct = async (user, id, payload = {}) => {
  await ensureProductColumns();
  const rejectionReason = String(payload.rejectionReason || "").trim();

  if (!rejectionReason) {
    throw new AppError("Rejection reason is required.", 400);
  }

  if (isListerScopedUser(user)) {
    await assertListerListingUnblocked(user.id);
  }

  const params = [id, rejectionReason, user.id];
  let accessSql = "";

  if (isListerScopedUser(user)) {
    params.push(user.id);
    accessSql = `AND assigned_lister_id = $${params.length}`;
  }

  const result = await pool.query(
    `
      UPDATE products
      SET status = 'rejected',
          rejection_reason = $2,
          rejected_by = $3,
          rejected_at = NOW(),
          rejection_previous_status = status,
          rejection_previous_listing_review_status = listing_review_status,
          rejection_reversed_by = NULL,
          rejection_reversed_at = NULL,
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
    action:
      hasAnyRole(user, ["admin", "super_admin"])
        ? "PRODUCT_REJECTED_BY_ADMIN"
        : "product.rejected",
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

const bulkUpdateProducts = async (user, payload = {}) => {
  await ensureProductColumns();
  const productIds = [...new Set((payload.productIds || []).filter(Boolean))];

  if (productIds.length === 0) {
    throw new AppError("Select at least one product to update.", 400);
  }

  const title = String(payload.title || "").trim();
  const customLabel = String(payload.customLabel || "").trim();
  const category = String(payload.category || "").trim();
  const amazonUrl = String(payload.amazonUrl || "").trim();
  const ebayUrl = String(payload.ebayUrl || "").trim();
  const status = String(payload.status || "").trim();
  const rejectionReason = String(payload.rejectionReason || "").trim();
  const updates = [];
  const values = [productIds];

  if (title) {
    values.push(title);
    updates.push(`title = $${values.length}`);
  }

  if (customLabel) {
    values.push(customLabel);
    updates.push(`custom_label = $${values.length}`);
  }

  if (category) {
    values.push(category);
    updates.push(`category = $${values.length}`);
  }

  if (amazonUrl) {
    if (!isAmazonUrl(amazonUrl)) {
      throw new AppError("Amazon link must be a valid Amazon URL.", 400);
    }

    values.push(amazonUrl);
    updates.push(`amazon_url = $${values.length}`);
  }

  if (ebayUrl) {
    if (!isEbayUrl(ebayUrl)) {
      throw new AppError("eBay link must be a valid eBay URL.", 400);
    }

    values.push(ebayUrl);
    updates.push(`ebay_url = $${values.length}`);
  }

  if (status) {
    if (!["approved", "rejected"].includes(status)) {
      throw new AppError("Bulk status update only supports approved or rejected.", 400);
    }

    values.push(status);
    updates.push(`status = $${values.length}`);

    if (status === "approved") {
      updates.push(`rejection_reason = NULL`);
      updates.push(`rejected_by = NULL`);
      updates.push(`rejected_at = NULL`);
      updates.push(`rejection_previous_status = NULL`);
      updates.push(`rejection_previous_listing_review_status = NULL`);
      updates.push(`rejection_reversed_by = NULL`);
      updates.push(`rejection_reversed_at = NULL`);
    }

    if (status === "rejected") {
      if (!rejectionReason) {
        throw new AppError("Rejection reason is required when rejecting selected products.", 400);
      }

      values.push(rejectionReason);
      updates.push(`rejection_reason = $${values.length}`);
      values.push(user.id);
      updates.push(`rejected_by = $${values.length}`);
      updates.push(`rejected_at = NOW()`);
      updates.push(`rejection_previous_status = CASE WHEN status = 'rejected' THEN rejection_previous_status ELSE status END`);
      updates.push(`rejection_previous_listing_review_status = CASE WHEN status = 'rejected' THEN rejection_previous_listing_review_status ELSE listing_review_status END`);
      updates.push(`rejection_reversed_by = NULL`);
      updates.push(`rejection_reversed_at = NULL`);
    }
  }

  if (!updates.length) {
    throw new AppError("Add at least one field to bulk update.", 400);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

      const result = await client.query(
        `
          UPDATE products
          SET ${updates.join(", ")},
              updated_at = NOW()
          WHERE id = ANY($1::uuid[])
            AND deleted_at IS NULL
          RETURNING id
        `,
        values,
      );

    if (result.rowCount !== productIds.length) {
      throw new AppError("Some selected products could not be updated.", 400);
    }

    if (ebayUrl) {
      await client.query(
        `
          UPDATE listings
          SET listing_url = $2,
              updated_at = NOW()
          WHERE product_id = ANY($1::uuid[])
        `,
        [productIds, ebayUrl],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const changedFields = {
    ...(title ? { title } : {}),
    ...(customLabel ? { customLabel } : {}),
    ...(category ? { category } : {}),
    ...(amazonUrl ? { amazonUrl } : {}),
    ...(ebayUrl ? { ebayUrl } : {}),
    ...(status ? { status } : {}),
    ...(status === "rejected" && rejectionReason ? { rejectionReason } : {}),
  };

  for (const productId of productIds) {
    await writeAuditLog({
      actorUserId: user.id,
      action:
        status === "approved"
          ? "PRODUCT_BULK_APPROVED"
          : status === "rejected"
            ? "PRODUCT_BULK_REJECTED"
            : "product.bulk_update",
      targetType: "product",
      targetId: productId,
      details: changedFields,
    });
  }

  return getProductsByIds(user, productIds);
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
  ensureProductColumns,
  createProduct,
  updateProduct,
  listProducts,
  getProductById,
  checkAsinAvailability,
  listAssignedHunters,
  markProductsListed,
  approveListingReview,
  rejectListingReview,
  getOwnershipTransferSummary,
  transferProductOwnership,
  correctListing,
  undoProductRejection,
  rejectProduct,
  softDeleteProducts,
  bulkUpdateProducts,
  permanentlyDeleteProducts,
  restoreProduct,
};
