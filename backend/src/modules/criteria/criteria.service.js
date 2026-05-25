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
  updatedAt: row.updatedAt || null,
  updatedBy: row.updatedBy || null,
});

const ensureCriteriaColumns = async () => {
  await pool.query(`
    ALTER TABLE hunting_criteria
      ADD COLUMN IF NOT EXISTS basket_count_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS delivery_days_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS max_delivery_days INTEGER NOT NULL DEFAULT 7,
      ADD COLUMN IF NOT EXISTS monthly_graph_required BOOLEAN NOT NULL DEFAULT FALSE
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
        updated_by,
        updated_at
      )
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
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
