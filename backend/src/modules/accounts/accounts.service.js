const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');

const accountSelect = `
  id,
  name,
  marketplace,
  is_active AS "isActive",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const listAccounts = async ({ includeInactive } = {}) => {
  const result = await pool.query(
    `
      SELECT ${accountSelect}
      FROM accounts
      ${includeInactive === 'true' ? '' : 'WHERE is_active = TRUE'}
      ORDER BY name
    `,
  );

  return result.rows;
};

const createAccount = async (payload) => {
  if (!payload.name) {
    throw new AppError('Account name is required.', 400);
  }

  const result = await pool.query(
    `
      INSERT INTO accounts (name, marketplace, is_active)
      VALUES ($1, $2, $3)
      RETURNING ${accountSelect}
    `,
    [payload.name.trim(), payload.marketplace || 'ebay', payload.isActive ?? true],
  );

  return result.rows[0];
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
      RETURNING ${accountSelect}
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

  return result.rows[0];
};

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
};
