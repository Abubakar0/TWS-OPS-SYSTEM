const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../db/pool');
const { env } = require('../../config/env');
const { AppError } = require('../../middleware/error');
const { normalizeRoles, resolvePermissions, resolvePrimaryRole } = require('../users/permissions');
const { writeAuditLog } = require('../users/audit.service');
const { assertIpAllowed } = require('../system/system.service');
const { ensureUserRoleSchema } = require('../users/user-schema.service');

const userSelect = `
  id,
  name,
  email,
  role,
  COALESCE(roles, jsonb_build_array(role::text)) AS roles,
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
  role: resolvePrimaryRole(user.roles || user.role, user.role),
  roles: normalizeRoles(user.roles || user.role, user.role),
  isActive: Boolean(user.is_active ?? user.isActive),
  status: user.status || (user.is_active ?? user.isActive ? 'active' : 'disabled'),
  permissions: resolvePermissions(user.roles || user.role, user.permissions),
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
      roles: user.roles,
      name: user.name,
      permissions: user.permissions,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );

const login = async ({ email, password }, req) => {
  await ensureUserRoleSchema();

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
        COALESCE(roles, jsonb_build_array(role::text)) AS roles,
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

  const loginProfile = buildProfile(user);

  if (req) {
    await assertIpAllowed(loginProfile, req);
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
  await ensureUserRoleSchema();
  const result = await pool.query(`SELECT ${userSelect} FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
  const user = result.rows[0];

  if (!user || !user.isActive) {
    throw new AppError('User not found.', 404);
  }

  return buildProfile(user);
};

const changePassword = async (user, payload = {}) => {
  await ensureUserRoleSchema();
  const currentPassword = String(payload.currentPassword || '').trim();
  const newPassword = String(payload.newPassword || '').trim();

  if (!currentPassword || !newPassword) {
    throw new AppError('Current password and new password are required.', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters.', 400);
  }

  const result = await pool.query(
    `
      SELECT id, email, password_hash
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [user.id],
  );

  const existingUser = result.rows[0];

  if (!existingUser) {
    throw new AppError('User not found.', 404);
  }

  const matchesCurrentPassword = await bcrypt.compare(currentPassword, existingUser.password_hash);

  if (!matchesCurrentPassword) {
    throw new AppError('Current password is incorrect.', 400);
  }

  const reusingPassword = await bcrypt.compare(newPassword, existingUser.password_hash);

  if (reusingPassword) {
    throw new AppError('New password must be different from the current password.', 400);
  }

  await pool.query(
    `
      UPDATE users
      SET password_hash = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [user.id, await bcrypt.hash(newPassword, 10)],
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: 'USER_PASSWORD_CHANGED',
    targetType: 'user',
    targetId: user.id,
    details: {
      email: existingUser.email,
    },
  });
};

module.exports = {
  login,
  getUserById,
  changePassword,
  signToken,
};
