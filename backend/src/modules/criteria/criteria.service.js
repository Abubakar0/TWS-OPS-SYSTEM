const { pool } = require('../../db/pool');
const { env } = require('../../config/env');
const { writeAuditLog } = require('../users/audit.service');

const fallbackCriteria = {
  minRoi: env.validation.minRoi,
  minProfit: env.validation.minProfit,
  minSoldCount: env.validation.minSoldCount,
  feePercent: env.validation.feePercent,
  asinRequired: env.validation.asinRequired,
  minStockCount: env.validation.minStockCount,
  minAlternateStockCount: env.validation.minAlternateStockCount,
  minRating: env.validation.minRating,
  customLabelRequired: env.validation.customLabelRequired,
  watchersRequired: env.validation.watchersRequired,
  minWatcherCount: env.validation.minWatcherCount,
  minSalesLastTwoMonths: env.validation.minSalesLastTwoMonths,
  basketCountRequired: false,
  deliveryDaysRequired: false,
  maxDeliveryDays: env.validation.maxDeliveryDays,
  monthlyGraphRequired: false,
  categoryRequired: false,
  amazonAltUrlRequired: false,
  trainingMinRoi: env.validation.minRoi,
  trainingMinProfit: env.validation.minProfit,
  trainingMinSoldCount: env.validation.minSoldCount,
  trainingMinStockCount: env.validation.minStockCount,
  trainingMinRating: env.validation.minRating,
  trainingMinWatcherCount: env.validation.minWatcherCount,
  trainingMinSalesLastTwoMonths: env.validation.minSalesLastTwoMonths,
  trainingAsinRequired: true,
  trainingCustomLabelRequired: false,
  trainingCategoryRequired: false,
  trainingAmazonAltUrlRequired: false,
  trainingMaxRejectedProductsAllowed: 10,
  trainingMinApprovalRateForActivation: 60,
  trainingMinListedProductsForActivation: 5,
  trainingMinOrdersGeneratedForActivation: 1,
};

const normalizeCriteria = (row) => ({
  minRoi: Number(row.minRoi),
  minProfit: Number(row.minProfit),
  minSoldCount: Number(row.minSoldCount),
  feePercent: Number(row.feePercent),
  asinRequired: Boolean(row.asinRequired),
  minStockCount: Number(row.minStockCount),
  minAlternateStockCount: Number(row.minAlternateStockCount),
  minRating: Number(row.minRating),
  customLabelRequired: Boolean(row.customLabelRequired),
  watchersRequired: Boolean(row.watchersRequired),
  minWatcherCount: Number(row.minWatcherCount),
  minSalesLastTwoMonths: Number(row.minSalesLastTwoMonths),
  basketCountRequired: Boolean(row.basketCountRequired),
  deliveryDaysRequired: Boolean(row.deliveryDaysRequired),
  maxDeliveryDays: Number(row.maxDeliveryDays),
  monthlyGraphRequired: Boolean(row.monthlyGraphRequired),
  categoryRequired: Boolean(row.categoryRequired),
  amazonAltUrlRequired: Boolean(row.amazonAltUrlRequired),
  trainingMinRoi: Number(row.trainingMinRoi),
  trainingMinProfit: Number(row.trainingMinProfit),
  trainingMinSoldCount: Number(row.trainingMinSoldCount),
  trainingMinStockCount: Number(row.trainingMinStockCount),
  trainingMinRating: Number(row.trainingMinRating),
  trainingMinWatcherCount: Number(row.trainingMinWatcherCount),
  trainingMinSalesLastTwoMonths: Number(row.trainingMinSalesLastTwoMonths),
  trainingAsinRequired: Boolean(row.trainingAsinRequired),
  trainingCustomLabelRequired: Boolean(row.trainingCustomLabelRequired),
  trainingCategoryRequired: Boolean(row.trainingCategoryRequired),
  trainingAmazonAltUrlRequired: Boolean(row.trainingAmazonAltUrlRequired),
  trainingMaxRejectedProductsAllowed: Number(row.trainingMaxRejectedProductsAllowed),
  trainingMinApprovalRateForActivation: Number(row.trainingMinApprovalRateForActivation),
  trainingMinListedProductsForActivation: Number(row.trainingMinListedProductsForActivation),
  trainingMinOrdersGeneratedForActivation: Number(row.trainingMinOrdersGeneratedForActivation),
  updatedAt: row.updatedAt || null,
  updatedBy: row.updatedBy || null,
});

