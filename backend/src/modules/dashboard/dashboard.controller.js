const { pool } = require('../../db/pool');

const buildAdminWhere = (query) => {
  const where = [];
  const params = [];

  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (query.from) {
    add('p.created_at >= ?', query.from);
  }

  if (query.to) {
    add('p.created_at < (?::date + INTERVAL \'1 day\')', query.to);
  }

  if (query.hunterId) {
    add('p.hunter_id = ?', query.hunterId);
  }

  if (query.listerId) {
    add('(p.assigned_lister_id = ? OR p.listed_by = ?)', query.listerId);
    params.push(query.listerId);
    where[where.length - 1] = where[where.length - 1].replace('?', `$${params.length}`);
  }

  return {
    where: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
};

const admin = async (req, res) => {
  const filters = buildAdminWhere(req.query);

  const [summary, byHunter, byLister, daily] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*)::int AS "hunted",
          COUNT(*) FILTER (WHERE status IN ('approved', 'assigned'))::int AS "ready",
          COUNT(*) FILTER (WHERE status = 'rejected')::int AS "rejected",
          COUNT(*) FILTER (WHERE status = 'listed')::int AS "listed",
          COALESCE(AVG(NULLIF(roi, 0)), 0)::numeric(8, 2) AS "averageRoi",
          COALESCE(SUM(profit), 0)::numeric(10, 2) AS "totalProfit"
        FROM products p
        ${filters.where}
      `,
      filters.params,
    ),
    pool.query(
      `
        SELECT
          hunter.id,
          hunter.name,
          COUNT(p.id)::int AS "hunted",
          COUNT(p.id) FILTER (WHERE p.status = 'listed')::int AS "listed"
        FROM users hunter
        LEFT JOIN products p ON p.hunter_id = hunter.id
        WHERE hunter.role = 'hunter'
        GROUP BY hunter.id, hunter.name
        ORDER BY hunter.name
      `,
    ),
    pool.query(
      `
        SELECT
          lister.id,
          lister.name,
          COUNT(p.id) FILTER (WHERE p.status = 'listed')::int AS "listed",
          COUNT(DISTINCT hla.hunter_id)::int AS "assignedHunters"
        FROM users lister
        LEFT JOIN products p ON p.listed_by = lister.id
        LEFT JOIN hunter_lister_assignments hla ON hla.lister_id = lister.id
        WHERE lister.role = 'lister'
        GROUP BY lister.id, lister.name
        ORDER BY lister.name
      `,
    ),
    pool.query(
      `
        SELECT
          date_trunc('day', p.created_at)::date AS "date",
          COUNT(*)::int AS "hunted",
          COUNT(*) FILTER (WHERE p.status = 'listed')::int AS "listed"
        FROM products p
        ${filters.where}
        GROUP BY date_trunc('day', p.created_at)::date
        ORDER BY "date" DESC
        LIMIT 31
      `,
      filters.params,
    ),
  ]);

  const row = summary.rows[0];

  res.json({
    stats: {
      hunted: row.hunted,
      ready: row.ready,
      rejected: row.rejected,
      listed: row.listed,
      averageRoi: Number(row.averageRoi),
      totalProfit: Number(row.totalProfit),
      byHunter: byHunter.rows,
      byLister: byLister.rows,
      daily: daily.rows,
    },
  });
};

const hunter = async (req, res) => {
  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS "submitted",
        COUNT(*) FILTER (WHERE status IN ('approved', 'assigned'))::int AS "ready",
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS "rejected",
        COUNT(*) FILTER (WHERE status = 'listed')::int AS "listed"
      FROM products
      WHERE hunter_id = $1
    `,
    [req.user.id],
  );

  res.json({ stats: result.rows[0] });
};

const lister = async (req, res) => {
  const result = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status IN ('approved', 'assigned'))::int AS "ready",
        COUNT(*) FILTER (WHERE status = 'listed')::int AS "listed"
      FROM products
      WHERE assigned_lister_id = $1
    `,
    [req.user.id],
  );

  res.json({ stats: result.rows[0] });
};

module.exports = {
  admin,
  hunter,
  lister,
};
