const { pool } = require('../../db/pool');
const { env } = require('../../config/env');

const fallbackCriteria = {
  minRoi: env.validation.minRoi,
  minProfit: env.validation.minProfit,
  minSoldCount: env.validation.minSoldCount,
  feePercent: env.validation.feePercent,
  asinRequired: env.validation.asinRequired,
};

const normalizeCriteria = (row) => ({
  minRoi: Number(row.minRoi),
  minProfit: Number(row.minProfit),
  minSoldCount: Number(row.minSoldCount),
  feePercent: Number(row.feePercent),
  asinRequired: Boolean(row.asinRequired),
  updatedAt: row.updatedAt || null,
  updatedBy: row.updatedBy || null,
});

const getCriteria = async () => {
  try {
    const result = await pool.query(
      `
        SELECT
          min_roi AS "minRoi",
          min_profit AS "minProfit",
          min_sold_count AS "minSoldCount",
          fee_percent AS "feePercent",
          asin_required AS "asinRequired",
          updated_at AS "updatedAt",
          updated_by AS "updatedBy"
        FROM hunting_criteria
        WHERE id = 1
      `,
    );

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
  };

  const result = await pool.query(
    `
      INSERT INTO hunting_criteria (
        id,
        min_roi,
        min_profit,
        min_sold_count,
        fee_percent,
        asin_required,
        updated_by,
        updated_at
      )
      VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE
      SET min_roi = EXCLUDED.min_roi,
          min_profit = EXCLUDED.min_profit,
          min_sold_count = EXCLUDED.min_sold_count,
          fee_percent = EXCLUDED.fee_percent,
          asin_required = EXCLUDED.asin_required,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      RETURNING
        min_roi AS "minRoi",
        min_profit AS "minProfit",
        min_sold_count AS "minSoldCount",
        fee_percent AS "feePercent",
        asin_required AS "asinRequired",
        updated_at AS "updatedAt",
        updated_by AS "updatedBy"
    `,
    [next.minRoi, next.minProfit, next.minSoldCount, next.feePercent, next.asinRequired, user.id],
  );

  return normalizeCriteria(result.rows[0]);
};

module.exports = {
  getCriteria,
  updateCriteria,
};