const ensureCriteriaColumns = async () => {
  await pool.query(`
    ALTER TABLE hunting_criteria
      ADD COLUMN IF NOT EXISTS basket_count_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS delivery_days_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS max_delivery_days INTEGER NOT NULL DEFAULT 7,
      ADD COLUMN IF NOT EXISTS monthly_graph_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS category_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS amazon_alt_url_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS training_min_roi NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS training_min_profit NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS training_min_sold_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS training_min_stock_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS training_min_rating NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS training_min_watcher_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS training_min_sales_last_two_months INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS training_asin_required BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS training_custom_label_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS training_category_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS training_amazon_alt_url_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS training_max_rejected_products_allowed INTEGER NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS training_min_approval_rate_for_activation NUMERIC(10, 2) NOT NULL DEFAULT 60,
      ADD COLUMN IF NOT EXISTS training_min_listed_products_for_activation INTEGER NOT NULL DEFAULT 5,
      ADD COLUMN IF NOT EXISTS training_min_orders_generated_for_activation INTEGER NOT NULL DEFAULT 1
  `);
};

const criteriaSelect = `
  SELECT
    min_roi AS "minRoi",
    min_profit AS "minProfit",
    min_sold_count AS "minSoldCount",
    fee_percent AS "feePercent",
    asin_required AS "asinRequired",
    min_stock_count AS "minStockCount",
    min_alt_stock_count AS "minAlternateStockCount",
    min_rating AS "minRating",
    custom_label_required AS "customLabelRequired",
    watchers_required AS "watchersRequired",
    min_watcher_count AS "minWatcherCount",
    min_sales_last_two_months AS "minSalesLastTwoMonths",
    basket_count_required AS "basketCountRequired",
    delivery_days_required AS "deliveryDaysRequired",
    max_delivery_days AS "maxDeliveryDays",
    monthly_graph_required AS "monthlyGraphRequired",
    category_required AS "categoryRequired",
    amazon_alt_url_required AS "amazonAltUrlRequired",
    training_min_roi AS "trainingMinRoi",
    training_min_profit AS "trainingMinProfit",
    training_min_sold_count AS "trainingMinSoldCount",
    training_min_stock_count AS "trainingMinStockCount",
    training_min_rating AS "trainingMinRating",
    training_min_watcher_count AS "trainingMinWatcherCount",
    training_min_sales_last_two_months AS "trainingMinSalesLastTwoMonths",
    training_asin_required AS "trainingAsinRequired",
    training_custom_label_required AS "trainingCustomLabelRequired",
    training_category_required AS "trainingCategoryRequired",
    training_amazon_alt_url_required AS "trainingAmazonAltUrlRequired",
    training_max_rejected_products_allowed AS "trainingMaxRejectedProductsAllowed",
    training_min_approval_rate_for_activation AS "trainingMinApprovalRateForActivation",
    training_min_listed_products_for_activation AS "trainingMinListedProductsForActivation",
    training_min_orders_generated_for_activation AS "trainingMinOrdersGeneratedForActivation",
    updated_at AS "updatedAt",
    updated_by AS "updatedBy"
  FROM hunting_criteria
  WHERE id = 1
`;

const getCriteria = async () => {
  try {
    await ensureCriteriaColumns();
    const result = await pool.query(criteriaSelect);

    if (!result.rows[0]) {
      return fallbackCriteria;
    }

    return normalizeCriteria(result.rows[0]);
  } catch (error) {
    return fallbackCriteria;
  }
};

