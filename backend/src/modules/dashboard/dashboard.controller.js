const { pool } = require('../../db/pool');

const addDateFilters = ({ query, where, params, column = 'p.created_at' }) => {
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (query.from) {
    add(`${column} >= ?`, query.from);
  }

  if (query.to) {
    add(`${column} < (?::date + INTERVAL '1 day')`, query.to);
  }
};

const buildProductFilters = (query, column = 'p.created_at') => {
  const clauses = [];
  const params = [];

  addDateFilters({ query, where: clauses, params, column });

  if (query.hunterId) {
    params.push(query.hunterId);
    clauses.push(`p.hunter_id = $${params.length}`);
  }

  if (query.listerId) {
    params.push(query.listerId);
    const assignedIndex = params.length;
    params.push(query.listerId);
    const listedIndex = params.length;
    clauses.push(`(p.assigned_lister_id = $${assignedIndex} OR p.listed_by = $${listedIndex})`);
  }

  return {
    clauses,
    params,
  };
};

const toWhereSql = (clauses) => (clauses.length ? `WHERE ${clauses.join(' AND ')}` : '');
const toJoinSql = (clauses) => (clauses.length ? ` AND ${clauses.join(' AND ')}` : '');

const admin = async (req, res) => {
  const filters = buildProductFilters(req.query, 'p.created_at');
  const whereSql = toWhereSql(filters.clauses);
  const joinSql = toJoinSql(filters.clauses);

  const byHunterParams = [...filters.params];
  const byListerParams = [...filters.params];

  let hunterUserFilter = '';
  let listerUserFilter = '';

  if (req.query.hunterId) {
    byHunterParams.push(req.query.hunterId);
    hunterUserFilter = `AND hunter.id = $${byHunterParams.length}`;
  }

  if (req.query.listerId) {
    byListerParams.push(req.query.listerId);
    listerUserFilter = `AND lister.id = $${byListerParams.length}`;
  }

  const [summary, byHunter, byLister, byAccount, daily] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*)::int AS "hunted",
          COUNT(*) FILTER (WHERE p.status IN ('approved', 'assigned'))::int AS "ready",
          COUNT(*) FILTER (WHERE p.status = 'rejected')::int AS "rejected",
          COUNT(*) FILTER (WHERE p.status = 'listed')::int AS "listed",
          COALESCE(AVG(NULLIF(p.roi, 0)), 0)::numeric(8, 2) AS "averageRoi",
          COALESCE(SUM(p.profit), 0)::numeric(10, 2) AS "totalProfit"
        FROM products p
        ${whereSql}
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
        LEFT JOIN products p ON p.hunter_id = hunter.id${joinSql}
        WHERE hunter.role = 'hunter'
          ${hunterUserFilter}
        GROUP BY hunter.id, hunter.name
        ORDER BY hunter.name
      `,
      byHunterParams,
    ),
    pool.query(
      `
        SELECT
          lister.id,
          lister.name,
          COUNT(p.id) FILTER (WHERE p.status = 'listed')::int AS "listed",
          COUNT(DISTINCT hla.hunter_id)::int AS "assignedHunters"
        FROM users lister
        LEFT JOIN products p
          ON (p.listed_by = lister.id OR p.assigned_lister_id = lister.id)${joinSql}
        LEFT JOIN hunter_lister_assignments hla ON hla.lister_id = lister.id
        WHERE lister.role = 'lister'
          ${listerUserFilter}
        GROUP BY lister.id, lister.name
        ORDER BY lister.name
      `,
      byListerParams,
    ),
    pool.query(
      `
        SELECT
          account.id::text AS "id",
          account.name,
          COUNT(p.id)::int AS "listed"
        FROM accounts account
        JOIN products p
          ON p.account_used = account.id
          AND p.status = 'listed'${joinSql}
        GROUP BY account.id, account.name
        ORDER BY "listed" DESC, account.name
      `,
      filters.params,
    ),
    pool.query(
      `
        SELECT
          date_trunc('day', p.created_at)::date AS "date",
          COUNT(*)::int AS "hunted",
          COUNT(*) FILTER (WHERE p.status = 'listed')::int AS "listed"
        FROM products p
        ${whereSql}
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
      byAccount: byAccount.rows,
      daily: daily.rows,
    },
  });
};

