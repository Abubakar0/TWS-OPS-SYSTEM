const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../db/pool');
const { env } = require('../../config/env');
const { AppError } = require('../../middleware/error');
const {
  PERMISSION_KEYS,
  VALID_ROLES,
  canManageRole,
  listPermissionMatrix,
  resolvePermissions,
} = require('./permissions');
const { listAuditLogs, writeAuditLog } = require('./audit.service');

const VALID_USER_STATUSES = ['active', 'disabled', 'locked', 'deleted'];

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

const signImpersonationToken = (user) =>
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

const normalizePermissions = (permissions) =>
  permissions && typeof permissions === 'object' && !Array.isArray(permissions) ? permissions : {};

const normalizeUser = (row) => ({
  ...row,
  isActive: Boolean(row.isActive),
  status: row.status || (row.isActive ? 'active' : 'disabled'),
  permissions: resolvePermissions(row.role, normalizePermissions(row.permissions)),
});

const assertValidRole = (role) => {
  if (!VALID_ROLES.includes(role)) {
    throw new AppError('Invalid user role.', 400);
  }
};

const assertValidStatus = (status) => {
  if (!VALID_USER_STATUSES.includes(status)) {
    throw new AppError('Invalid user status.', 400);
  }
};

const assertValidPermissionOverrides = (permissions) => {
  if (permissions === undefined) {
    return;
  }

  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    throw new AppError('Permissions must be an object.', 400);
  }

  const invalidKeys = Object.keys(permissions).filter((key) => !PERMISSION_KEYS.includes(key));

  if (invalidKeys.length > 0) {
    throw new AppError(`Invalid permission keys: ${invalidKeys.join(', ')}.`, 400);
  }
};

