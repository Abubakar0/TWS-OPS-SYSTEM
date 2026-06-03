const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../db/pool');
const { env } = require('../../config/env');
const { AppError } = require('../../middleware/error');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');
const {
  PERMISSION_KEYS,
  VALID_ROLES,
  canManageRole,
  listPermissionMatrix,
  normalizeRoles,
  resolvePrimaryRole,
  resolvePermissions,
  hasRole,
  hasAnyRole,
} = require('./permissions');
const { listAuditLogs, writeAuditLog } = require('./audit.service');
const { getConfiguredLimit } = require('../system/system.service');
const { ensureUserRoleSchema } = require('./user-schema.service');

const VALID_USER_STATUSES = ['active', 'disabled', 'locked', 'deleted'];

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

const signImpersonationToken = (user) =>
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

const normalizePermissions = (permissions) =>
  permissions && typeof permissions === 'object' && !Array.isArray(permissions) ? permissions : {};

const normalizeUser = (row) => ({
  ...row,
  roles: normalizeRoles(row.roles || row.role, row.role || 'hunter'),
  role: resolvePrimaryRole(row.roles || row.role, row.role || 'hunter'),
  isActive: Boolean(row.isActive),
  status: row.status || (row.isActive ? 'active' : 'disabled'),
  permissions: resolvePermissions(row.roles || row.role, normalizePermissions(row.permissions)),
});

const normalizeImportKey = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildImportLookup = (row = {}) =>
  new Map(
    Object.entries(row)
      .filter(([key]) => key !== undefined && key !== null)
      .map(([key, value]) => [normalizeImportKey(key), value]),
  );

const readImportValue = (lookup, ...candidates) => {
  for (const candidate of candidates) {
    const value = lookup.get(normalizeImportKey(candidate));

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return undefined;
};

const isImportRowEmpty = (row) =>
  !row ||
  Object.values(row).every((value) => String(value ?? '').trim() === '');

const normalizeImportBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes', 'y', 'active', 'enabled'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n', 'disabled', 'inactive'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const normalizeImportedRole = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  return normalized || 'hunter';
};

const normalizeImportedRoles = (value) => {
  if (Array.isArray(value)) {
    return normalizeRoles(value, 'hunter');
  }

  const normalized = String(value ?? '')
    .split(/[|,/]/)
    .map((role) => normalizeImportedRole(role))
    .filter(Boolean);

  return normalizeRoles(normalized, 'hunter');
};