const hunter = async (req, res) => {
  const where = ['p.hunter_id = $1'];
  const params = [req.user.id];

  addDateFilters({ query: req.query, where, params, column: 'p.created_at' });

  const whereClause = `WHERE ${where.join(' AND ')}`;

  const [summary, byAccount] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*)::int AS "totalHunted",
          COUNT(*) FILTER (WHERE p.status = 'approved')::int AS "approved",
          COUNT(*) FILTER (WHERE p.status = 'assigned')::int AS "pending",
          COUNT(*) FILTER (WHERE p.status = 'rejected')::int AS "rejected",
          COUNT(*) FILTER (WHERE p.status = 'listed')::int AS "listed"
        FROM products p
        ${whereClause}
      `,
      params,
    ),
    pool.query(
      `
        SELECT
          account.id::text AS "accountId",
          account.name AS "accountName",
          COUNT(p.id)::int AS "listedCount"
        FROM products p
        JOIN accounts account ON account.id = p.account_used
        ${whereClause}
          AND p.status = 'listed'
        GROUP BY account.id, account.name
        ORDER BY "listedCount" DESC, account.name
      `,
      params,
    ),
  ]);

  const row = summary.rows[0];

  res.json({
    stats: {
      totalHunted: row.totalHunted,
      approved: row.approved,
      pending: row.pending,
      rejected: row.rejected,
      listed: row.listed,
      byAccount: byAccount.rows,
    },
  });
};

const lister = async (req, res) => {
  const listedWhere = ["p.status = 'listed'"];
  const listedParams = [];

  if (req.user.role === 'lister') {
    listedParams.push(req.user.id);
    listedWhere.push(`p.listed_by = $${listedParams.length}`);
  }

  addDateFilters({ query: req.query, where: listedWhere, params: listedParams, column: 'p.listed_at' });

  const rejectedWhere = ["p.status = 'rejected'"];
  const rejectedParams = [];

  if (req.user.role === 'lister') {
    rejectedParams.push(req.user.id);
    rejectedWhere.push(`p.assigned_lister_id = $${rejectedParams.length}`);
  }

  addDateFilters({ query: req.query, where: rejectedWhere, params: rejectedParams, column: 'p.updated_at' });

  const listedClause = `WHERE ${listedWhere.join(' AND ')}`;
  const rejectedClause = `WHERE ${rejectedWhere.join(' AND ')}`;

  const [summary, rejectedSummary, byHunter, byAccount] = await Promise.all([
    pool.query(
      `
        SELECT COUNT(*)::int AS "totalListed"
        FROM products p
        ${listedClause}
      `,
      listedParams,
    ),
    pool.query(
      `
        SELECT COUNT(*)::int AS "rejected"
        FROM products p
        ${rejectedClause}
      `,
      rejectedParams,
    ),
    pool.query(
      `
        SELECT
          hunter.id::text AS "hunterId",
          hunter.name AS "hunterName",
          COUNT(p.id)::int AS "listedCount"
        FROM products p
        JOIN users hunter ON hunter.id = p.hunter_id
        ${listedClause}
        GROUP BY hunter.id, hunter.name
        ORDER BY "listedCount" DESC, hunter.name
      `,
      listedParams,
    ),
    pool.query(
      `
        SELECT
          account.id::text AS "accountId",
          account.name AS "accountName",
          COUNT(p.id)::int AS "listedCount"
        FROM products p
        JOIN accounts account ON account.id = p.account_used
        ${listedClause}
        GROUP BY account.id, account.name
        ORDER BY "listedCount" DESC, account.name
      `,
      listedParams,
    ),
  ]);

  res.json({
    stats: {
      totalListed: summary.rows[0].totalListed,
      rejected: rejectedSummary.rows[0].rejected,
      byHunter: byHunter.rows,
      byAccount: byAccount.rows,
    },
  });
};

module.exports = {
  admin,
  hunter,
  lister,
};
