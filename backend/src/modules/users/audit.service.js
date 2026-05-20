const { pool } = require('../../db/pool');

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
    console.error('Audit log write failed:', error.message);
  }
};

const listAuditLogs = async (filters = {}) => {
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
    )`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `
      SELECT
        log.id::text AS id,
        log.action,
        log.target_type AS "targetType",
        log.target_id AS "targetId",
        log.details,
        log.created_at AS "createdAt",
        actor.id AS "actorUserId",
        actor.name AS "actorName",
        actor.email AS "actorEmail",
        target_user.name AS "targetName",
        target_user.email AS "targetEmail"
      FROM audit_logs log
      LEFT JOIN users actor ON actor.id = log.actor_user_id
      LEFT JOIN users target_user
        ON log.target_type = 'user'
        AND target_user.id = log.target_id
      ${whereSql}
      ORDER BY log.created_at DESC
      LIMIT 250
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    details: row.details && typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
  }));
};

module.exports = {
  writeAuditLog,
  listAuditLogs,
};
