const { pool } = require('../../db/pool');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');

const writeAuditLog = async ({ actorUserId = null, action, targetType, targetId = null, details = null }) => {
  if (!action || !targetType) {
    return;
  }

  try {
    await pool.query(
      `
        INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [actorUserId, action, targetType, targetId, details ? JSON.stringify(details) : null],
    );
  } catch (error) {
    // Audit failures should not block user-facing flows.
  }
};

const listAuditLogs = async (filters = {}) => {
  const { getConfiguredLimit } = require('../system/system.service');
  const clauses = [];
  const params = [];

  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  };

  if (filters.action) {
    add('log.action = ?', filters.action);
  }

  if (filters.actorUserId) {
    add('log.actor_user_id = ?', filters.actorUserId);
  }

  if (filters.actorRole) {
    add('actor.role = ?', filters.actorRole);
  }

  if (filters.targetType) {
    add('log.target_type = ?', filters.targetType);
  }

  if (filters.from) {
    add('log.created_at >= ?', filters.from);
  }

  if (filters.to) {
    add('log.created_at < (?::date + INTERVAL \'1 day\')', filters.to);
  }

  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    const index = params.length;
    clauses.push(`(
      log.action ILIKE $${index}
      OR COALESCE(actor.name, '') ILIKE $${index}
      OR COALESCE(actor.email, '') ILIKE $${index}
      OR COALESCE(target_user.name, '') ILIKE $${index}
      OR COALESCE(target_user.email, '') ILIKE $${index}
      OR COALESCE(log.target_type, '') ILIKE $${index}
      OR COALESCE(target_product.title, '') ILIKE $${index}
      OR COALESCE(target_product.asin, '') ILIKE $${index}
      OR COALESCE(target_account.name, '') ILIKE $${index}
      OR COALESCE(log.details::text, '') ILIKE $${index}
    )`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const defaultLimit = await getConfiguredLimit('activity', filters.limit);
  const pageRequest = normalizePageRequest(filters, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        log.id::text AS id,
        log.action,
        log.target_type AS "targetType",
        log.target_id AS "targetId",
        log.details,
        log.created_at AS "createdAt",
        actor.id AS "actorUserId",
        actor.name AS "actorName",
        actor.email AS "actorEmail",
        actor.role AS "actorRole",
        target_user.name AS "targetName",
        target_user.email AS "targetEmail",
        target_user.role AS "targetRole",
        target_product.title AS "productTitle",
        target_product.asin AS "productAsin",
        target_account.name AS "accountName"
      FROM audit_logs log
      LEFT JOIN users actor ON actor.id = log.actor_user_id
      LEFT JOIN users target_user
        ON log.target_type = 'user'
        AND target_user.id = log.target_id
      LEFT JOIN products target_product
        ON log.target_type = 'product'
        AND target_product.id = log.target_id
      LEFT JOIN accounts target_account
        ON log.target_type = 'account'
        AND target_account.id = log.target_id
      ${whereSql}
      ORDER BY log.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, pageRequest.limit, pageRequest.offset],
  );

  const rows = result.rows.map((row) => ({
    ...row,
    details: row.details && typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
  }));
  const total = result.rows[0]?.totalCount || 0;

  return {
    items: rows,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

module.exports = {
  writeAuditLog,
  listAuditLogs,
};
