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

const getSuperAdminDateFilters = (query) => {
  const clauses = [];
  const params = [];

  addDateFilters({ query, where: clauses, params, column: 'p.created_at' });

  return {
    clauses,
    params,
    whereSql: toWhereSql(clauses),
    joinSql: toJoinSql(clauses),
  };
};

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
  const summaryWhere = [];
  const summaryParams = [];

  if (req.user.role === 'hunter') {
    summaryParams.push(req.user.id);
    summaryWhere.push(`p.hunter_id = $${summaryParams.length}`);
  } else if (req.query.hunterId) {
    summaryParams.push(req.query.hunterId);
    summaryWhere.push(`p.hunter_id = $${summaryParams.length}`);
  }

  addDateFilters({ query: req.query, where: summaryWhere, params: summaryParams, column: 'p.created_at' });

  const summaryClause = summaryWhere.length ? `WHERE ${summaryWhere.join(' AND ')}` : '';
  const accountWhere = [...summaryWhere, "p.status = 'listed'"];
  const accountClause = `WHERE ${accountWhere.join(' AND ')}`;

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
        ${summaryClause}
      `,
      summaryParams,
    ),
    pool.query(
      `
        SELECT
          account.id::text AS "accountId",
          account.name AS "accountName",
          COUNT(p.id)::int AS "listedCount"
        FROM products p
        JOIN accounts account ON account.id = p.account_used
        ${accountClause}
        GROUP BY account.id, account.name
        ORDER BY "listedCount" DESC, account.name
      `,
      summaryParams,
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

const superAdmin = async (req, res) => {
  const filters = getSuperAdminDateFilters(req.query);
  const [userCounts, productCounts, byHunter, byLister, byAccount, systemActivity] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE role = 'admin' AND deleted_at IS NULL)::int AS "totalAdmins",
          COUNT(*) FILTER (WHERE role = 'lister' AND deleted_at IS NULL)::int AS "totalListers",
          COUNT(*) FILTER (WHERE role = 'hunter' AND deleted_at IS NULL)::int AS "totalHunters",
          COUNT(*) FILTER (WHERE is_active = TRUE AND deleted_at IS NULL)::int AS "activeUsers",
          COUNT(*) FILTER (WHERE is_active = FALSE AND deleted_at IS NULL)::int AS "disabledUsers",
          COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS "deletedUsers"
        FROM users
      `,
    ),
    pool.query(
      `
        SELECT
          COUNT(*)::int AS "totalHunting",
          COUNT(*) FILTER (WHERE p.status = 'listed')::int AS "totalListings",
          COUNT(*) FILTER (WHERE p.status = 'rejected')::int AS "rejectedProducts"
        FROM products p
        ${filters.whereSql}
      `,
      filters.params,
    ),
    pool.query(
      `
        SELECT
          hunter.id::text AS id,
          hunter.name,
          COUNT(p.id)::int AS "hunted",
          COUNT(p.id) FILTER (WHERE p.status = 'listed')::int AS "listed"
        FROM users hunter
        LEFT JOIN products p ON p.hunter_id = hunter.id${filters.joinSql}
        WHERE hunter.role = 'hunter'
          AND hunter.deleted_at IS NULL
        GROUP BY hunter.id, hunter.name
        ORDER BY "listed" DESC, hunter.name
      `,
      filters.params,
    ),
    pool.query(
      `
        SELECT
          lister.id::text AS id,
          lister.name,
          COUNT(p.id) FILTER (WHERE p.status = 'listed')::int AS "listed",
          COUNT(DISTINCT hla.hunter_id)::int AS "assignedHunters"
        FROM users lister
        LEFT JOIN products p
          ON (p.listed_by = lister.id OR p.assigned_lister_id = lister.id)${filters.joinSql}
        LEFT JOIN hunter_lister_assignments hla ON hla.lister_id = lister.id
        WHERE lister.role = 'lister'
          AND lister.deleted_at IS NULL
        GROUP BY lister.id, lister.name
        ORDER BY "listed" DESC, lister.name
      `,
      filters.params,
    ),
    pool.query(
      `
        SELECT
          account.id::text AS id,
          account.name,
          COUNT(p.id)::int AS "listed"
        FROM accounts account
        LEFT JOIN products p
          ON p.account_used = account.id
          AND p.status = 'listed'${filters.joinSql}
        GROUP BY account.id, account.name
        ORDER BY "listed" DESC, account.name
      `,
      filters.params,
    ),
    pool.query(
      `
        SELECT COUNT(*)::int AS "activityCount"
        FROM audit_logs
        WHERE created_at >= COALESCE($1::date, NOW() - INTERVAL '30 days')
          AND created_at < COALESCE(($2::date + INTERVAL '1 day'), NOW() + INTERVAL '1 day')
      `,
      [req.query.from || null, req.query.to || null],
    ),
  ]);

  res.json({
    stats: {
      ...userCounts.rows[0],
      ...productCounts.rows[0],
      systemActivity: systemActivity.rows[0].activityCount,
      byHunter: byHunter.rows,
      byLister: byLister.rows,
      byAccount: byAccount.rows,
    },
  });
};

module.exports = {
  admin,
  hunter,
  lister,
  superAdmin,
};
