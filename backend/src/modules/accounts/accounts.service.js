const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');
const { writeAuditLog } = require('../users/audit.service');
const { getConfiguredLimit } = require('../system/system.service');

const accountSelect = `
  accounts.id,
  accounts.name,
  accounts.marketplace,
  accounts.is_active AS "isActive",
  COALESCE(listed_totals."totalProductsListed", 0)::int AS "totalProductsListed",
  COALESCE(assigned_listers."assignedListers", '[]'::json) AS "assignedListers",
  accounts.created_at AS "createdAt",
  accounts.updated_at AS "updatedAt"
`;

const accountFromRow = (row) => ({
  ...row,
  assignedListers: Array.isArray(row.assignedListers) ? row.assignedListers : [],
});

const listAccounts = async (user, query = {}) => {
  const { includeInactive, marketplace, status, search } = query;
  const params = [];
  const where = [];

  if (includeInactive !== 'true' || user.role === 'lister') {
    where.push('accounts.is_active = TRUE');
  }

  if (user.role === 'lister') {
    params.push(user.id);
    where.push(`EXISTS (
      SELECT 1
      FROM lister_account_assignments la
      WHERE la.account_id = accounts.id
        AND la.lister_id = $${params.length}
    )`);
  }

  if (marketplace) {
    params.push(marketplace);
    where.push(`accounts.marketplace = $${params.length}`);
  }

  if (status === 'active') {
    where.push('accounts.is_active = TRUE');
  } else if (status === 'disabled') {
    where.push('accounts.is_active = FALSE');
  }

  if (search) {
    params.push(`%${String(search).trim()}%`);
    where.push(`accounts.name ILIKE $${params.length}`);
  }

  const defaultLimit = await getConfiguredLimit('accounts', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);

  const result = await pool.query(
    `
      SELECT COUNT(*) OVER()::int AS "totalCount", ${accountSelect}
      FROM accounts
      LEFT JOIN (
        SELECT account_used, COUNT(*) AS "totalProductsListed"
        FROM products
        WHERE status = 'listed'
        GROUP BY account_used
      ) AS listed_totals
        ON listed_totals.account_used = accounts.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            json_agg(
              json_build_object(
                'id', lister.id::text,
                'name', lister.name,
                'email', lister.email,
                'isActive', lister.is_active
              )
              ORDER BY lister.name
            ) FILTER (WHERE lister.id IS NOT NULL),
            '[]'::json
          ) AS "assignedListers"
        FROM lister_account_assignments la
        JOIN users lister ON lister.id = la.lister_id
        WHERE la.account_id = accounts.id
      ) AS assigned_listers ON TRUE
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY accounts.name
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, pageRequest.limit, pageRequest.offset],
  );

  const items = result.rows.map(accountFromRow);
  const total = result.rows[0]?.totalCount || 0;

  return {
    items,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

const getAccountById = async (id) => {
  const result = await pool.query(
    `
      SELECT ${accountSelect}
      FROM accounts
      LEFT JOIN (
        SELECT account_used, COUNT(*) AS "totalProductsListed"
        FROM products
        WHERE status = 'listed'
        GROUP BY account_used
      ) AS listed_totals
        ON listed_totals.account_used = accounts.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            json_agg(
              json_build_object(
                'id', lister.id::text,
                'name', lister.name,
                'email', lister.email,
                'isActive', lister.is_active
              )
              ORDER BY lister.name
            ) FILTER (WHERE lister.id IS NOT NULL),
            '[]'::json
          ) AS "assignedListers"
        FROM lister_account_assignments la
        JOIN users lister ON lister.id = la.lister_id
        WHERE la.account_id = accounts.id
      ) AS assigned_listers ON TRUE
      WHERE accounts.id = $1
      LIMIT 1
    `,
    [id],
  );

  if (result.rowCount === 0) {
    throw new AppError('Account not found.', 404);
  }

  return accountFromRow(result.rows[0]);
};

const createAccount = async (payload) => {
  if (!payload.name) {
    throw new AppError('Account name is required.', 400);
  }

  const result = await pool.query(
    `
      INSERT INTO accounts (name, marketplace, is_active)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [payload.name.trim(), payload.marketplace || 'ebay', payload.isActive ?? true],
  );

  return getAccountById(result.rows[0].id);
};

const updateAccount = async (id, payload) => {
  const result = await pool.query(
    `
      UPDATE accounts
      SET name = COALESCE($1, name),
          marketplace = COALESCE($2, marketplace),
          is_active = COALESCE($3, is_active),
          updated_at = NOW()
      WHERE id = $4
      RETURNING id
    `,
    [
      payload.name === undefined ? null : String(payload.name).trim(),
      payload.marketplace === undefined ? null : payload.marketplace,
      payload.isActive === undefined ? null : Boolean(payload.isActive),
      id,
    ],
  );

  if (result.rowCount === 0) {
    throw new AppError('Account not found.', 404);
  }

  return getAccountById(id);
};

const assignListersToAccount = async (actorUserId, accountId, listerIds = []) => {
  const uniqueListerIds = [...new Set((Array.isArray(listerIds) ? listerIds : []).filter(Boolean))];
  const account = await getAccountById(accountId);

  if (uniqueListerIds.length > 0) {
    const listerResult = await pool.query(
      `
        SELECT id::text AS id
        FROM users
        WHERE role = 'lister'
          AND id = ANY($1::uuid[])
      `,
      [uniqueListerIds],
    );

    if (listerResult.rowCount !== uniqueListerIds.length) {
      throw new AppError('One or more selected listers were not found.', 400);
    }
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM lister_account_assignments WHERE account_id = $1', [accountId]);

    if (uniqueListerIds.length > 0) {
      await client.query(
        `
          INSERT INTO lister_account_assignments (account_id, lister_id)
          SELECT $1, UNNEST($2::uuid[])
        `,
        [accountId, uniqueListerIds],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await writeAuditLog({
    actorUserId,
    action: 'account.assignment.update',
    targetType: 'account',
    targetId: accountId,
    details: {
      accountName: account.name,
      listerIds: uniqueListerIds,
    },
  });

  return getAccountById(accountId);
};

module.exports = {
  listAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  assignListersToAccount,
};
