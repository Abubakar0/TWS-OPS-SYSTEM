const bcrypt = require('bcryptjs');
const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');

const userSelect = `
  id,
  name,
  email,
  role,
  is_active AS "isActive",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const normalizeUser = (row) => ({
  ...row,
  isActive: Boolean(row.isActive),
});

const assertValidRole = (role) => {
  if (!['admin', 'hunter', 'lister'].includes(role)) {
    throw new AppError('Invalid user role.', 400);
  }
};

const ensureEmailAvailable = async (email, currentUserId = null) => {
  const params = [email];
  let sql = 'SELECT id FROM users WHERE email = $1';

  if (currentUserId) {
    params.push(currentUserId);
    sql += ' AND id <> $2';
  }

  const existing = await pool.query(sql, params);

  if (existing.rowCount > 0) {
    throw new AppError('A user with this email already exists.', 409);
  }
};

const mapUserPersistenceError = (error) => {
  if (error?.code === '23505') {
    throw new AppError('A user with this email already exists.', 409);
  }

  throw error;
};

const listUsers = async ({ role } = {}) => {
  const params = [];
  let where = '';

  if (role) {
    params.push(role);
    where = 'WHERE role = $1';
  }

  const result = await pool.query(
    `
      SELECT ${userSelect}
      FROM users
      ${where}
      ORDER BY role, name
    `,
    params,
  );

  return result.rows.map(normalizeUser);
};

const createUser = async (payload) => {
  const { name, email, password, role } = payload;

  if (!name || !email || !password || !role) {
    throw new AppError('Name, email, password, and valid role are required.', 400);
  }

  assertValidRole(role);

  const normalizedName = String(name).trim();
  const normalizedEmail = String(email).trim().toLowerCase();

  if (!normalizedName || !normalizedEmail) {
    throw new AppError('Name and email are required.', 400);
  }

  await ensureEmailAvailable(normalizedEmail);

  const passwordHash = await bcrypt.hash(password, 10);
  let result;

  try {
    result = await pool.query(
      `
        INSERT INTO users (name, email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING ${userSelect}
      `,
      [normalizedName, normalizedEmail, passwordHash, role, payload.isActive ?? true],
    );
  } catch (error) {
    mapUserPersistenceError(error);
  }

  return normalizeUser(result.rows[0]);
};

const updateUser = async (id, payload) => {
  const existing = await pool.query('SELECT id FROM users WHERE id = $1', [id]);

  if (existing.rowCount === 0) {
    throw new AppError('User not found.', 404);
  }

  const updates = [];
  const params = [];

  const addUpdate = (column, value) => {
    params.push(value);
    updates.push(`${column} = $${params.length}`);
  };

  if (payload.name !== undefined) {
    addUpdate('name', String(payload.name).trim());
  }

  if (payload.email !== undefined) {
    const normalizedEmail = String(payload.email).trim().toLowerCase();
    await ensureEmailAvailable(normalizedEmail, id);
    addUpdate('email', normalizedEmail);
  }

  if (payload.role !== undefined) {
    assertValidRole(payload.role);
    addUpdate('role', payload.role);
  }

  if (payload.isActive !== undefined) {
    addUpdate('is_active', Boolean(payload.isActive));
  }

  if (payload.password) {
    addUpdate('password_hash', await bcrypt.hash(payload.password, 10));
  }

  if (updates.length === 0) {
    const result = await pool.query(`SELECT ${userSelect} FROM users WHERE id = $1`, [id]);
    return normalizeUser(result.rows[0]);
  }

  params.push(id);

  let result;

  try {
    result = await pool.query(
      `
        UPDATE users
        SET ${updates.join(', ')},
            updated_at = NOW()
        WHERE id = $${params.length}
        RETURNING ${userSelect}
      `,
      params,
    );
  } catch (error) {
    mapUserPersistenceError(error);
  }

  return normalizeUser(result.rows[0]);
};

const listAssignments = async () => {
  const result = await pool.query(
    `
      SELECT
        hunter.id AS "hunterId",
        hunter.name AS "hunterName",
        hunter.email AS "hunterEmail",
        hunter.is_active AS "hunterActive",
        lister.id AS "listerId",
        lister.name AS "listerName",
        lister.email AS "listerEmail",
        lister.is_active AS "listerActive"
      FROM users hunter
      LEFT JOIN hunter_lister_assignments hla ON hla.hunter_id = hunter.id
      LEFT JOIN users lister ON lister.id = hla.lister_id
      WHERE hunter.role = 'hunter'
      ORDER BY hunter.name
    `,
  );

  return result.rows;
};

const setHunterLister = async (hunterId, listerId) => {
  const hunter = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'hunter'", [hunterId]);

  if (hunter.rowCount === 0) {
    throw new AppError('Hunter not found.', 404);
  }

  if (!listerId) {
    await pool.query('DELETE FROM hunter_lister_assignments WHERE hunter_id = $1', [hunterId]);
    await pool.query(
      `
        UPDATE products
        SET assigned_lister_id = NULL,
            status = CASE WHEN status = 'assigned' THEN 'approved'::product_status ELSE status END,
            updated_at = NOW()
        WHERE hunter_id = $1 AND status <> 'listed'
      `,
      [hunterId],
    );
    return { hunterId, listerId: null };
  }

  const lister = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'lister'", [listerId]);

  if (lister.rowCount === 0) {
    throw new AppError('Lister not found.', 404);
  }

  await pool.query(
    `
      INSERT INTO hunter_lister_assignments (hunter_id, lister_id)
      VALUES ($1, $2)
      ON CONFLICT (hunter_id) DO UPDATE
      SET lister_id = EXCLUDED.lister_id,
          updated_at = NOW()
    `,
    [hunterId, listerId],
  );

  await pool.query(
    `
      UPDATE products
      SET assigned_lister_id = $2,
          status = CASE WHEN status = 'approved' THEN 'assigned'::product_status ELSE status END,
          updated_at = NOW()
      WHERE hunter_id = $1 AND status IN ('approved', 'assigned')
    `,
    [hunterId, listerId],
  );

  return { hunterId, listerId };
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  listAssignments,
  setHunterLister,
};
