const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { writeAuditLog } = require('../users/audit.service');

const PAKISTAN_TIMEZONE = 'Asia/Karachi';

const toPkDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PAKISTAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value || '';

  return {
    reviewDate: `${read('year')}-${read('month')}-${read('day')}`,
    weekday: read('weekday'),
  };
};

const ensureWeeklyReviewTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hunter_weekly_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      hunter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      review_date DATE NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (hunter_id, review_date)
    )
  `);
};

const getWeeklyReviewStatus = async (user) => {
  await ensureWeeklyReviewTable();

  const { reviewDate, weekday } = toPkDateParts();
  const isReviewDay = weekday === 'Sat';
  const result = await pool.query(
    `
      SELECT id, review_date AS "reviewDate", notes, updated_at AS "updatedAt"
      FROM hunter_weekly_reviews
      WHERE hunter_id = $1
        AND review_date = $2::date
      LIMIT 1
    `,
    [user.id, reviewDate],
  );

  const currentReview = result.rows[0] || null;

  return {
    isReviewDay,
    required: isReviewDay && !currentReview,
    completed: Boolean(currentReview),
    reviewDate,
    review: currentReview,
  };
};

const completeWeeklyReview = async (user, payload = {}) => {
  await ensureWeeklyReviewTable();
  const { reviewDate, weekday } = toPkDateParts();

  if (weekday !== 'Sat') {
    throw new AppError('Weekly product review can only be completed on Saturday.', 400);
  }

  const notes = String(payload.notes || '').trim() || null;
  const result = await pool.query(
    `
      INSERT INTO hunter_weekly_reviews (hunter_id, review_date, notes, created_at, updated_at)
      VALUES ($1, $2::date, $3, NOW(), NOW())
      ON CONFLICT (hunter_id, review_date) DO UPDATE
      SET notes = EXCLUDED.notes,
          updated_at = NOW()
      RETURNING id, review_date AS "reviewDate", notes, updated_at AS "updatedAt"
    `,
    [user.id, reviewDate, notes],
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'hunter.review.complete',
    targetType: 'weekly_review',
    targetId: result.rows[0].id,
    details: {
      reviewDate,
      notes,
    },
  });

  return result.rows[0];
};

const assertHunterReviewComplete = async (user) => {
  if (!user || user.role !== 'hunter') {
    return;
  }

  const status = await getWeeklyReviewStatus(user);

  if (!status.required) {
    return;
  }

  throw new AppError(
    'Saturday review is required before you can submit new products. Please review your products first.',
    423,
    status,
  );
};

module.exports = {
  getWeeklyReviewStatus,
  completeWeeklyReview,
  assertHunterReviewComplete,
};