const assertActorCanManageRole = (actor, role, actionLabel = 'manage') => {
  if (!actor || !canManageRole(actor.role, role)) {
    throw new AppError(`You do not have permission to ${actionLabel} ${role.replace('_', ' ')} users.`, 403);
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

const getUserById = async (id, { includeDeleted = false } = {}) => {
  const result = await pool.query(
    `
      SELECT ${userSelect}
      FROM users
      WHERE id = $1
        ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
      LIMIT 1
    `,
    [id],
  );

  const user = result.rows[0];

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  return normalizeUser(user);
};

const ensureActorCanTouchUser = (actor, target, actionLabel = 'manage') => {
  assertActorCanManageRole(actor, target.role, actionLabel);

  if (actor.role === 'admin' && ['admin', 'super_admin'].includes(target.role)) {
    throw new AppError('Admins can only manage hunter and lister users.', 403);
  }
};

const buildVisibilityFilters = (actor, query) => {
  const clauses = [];
  const params = [];

  if (actor.role === 'admin') {
    clauses.push(`role IN ('hunter', 'lister')`);
  }

  if (!query.includeDeleted) {
    clauses.push('deleted_at IS NULL');
  }

  if (query.role) {
    assertValidRole(query.role);

    if (actor.role === 'admin' && !['hunter', 'lister'].includes(query.role)) {
      throw new AppError('Admins can only access hunter and lister records.', 403);
    }

    params.push(query.role);
    clauses.push(`role = $${params.length}`);
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    clauses.push(`(
      name ILIKE $${params.length}
      OR email ILIKE $${params.length}
      OR role::text ILIKE $${params.length}
      OR status ILIKE $${params.length}
    )`);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
};

const listUsers = async (actor, query = {}) => {
  const filters = buildVisibilityFilters(actor, query);
  const result = await pool.query(
    `
      SELECT ${userSelect}
      FROM users
      ${filters.whereSql}
      ORDER BY
        CASE role
          WHEN 'super_admin' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'lister' THEN 3
          ELSE 4
        END,
        name
    `,
    filters.params,
  );

  return result.rows.map(normalizeUser);
};

const createUser = async (actor, payload) => {
  const { name, email, password, role } = payload;

  if (!name || !email || !password || !role) {
    throw new AppError('Name, email, password, and valid role are required.', 400);
  }

  assertValidRole(role);
  assertActorCanManageRole(actor, role, 'create');
  assertValidPermissionOverrides(payload.permissions);

  const normalizedName = String(name).trim();
  const normalizedEmail = String(email).trim().toLowerCase();

  if (!normalizedName || !normalizedEmail) {
    throw new AppError('Name and email are required.', 400);
  }

  await ensureEmailAvailable(normalizedEmail);

  const passwordHash = await bcrypt.hash(password, 10);
  const isActive = payload.isActive ?? true;
  const status = isActive ? 'active' : 'disabled';
  const permissions = resolvePermissions(role, payload.permissions);

  let result;

  try {
    result = await pool.query(
      `
        INSERT INTO users (
          name,
          email,
          password_hash,
          role,
          is_active,
          status,
          permissions,
          created_by,
          updated_by,
          disabled_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8, $9)
        RETURNING ${userSelect}
      `,
      [
        normalizedName,
        normalizedEmail,
        passwordHash,
        role,
        isActive,
        status,
        JSON.stringify(permissions),
        actor.id,
        isActive ? null : actor.id,
      ],
    );
  } catch (error) {
    mapUserPersistenceError(error);
  }

  const createdUser = normalizeUser(result.rows[0]);

  await writeAuditLog({
    actorUserId: actor.id,
    action: 'user.create',
    targetType: 'user',
    targetId: createdUser.id,
    details: {
      role: createdUser.role,
      status: createdUser.status,
      email: createdUser.email,
    },
  });

  return createdUser;
};

const updateUser = async (actor, id, payload) => {
  const existing = await getUserById(id, { includeDeleted: true });
  ensureActorCanTouchUser(actor, existing, 'update');

  const updates = [];
  const params = [];

  const addUpdate = (column, value, cast = '') => {
    params.push(value);
    updates.push(`${column} = $${params.length}${cast}`);
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
    assertActorCanManageRole(actor, payload.role, 'assign');
    addUpdate('role', payload.role);
  }

  if (payload.permissions !== undefined) {
    const targetRole = payload.role || existing.role;
    assertValidPermissionOverrides(payload.permissions);
    addUpdate('permissions', JSON.stringify(resolvePermissions(targetRole, payload.permissions)), '::jsonb');
  }

  if (payload.password) {
    addUpdate('password_hash', await bcrypt.hash(payload.password, 10));
  }

  if (payload.status !== undefined) {
    assertValidStatus(payload.status);

    if (payload.status === 'deleted') {
      throw new AppError('Use the delete action for soft deletion.', 400);
    }

    addUpdate('status', payload.status);
    addUpdate('is_active', payload.status === 'active');
    addUpdate('disabled_by', payload.status === 'active' ? null : actor.id);
  } else if (payload.isActive !== undefined) {
    const isActive = Boolean(payload.isActive);
    addUpdate('is_active', isActive);
    addUpdate('status', isActive ? 'active' : 'disabled');
    addUpdate('disabled_by', isActive ? null : actor.id);
  }

  addUpdate('updated_by', actor.id);

  if (updates.length === 1) {
    return existing;
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

  const updatedUser = normalizeUser(result.rows[0]);
  const action =
    payload.role !== undefined
      ? 'user.role.change'
      : payload.isActive !== undefined || payload.status !== undefined
        ? updatedUser.isActive
          ? 'user.enable'
          : 'user.disable'
        : 'user.update';

  await writeAuditLog({
    actorUserId: actor.id,
    action,
    targetType: 'user',
    targetId: updatedUser.id,
    details: {
      role: updatedUser.role,
      status: updatedUser.status,
      permissions: updatedUser.permissions,
    },
  });

  return updatedUser;
};

const softDeleteUser = async (actor, id) => {
  const existing = await getUserById(id, { includeDeleted: true });
  ensureActorCanTouchUser(actor, existing, 'delete');

  const result = await pool.query(
    `
      UPDATE users
      SET is_active = FALSE,
          status = 'deleted',
          deleted_at = NOW(),
          disabled_by = $2,
          updated_by = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING ${userSelect}
    `,
    [id, actor.id],
  );

  const deletedUser = normalizeUser(result.rows[0]);

  await writeAuditLog({
    actorUserId: actor.id,
    action: 'user.delete',
    targetType: 'user',
    targetId: deletedUser.id,
    details: { role: deletedUser.role, email: deletedUser.email },
  });

  return deletedUser;
};

const restoreUser = async (actor, id) => {
  const existing = await getUserById(id, { includeDeleted: true });
  ensureActorCanTouchUser(actor, existing, 'restore');

  const result = await pool.query(
    `
      UPDATE users
      SET is_active = TRUE,
          status = 'active',
          deleted_at = NULL,
          disabled_by = NULL,
          updated_by = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING ${userSelect}
    `,
    [id, actor.id],
  );

  const restoredUser = normalizeUser(result.rows[0]);

  await writeAuditLog({
    actorUserId: actor.id,
    action: 'user.restore',
    targetType: 'user',
    targetId: restoredUser.id,
    details: { role: restoredUser.role, email: restoredUser.email },
  });

  return restoredUser;
};

const resetUserPassword = async (actor, id, password = 'Password123!') => {
  const target = await getUserById(id, { includeDeleted: true });
  ensureActorCanTouchUser(actor, target, 'reset password for');

  const result = await pool.query(
    `
      UPDATE users
      SET password_hash = $2,
          updated_by = $3,
          updated_at = NOW()
      WHERE id = $1
      RETURNING ${userSelect}
    `,
    [id, await bcrypt.hash(password, 10), actor.id],
  );

  const updatedUser = normalizeUser(result.rows[0]);

  await writeAuditLog({
    actorUserId: actor.id,
    action: 'user.password.reset',
    targetType: 'user',
    targetId: updatedUser.id,
    details: { email: updatedUser.email },
  });

  return updatedUser;
};

const unlockUser = async (actor, id) => {
  const target = await getUserById(id, { includeDeleted: true });
  ensureActorCanTouchUser(actor, target, 'unlock');

  const result = await pool.query(
    `
      UPDATE users
      SET is_active = TRUE,
          status = 'active',
          disabled_by = NULL,
          deleted_at = NULL,
          updated_by = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING ${userSelect}
    `,
    [id, actor.id],
  );

  const updatedUser = normalizeUser(result.rows[0]);

  await writeAuditLog({
    actorUserId: actor.id,
    action: 'user.unlock',
    targetType: 'user',
    targetId: updatedUser.id,
    details: { email: updatedUser.email },
  });

  return updatedUser;
};

const impersonateUser = async (actor, id) => {
  const target = await getUserById(id, { includeDeleted: false });

  if (actor.role !== 'super_admin') {
    throw new AppError('Only Super Admin users can impersonate another user.', 403);
  }

  if (target.role !== 'admin') {
    throw new AppError('Super Admin impersonation is limited to admin accounts.', 400);
  }

  if (!target.isActive) {
    throw new AppError('Disabled users cannot be impersonated.', 400);
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: 'auth.impersonate',
    targetType: 'user',
    targetId: target.id,
    details: {
      targetRole: target.role,
      targetEmail: target.email,
    },
  });

  return {
    token: signImpersonationToken(target),
    user: target,
  };
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
        AND hunter.deleted_at IS NULL
      ORDER BY hunter.name
    `,
  );

  return result.rows;
};

const setHunterLister = async (actor, hunterId, listerId) => {
  const hunter = await pool.query(
    "SELECT id, role, email FROM users WHERE id = $1 AND role = 'hunter' AND deleted_at IS NULL",
    [hunterId],
  );

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

    await writeAuditLog({
      actorUserId: actor.id,
      action: 'assignment.clear',
      targetType: 'user',
      targetId: hunterId,
      details: { hunterId, listerId: null },
    });

    return { hunterId, listerId: null };
  }

  const lister = await pool.query(
    "SELECT id FROM users WHERE id = $1 AND role = 'lister' AND deleted_at IS NULL",
    [listerId],
  );

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

  await writeAuditLog({
    actorUserId: actor.id,
    action: 'assignment.update',
    targetType: 'user',
    targetId: hunterId,
    details: { hunterId, listerId },
  });

  return { hunterId, listerId };
};

const getPermissionsMatrix = async () => listPermissionMatrix();

module.exports = {
  listUsers,
  createUser,
  updateUser,
  softDeleteUser,
  restoreUser,
  resetUserPassword,
  unlockUser,
  impersonateUser,
  listUsersAudit: listAuditLogs,
  getPermissionsMatrix,
  listAssignments,
  setHunterLister,
};