const deriveNameFromEmail = (email) => {
  const localPart = String(email ?? '').split('@')[0] || '';
  const normalized = localPart.replace(/[._-]+/g, ' ').trim();

  if (!normalized) {
    return 'Workspace User';
  }

  return normalized
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const assertValidRole = (role) => {
  if (!VALID_ROLES.includes(role)) {
    throw new AppError('Invalid user role.', 400);
  }
};

const assertValidRoles = (roles) => {
  const normalized = normalizeRoles(roles);
  const invalidRoles = normalized.filter((role) => !VALID_ROLES.includes(role));

  if (invalidRoles.length > 0) {
    throw new AppError(`Invalid user roles: ${invalidRoles.join(', ')}.`, 400);
  }

  if (normalized.includes('admin') && normalized.includes('super_admin')) {
    throw new AppError('Admin and Super Admin cannot be assigned together.', 400);
  }

  return normalized;
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
  if (!actor || !canManageRole(actor.roles || actor.role, role)) {
    throw new AppError(`You do not have permission to ${actionLabel} ${role.replace('_', ' ')} users.`, 403);
  }
};

const assertActorCanManageRoles = (actor, roles, actionLabel = 'manage') => {
  const normalized = assertValidRoles(roles);
  normalized.forEach((role) => assertActorCanManageRole(actor, role, actionLabel));
  return normalized;
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
  await ensureUserRoleSchema();
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
  assertActorCanManageRoles(actor, target.roles || [target.role], actionLabel);

  if (hasRole(actor, 'admin') && hasAnyRole(target, ['admin', 'super_admin'])) {
    throw new AppError('Admins can only manage hunter, lister, order processor, and HR users.', 403);
  }
};

const buildVisibilityFilters = (actor, query) => {
  const clauses = [];
  const params = [];

  if (hasRole(actor, 'admin') && !hasRole(actor, 'super_admin')) {
    clauses.push(`(
      COALESCE(roles, jsonb_build_array(role::text)) @> '["hunter"]'::jsonb
      OR COALESCE(roles, jsonb_build_array(role::text)) @> '["lister"]'::jsonb
      OR COALESCE(roles, jsonb_build_array(role::text)) @> '["order_processor"]'::jsonb
      OR COALESCE(roles, jsonb_build_array(role::text)) @> '["hr"]'::jsonb
    )`);
  }

  if (!query.includeDeleted) {
    clauses.push('deleted_at IS NULL');
  }

  if (query.role) {
    assertValidRole(query.role);

    if (hasRole(actor, 'admin') && !hasRole(actor, 'super_admin') && !['hunter', 'lister', 'order_processor', 'hr'].includes(query.role)) {
      throw new AppError('Admins can only access hunter, lister, order processor, and HR records.', 403);
    }

    params.push(JSON.stringify([query.role]));
    clauses.push(`COALESCE(roles, jsonb_build_array(role::text)) @> $${params.length}::jsonb`);
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    clauses.push(`(
      name ILIKE $${params.length}
      OR email ILIKE $${params.length}
      OR role::text ILIKE $${params.length}
      OR COALESCE(roles::text, '') ILIKE $${params.length}
      OR status ILIKE $${params.length}
    )`);
  }

  if (query.status) {
    assertValidStatus(query.status);
    params.push(query.status);
    clauses.push(`status = $${params.length}`);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
};

const listUsers = async (actor, query = {}) => {
  await ensureUserRoleSchema();
  const filters = buildVisibilityFilters(actor, query);
  const defaultLimit = await getConfiguredLimit('users', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT COUNT(*) OVER()::int AS "totalCount", ${userSelect}
      FROM users
      ${filters.whereSql}
      ORDER BY
        CASE role
          WHEN 'super_admin' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'order_processor' THEN 3
          WHEN 'lister' THEN 4
          ELSE 5
        END,
        name
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );

  const items = result.rows.map(normalizeUser);
  const total = result.rows[0]?.totalCount || 0;

  return {
    items,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

const createUser = async (actor, payload) => {
  await ensureUserRoleSchema();
  const { name, email, password } = payload;
  const roles = assertActorCanManageRoles(actor, payload.roles || payload.role || ['hunter'], 'create');
  const role = resolvePrimaryRole(roles);

  if (!name || !email || !password || !roles.length) {
    throw new AppError('Name, email, password, and at least one valid role are required.', 400);
  }

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
  const permissions = resolvePermissions(roles, payload.permissions);

  let result;

  try {
    result = await pool.query(
      `
        INSERT INTO users (
          name,
          email,
          password_hash,
          role,
          roles,
          is_active,
          status,
          permissions,
          created_by,
          updated_by,
          disabled_by
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $9, $10)
        RETURNING ${userSelect}
      `,
      [
        normalizedName,
        normalizedEmail,
        passwordHash,
        role,
        JSON.stringify(roles),
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
      roles: createdUser.roles,
      status: createdUser.status,
      email: createdUser.email,
    },
  });

  return createdUser;
};

const bulkImportUsers = async (actor, rows = []) => {
  await ensureUserRoleSchema();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError('Add at least one user row to import.', 400);
  }

  const importRows = rows.filter((row) => !isImportRowEmpty(row));

  if (!importRows.length) {
    throw new AppError('Add at least one user row to import.', 400);
  }

  const createdUsers = [];
  const errors = [];

  for (const [index, row] of importRows.entries()) {
    const lookup = buildImportLookup(row);
    const email = String(readImportValue(lookup, 'email', 'user email') ?? '')
      .trim()
      .toLowerCase();
    const password = String(readImportValue(lookup, 'password', 'temporary password') ?? '').trim();
    const roles = normalizeImportedRoles(readImportValue(lookup, 'roles', 'role', 'user roles'));
    const name =
      String(readImportValue(lookup, 'name', 'full name', 'user name') ?? '').trim() ||
      deriveNameFromEmail(email);
    const isActive = normalizeImportBoolean(
      readImportValue(lookup, 'isActive', 'active', 'enabled', 'status'),
      true,
    );
    const permissions = {
      canProcessOrders: normalizeImportBoolean(
        readImportValue(
          lookup,
          'canProcessOrders',
          'process orders',
          'can process orders',
          'allow order processing',
        ),
        false,
      ),
      canViewAllOrders: normalizeImportBoolean(
        readImportValue(
          lookup,
          'canViewAllOrders',
          'view all orders',
          'can view all orders',
          'allow viewing all orders',
        ),
        false,
      ),
    };

    try {
      const createdUser = await createUser(actor, {
        name,
        email,
        password,
        roles,
        isActive,
        permissions,
      });
      createdUsers.push(createdUser);
    } catch (error) {
      errors.push({
        row: index + 2,
        email: email || null,
        message: error?.message || 'Could not import this user row.',
      });
    }
  }

  if (createdUsers.length > 0) {
    await writeAuditLog({
      actorUserId: actor.id,
      action: 'user.bulk_import',
      targetType: 'user',
      details: {
        totalRows: importRows.length,
        created: createdUsers.length,
        failed: errors.length,
      },
    });
  }

  return {
    summary: {
      total: importRows.length,
      created: createdUsers.length,
      failed: errors.length,
    },
    users: createdUsers,
    errors,
  };
};

const updateUser = async (actor, id, payload) => {
  await ensureUserRoleSchema();
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

  let nextRoles = existing.roles || [existing.role];

  if (payload.roles !== undefined || payload.role !== undefined) {
    nextRoles = assertActorCanManageRoles(actor, payload.roles || payload.role, 'assign');
    addUpdate('roles', JSON.stringify(nextRoles), '::jsonb');
    addUpdate('role', resolvePrimaryRole(nextRoles));
  }

  if (payload.permissions !== undefined) {
    const targetRoles = payload.roles || payload.role || nextRoles;
    assertValidPermissionOverrides(payload.permissions);
    addUpdate('permissions', JSON.stringify(resolvePermissions(targetRoles, payload.permissions)), '::jsonb');
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
    payload.role !== undefined || payload.roles !== undefined
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
      roles: updatedUser.roles,
      status: updatedUser.status,
      permissions: updatedUser.permissions,
    },
  });

  return updatedUser;
};

const softDeleteUser = async (actor, id) => {
  await ensureUserRoleSchema();
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
  await ensureUserRoleSchema();
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
  await ensureUserRoleSchema();
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
  await ensureUserRoleSchema();
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
  await ensureUserRoleSchema();
  const target = await getUserById(id, { includeDeleted: false });

  if (!hasRole(actor, 'super_admin')) {
    throw new AppError('Only Super Admin users can impersonate another user.', 403);
  }

  if (!hasRole(target, 'admin')) {
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

const listAssignments = async (query = {}) => {
  await ensureUserRoleSchema();
  const params = [];
  const where = [
    `COALESCE(hunter.roles, jsonb_build_array(hunter.role::text)) @> '["hunter"]'::jsonb`,
    'hunter.deleted_at IS NULL',
  ];

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    where.push(`(
      hunter.name ILIKE $${index}
      OR hunter.email ILIKE $${index}
      OR COALESCE(lister.name, '') ILIKE $${index}
      OR COALESCE(lister.email, '') ILIKE $${index}
    )`);
  }

  if (query.status === 'assigned') {
    where.push('lister.id IS NOT NULL');
  } else if (query.status === 'unassigned') {
    where.push('lister.id IS NULL');
  }

  if (query.listerId) {
    params.push(query.listerId);
    where.push(`lister.id = $${params.length}`);
  }

  const defaultLimit = await getConfiguredLimit('assignments', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
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
      WHERE ${where.join(' AND ')}
      ORDER BY hunter.name
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, pageRequest.limit, pageRequest.offset],
  );

  const total = result.rows[0]?.totalCount || 0;

  return {
    items: result.rows,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

const setHunterLister = async (actor, hunterId, listerId) => {
  await ensureUserRoleSchema();
  const hunter = await pool.query(
    `SELECT id, role, roles, email
     FROM users
     WHERE id = $1
       AND COALESCE(roles, jsonb_build_array(role::text)) @> '["hunter"]'::jsonb
       AND deleted_at IS NULL`,
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
    `SELECT id
     FROM users
     WHERE id = $1
       AND COALESCE(roles, jsonb_build_array(role::text)) @> '["lister"]'::jsonb
       AND deleted_at IS NULL`,
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
  getUserById,
  listUsers,
  createUser,
  bulkImportUsers,
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