const updateCriteria = async (user, payload) => {
  const current = await getCriteria();
  const next = {
    minRoi: Number(payload.minRoi ?? current.minRoi),
    minProfit: Number(payload.minProfit ?? current.minProfit),
    minSoldCount: Number(payload.minSoldCount ?? current.minSoldCount),
    feePercent: Number(payload.feePercent ?? current.feePercent),
    asinRequired: Boolean(payload.asinRequired ?? current.asinRequired),
    minStockCount: Number(payload.minStockCount ?? current.minStockCount),
    minAlternateStockCount: Number(payload.minAlternateStockCount ?? current.minAlternateStockCount),
    minRating: Number(payload.minRating ?? current.minRating),
    customLabelRequired: Boolean(payload.customLabelRequired ?? current.customLabelRequired),
    watchersRequired: Boolean(payload.watchersRequired ?? current.watchersRequired),
    minWatcherCount: Number(payload.minWatcherCount ?? current.minWatcherCount),
    minSalesLastTwoMonths: Number(payload.minSalesLastTwoMonths ?? current.minSalesLastTwoMonths),
    basketCountRequired: Boolean(payload.basketCountRequired ?? current.basketCountRequired),
    deliveryDaysRequired: Boolean(payload.deliveryDaysRequired ?? current.deliveryDaysRequired),
    maxDeliveryDays: Number(payload.maxDeliveryDays ?? current.maxDeliveryDays),
    monthlyGraphRequired: Boolean(payload.monthlyGraphRequired ?? current.monthlyGraphRequired),
    categoryRequired: Boolean(payload.categoryRequired ?? current.categoryRequired),
    amazonAltUrlRequired: Boolean(payload.amazonAltUrlRequired ?? current.amazonAltUrlRequired),
    trainingMinRoi: Number(payload.trainingMinRoi ?? current.trainingMinRoi),
    trainingMinProfit: Number(payload.trainingMinProfit ?? current.trainingMinProfit),
    trainingMinSoldCount: Number(payload.trainingMinSoldCount ?? current.trainingMinSoldCount),
    trainingMinStockCount: Number(payload.trainingMinStockCount ?? current.trainingMinStockCount),
    trainingMinRating: Number(payload.trainingMinRating ?? current.trainingMinRating),
    trainingMinWatcherCount: Number(
      payload.trainingMinWatcherCount ?? current.trainingMinWatcherCount,
    ),
    trainingMinSalesLastTwoMonths: Number(
      payload.trainingMinSalesLastTwoMonths ?? current.trainingMinSalesLastTwoMonths,
    ),
    trainingAsinRequired: Boolean(payload.trainingAsinRequired ?? current.trainingAsinRequired),
    trainingCustomLabelRequired: Boolean(
      payload.trainingCustomLabelRequired ?? current.trainingCustomLabelRequired,
    ),
    trainingCategoryRequired: Boolean(
      payload.trainingCategoryRequired ?? current.trainingCategoryRequired,
    ),
    trainingAmazonAltUrlRequired: Boolean(
      payload.trainingAmazonAltUrlRequired ?? current.trainingAmazonAltUrlRequired,
    ),
    trainingMaxRejectedProductsAllowed: Number(
      payload.trainingMaxRejectedProductsAllowed ?? current.trainingMaxRejectedProductsAllowed,
    ),
    trainingMinApprovalRateForActivation: Number(
      payload.trainingMinApprovalRateForActivation ?? current.trainingMinApprovalRateForActivation,
    ),
    trainingMinListedProductsForActivation: Number(
      payload.trainingMinListedProductsForActivation ?? current.trainingMinListedProductsForActivation,
    ),
    trainingMinOrdersGeneratedForActivation: Number(
      payload.trainingMinOrdersGeneratedForActivation ?? current.trainingMinOrdersGeneratedForActivation,
    ),
  };

  await ensureCriteriaColumns();
  const result = await pool.query(
    `
      INSERT INTO hunting_criteria (
        id,
        min_roi,
        min_profit,
        min_sold_count,
        fee_percent,
        asin_required,
        min_stock_count,
        min_alt_stock_count,
        min_rating,
        custom_label_required,
        watchers_required,
        min_watcher_count,
        min_sales_last_two_months,
        basket_count_required,
        delivery_days_required,
        max_delivery_days,
        monthly_graph_required,
        category_required,
        amazon_alt_url_required,
        training_min_roi,
        training_min_profit,
        training_min_sold_count,
        training_min_stock_count,
        training_min_rating,
        training_min_watcher_count,
        training_min_sales_last_two_months,
        training_asin_required,
        training_custom_label_required,
        training_category_required,
        training_amazon_alt_url_required,
        training_max_rejected_products_allowed,
        training_min_approval_rate_for_activation,
        training_min_listed_products_for_activation,
        training_min_orders_generated_for_activation,
        updated_by,
        updated_at
      )
      VALUES (
        1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
        $32, $33, $34, NOW()
      )
      ON CONFLICT (id) DO UPDATE
      SET min_roi = EXCLUDED.min_roi,
          min_profit = EXCLUDED.min_profit,
          min_sold_count = EXCLUDED.min_sold_count,
          fee_percent = EXCLUDED.fee_percent,
          asin_required = EXCLUDED.asin_required,
          min_stock_count = EXCLUDED.min_stock_count,
          min_alt_stock_count = EXCLUDED.min_alt_stock_count,
          min_rating = EXCLUDED.min_rating,
          custom_label_required = EXCLUDED.custom_label_required,
          watchers_required = EXCLUDED.watchers_required,
          min_watcher_count = EXCLUDED.min_watcher_count,
          min_sales_last_two_months = EXCLUDED.min_sales_last_two_months,
          basket_count_required = EXCLUDED.basket_count_required,
          delivery_days_required = EXCLUDED.delivery_days_required,
          max_delivery_days = EXCLUDED.max_delivery_days,
          monthly_graph_required = EXCLUDED.monthly_graph_required,
          category_required = EXCLUDED.category_required,
          amazon_alt_url_required = EXCLUDED.amazon_alt_url_required,
          training_min_roi = EXCLUDED.training_min_roi,
          training_min_profit = EXCLUDED.training_min_profit,
          training_min_sold_count = EXCLUDED.training_min_sold_count,
          training_min_stock_count = EXCLUDED.training_min_stock_count,
          training_min_rating = EXCLUDED.training_min_rating,
          training_min_watcher_count = EXCLUDED.training_min_watcher_count,
          training_min_sales_last_two_months = EXCLUDED.training_min_sales_last_two_months,
          training_asin_required = EXCLUDED.training_asin_required,
          training_custom_label_required = EXCLUDED.training_custom_label_required,
          training_category_required = EXCLUDED.training_category_required,
          training_amazon_alt_url_required = EXCLUDED.training_amazon_alt_url_required,
          training_max_rejected_products_allowed = EXCLUDED.training_max_rejected_products_allowed,
          training_min_approval_rate_for_activation = EXCLUDED.training_min_approval_rate_for_activation,
          training_min_listed_products_for_activation = EXCLUDED.training_min_listed_products_for_activation,
          training_min_orders_generated_for_activation = EXCLUDED.training_min_orders_generated_for_activation,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      RETURNING
        min_roi AS "minRoi",
        min_profit AS "minProfit",
        min_sold_count AS "minSoldCount",
        fee_percent AS "feePercent",
        asin_required AS "asinRequired",
        min_stock_count AS "minStockCount",
        min_alt_stock_count AS "minAlternateStockCount",
        min_rating AS "minRating",
        custom_label_required AS "customLabelRequired",
        watchers_required AS "watchersRequired",
        min_watcher_count AS "minWatcherCount",
        min_sales_last_two_months AS "minSalesLastTwoMonths",
        basket_count_required AS "basketCountRequired",
        delivery_days_required AS "deliveryDaysRequired",
        max_delivery_days AS "maxDeliveryDays",
        monthly_graph_required AS "monthlyGraphRequired",
        category_required AS "categoryRequired",
        amazon_alt_url_required AS "amazonAltUrlRequired",
        training_min_roi AS "trainingMinRoi",
        training_min_profit AS "trainingMinProfit",
        training_min_sold_count AS "trainingMinSoldCount",
        training_min_stock_count AS "trainingMinStockCount",
        training_min_rating AS "trainingMinRating",
        training_min_watcher_count AS "trainingMinWatcherCount",
        training_min_sales_last_two_months AS "trainingMinSalesLastTwoMonths",
        training_asin_required AS "trainingAsinRequired",
        training_custom_label_required AS "trainingCustomLabelRequired",
        training_category_required AS "trainingCategoryRequired",
        training_amazon_alt_url_required AS "trainingAmazonAltUrlRequired",
        training_max_rejected_products_allowed AS "trainingMaxRejectedProductsAllowed",
        training_min_approval_rate_for_activation AS "trainingMinApprovalRateForActivation",
        training_min_listed_products_for_activation AS "trainingMinListedProductsForActivation",
        training_min_orders_generated_for_activation AS "trainingMinOrdersGeneratedForActivation",
        updated_at AS "updatedAt",
        updated_by AS "updatedBy"
    `,
    [
      next.minRoi,
      next.minProfit,
      next.minSoldCount,
      next.feePercent,
      next.asinRequired,
      next.minStockCount,
      next.minAlternateStockCount,
      next.minRating,
      next.customLabelRequired,
      next.watchersRequired,
      next.minWatcherCount,
      next.minSalesLastTwoMonths,
      next.basketCountRequired,
      next.deliveryDaysRequired,
      next.maxDeliveryDays,
      next.monthlyGraphRequired,
      next.categoryRequired,
      next.amazonAltUrlRequired,
      next.trainingMinRoi,
      next.trainingMinProfit,
      next.trainingMinSoldCount,
      next.trainingMinStockCount,
      next.trainingMinRating,
      next.trainingMinWatcherCount,
      next.trainingMinSalesLastTwoMonths,
      next.trainingAsinRequired,
      next.trainingCustomLabelRequired,
      next.trainingCategoryRequired,
      next.trainingAmazonAltUrlRequired,
      next.trainingMaxRejectedProductsAllowed,
      next.trainingMinApprovalRateForActivation,
      next.trainingMinListedProductsForActivation,
      next.trainingMinOrdersGeneratedForActivation,
      user.id,
    ],
  );

  const criteria = normalizeCriteria(result.rows[0]);

  await writeAuditLog({
    actorUserId: user.id,
    action: 'settings.criteria.update',
    targetType: 'criteria',
    targetId: user.id,
    details: criteria,
  });

  return criteria;
};

module.exports = {
  getCriteria,
  updateCriteria,
};
