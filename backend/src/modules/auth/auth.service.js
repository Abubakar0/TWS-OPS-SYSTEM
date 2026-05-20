const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../db/pool');
const { env } = require('../../config/env');
const { AppError } = require('../../middleware/error');
const { resolvePermissions } = require('../users/permissions');
const { writeAuditLog } = require('../users/audit.service');

const userSelect = `
  id,
  name,
  email,
  role,
  is_active AS "isActive",
  COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'disabled' END) AS status,
  COALESCE(permissions, '{}'::jsonb) AS permissions,
  created_by AS "createdBy",
  updated_by AS "updatedBy",
  disabled_by AS "disabledBy",
  last_login AS "lastLogin",
  deleted_at AS "deletedAt",
  parent_user_id AS "parentUserId",
  tenant_id AS "tenantId",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const buildProfile = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: Boolean(user.is_active ?? user.isActive),
  status: user.status || (user.is_active ?? user.isActive ? 'active' : 'disabled'),
  permissions: resolvePermissions(user.role, user.permissions),
  createdBy: user.createdBy || null,
  updatedBy: user.updatedBy || null,
  disabledBy: user.disabledBy || null,
  lastLogin: user.lastLogin || null,
  deletedAt: user.deletedAt || null,
  parentUserId: user.parentUserId || null,
  tenantId: user.tenantId || null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      permissions: user.permissions,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );

const login = async ({ email, password }) => {
  if (!email || !password) {
    throw new AppError('Email and password are required.', 400);
  }

  const result = await pool.query(
    `
      SELECT
        id,
        name,
        email,
        password_hash,
        role,
        is_active,
        COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'disabled' END) AS status,
        COALESCE(permissions, '{}'::jsonb) AS permissions,
        created_by AS "createdBy",
        updated_by AS "updatedBy",
        disabled_by AS "disabledBy",
        last_login AS "lastLogin",
        deleted_at AS "deletedAt",
        parent_user_id AS "parentUserId",
        tenant_id AS "tenantId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM users
      WHERE lower(email) = lower($1)
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [email.trim()],
  );

  const user = result.rows[0];

  if (!user) {
    throw new AppError('Invalid email or password.', 401);
  }

  if (!user.is_active) {
    throw new AppError('Your account is disabled. Please contact an administrator.', 403);
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    throw new AppError('Invalid email or password.', 401);
  }

  const updateResult = await pool.query(
    `
      UPDATE users
      SET last_login = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING ${userSelect}
    `,
    [user.id],
  );

  const profile = buildProfile(updateResult.rows[0]);

  await writeAuditLog({
    actorUserId: user.id,
    action: 'auth.login',
    targetType: 'session',
    targetId: user.id,
    details: { role: user.role },
  });

  return {
    token: signToken(profile),
    user: profile,
  };
};

const getUserById = async (id) => {
  const result = await pool.query(`SELECT ${userSelect} FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
  const user = result.rows[0];

  if (!user || !user.isActive) {
    throw new AppError('User not found.', 404);
  }

  return buildProfile(user);
};

module.exports = {
  login,
  getUserById,
  signToken,
};
