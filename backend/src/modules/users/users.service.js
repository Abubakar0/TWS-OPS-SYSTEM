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
const { ensureTeamTables } = require('../teams/teams.service');
const { ensureHrTables } = require('../hr/hr.service');
const { getCriteria } = require('../criteria/criteria.service');

const VALID_USER_STATUSES = ['active', 'disabled', 'locked', 'deleted'];
const VALID_HUNTER_STATUSES = ['TRAINING', 'ACTIVE', 'REJECTED'];

const userSelect = `
  id,
  name,
  email,
  role,
  COALESCE(roles, jsonb_build_array(role::text)) AS roles,
  is_active AS "isActive",
  COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'disabled' END) AS status,
  COALESCE(hunter_status, 'ACTIVE') AS "hunterStatus",
  training_rules_acknowledged_at AS "trainingRulesAcknowledgedAt",
  training_extended_until AS "trainingExtendedUntil",
  (
    SELECT assignment.lister_id
    FROM hunter_lister_assignments assignment
    WHERE assignment.hunter_id = users.id
    LIMIT 1
  ) AS "mentorListerId",
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
  hunterStatus: row.hunterStatus || 'ACTIVE',
  trainingRulesAcknowledgedAt: row.trainingRulesAcknowledgedAt || null,
  trainingExtendedUntil: row.trainingExtendedUntil || null,
  mentorListerId: row.mentorListerId || null,
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

const buildQualityCaseSql = (criteria) => {
  const excellentRoi = Math.max(criteria.minRoi + 15, criteria.minRoi * 1.35, 35);
  const excellentProfit = Math.max(criteria.minProfit + 5, criteria.minProfit * 1.5, 5);
  const excellentSales = Math.max(
    criteria.minSalesLastTwoMonths + 12,
    criteria.minSalesLastTwoMonths * 1.4,
    12,
  );
  const excellentStock = Math.max(criteria.minStockCount + 4, criteria.minStockCount * 1.3, 12);
  const excellentRating = Math.max(criteria.minRating + 0.5, 4.2);

  return `
    CASE
      WHEN p.status = 'rejected' THEN 'Rejected'
      WHEN (
        (CASE WHEN COALESCE(p.roi, 0) >= ${excellentRoi} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.profit, 0) >= ${excellentProfit} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.sales_last_two_months, 0) >= ${excellentSales} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.stock_quantity, 0) >= ${excellentStock} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.rating, 0) >= ${excellentRating} THEN 1 ELSE 0 END)
      ) >= 4 THEN 'Best Hunt'
      WHEN (
        (CASE WHEN COALESCE(p.roi, 0) >= ${excellentRoi} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.profit, 0) >= ${excellentProfit} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.sales_last_two_months, 0) >= ${excellentSales} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.stock_quantity, 0) >= ${excellentStock} THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(p.rating, 0) >= ${excellentRating} THEN 1 ELSE 0 END)
      ) >= 2 THEN 'Good Hunt'
      ELSE 'Avg Hunt'
    END
  `;
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

const normalizeHunterStatus = (value, fallback = 'ACTIVE') => {
  const normalized = String(value ?? fallback)
    .trim()
    .toUpperCase();

  if (!VALID_HUNTER_STATUSES.includes(normalized)) {
    throw new AppError('Invalid hunter status.', 400);
  }

  return normalized;
};

const sanitizeTrainingDate = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new AppError('Training extension date must use YYYY-MM-DD format.', 400);
  }

  return normalized;
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

const syncMentorListerAssignment = async (actor, hunterId, mentorListerId) => {
  if (mentorListerId === undefined) {
    return;
  }

  await setHunterLister(actor, hunterId, mentorListerId || null);
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

  if (hasRole(actor, 'hr') && !hasAnyRole(actor, ['admin', 'super_admin'])) {
    clauses.push(
      `NOT (COALESCE(roles, jsonb_build_array(role::text)) @> '["super_admin"]'::jsonb)`,
    );
  }

  if (!query.includeDeleted) {
    clauses.push('deleted_at IS NULL');
  }

  if (query.role) {
    assertValidRole(query.role);

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

const listUserReference = async (actor, query = {}) => {
  await ensureUserRoleSchema();
  const filters = buildVisibilityFilters(actor, { ...query, includeDeleted: false });
  const result = await pool.query(
    `
      SELECT ${userSelect}
      FROM users
      ${filters.whereSql}
      ORDER BY name
    `,
    filters.params,
  );

  return result.rows.map(normalizeUser);
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

const getUserDetails = async (actor, id) => {
  await ensureUserRoleSchema();
  await ensureTeamTables();
  await ensureHrTables();

  if (!hasAnyRole(actor, ['admin', 'super_admin'])) {
    throw new AppError('You do not have access to user details.', 403);
  }

  const user = await getUserById(id, { includeDeleted: true });
  const criteria = await getCriteria();
  const qualityCase = buildQualityCaseSql(criteria);

  const [
    teamResult,
    assignedAccountsResult,
    assignedHuntersResult,
    assignedListersResult,
    hunterStatsResult,
    listerStatsResult,
    orderProcessorStatsResult,
    hrStatsResult,
    adminStatsResult,
  ] = await Promise.all([
    pool.query(
      `
        SELECT team.id::text AS id, team.name
        FROM teams team
        JOIN team_members member ON member.team_id = team.id
        WHERE member.user_id = $1
        ORDER BY team.name
        LIMIT 1
      `,
      [id],
    ),
    pool.query(
      `
        SELECT
          account.id::text AS id,
          account.name,
          account.marketplace,
          COALESCE(account.country, NULL) AS country,
          account.is_active AS "isActive"
        FROM lister_account_assignments assignment
        JOIN accounts account ON account.id = assignment.account_id
        WHERE assignment.lister_id = $1
        ORDER BY account.name
      `,
      [id],
    ),
    pool.query(
      `
        SELECT hunter.id::text AS id, hunter.name, hunter.email
        FROM hunter_lister_assignments assignment
        JOIN users hunter ON hunter.id = assignment.hunter_id
        WHERE assignment.lister_id = $1
          AND hunter.deleted_at IS NULL
        ORDER BY hunter.name
      `,
      [id],
    ),
    pool.query(
      `
        SELECT lister.id::text AS id, lister.name, lister.email
        FROM hunter_lister_assignments assignment
        JOIN users lister ON lister.id = assignment.lister_id
        WHERE assignment.hunter_id = $1
          AND lister.deleted_at IS NULL
        ORDER BY lister.name
      `,
      [id],
    ),
    pool.query(
      `
        WITH product_quality AS (
          SELECT
            p.status,
            ${qualityCase} AS quality
          FROM products p
          WHERE p.hunter_id = $1
            AND p.deleted_at IS NULL
        )
        SELECT
          (SELECT COUNT(*)::int FROM products p WHERE p.hunter_id = $1 AND p.deleted_at IS NULL) AS "productsSubmitted",
          (SELECT COUNT(*)::int FROM products p WHERE p.hunter_id = $1 AND p.deleted_at IS NULL AND p.status IN ('approved', 'assigned')) AS "approvedProducts",
          (SELECT COUNT(*)::int FROM products p WHERE p.hunter_id = $1 AND p.deleted_at IS NULL AND p.status = 'rejected') AS "rejectedProducts",
          COUNT(*) FILTER (WHERE quality = 'Best Hunt')::int AS "excellentProducts",
          COUNT(*) FILTER (WHERE quality = 'Good Hunt')::int AS "goodProducts",
          COUNT(*) FILTER (WHERE quality = 'Avg Hunt')::int AS "averageProducts",
          (SELECT COUNT(*)::int FROM products p WHERE p.hunter_id = $1 AND p.deleted_at IS NULL AND p.status = 'listed') AS "listedProducts",
          (SELECT COUNT(*)::int FROM orders o WHERE o.hunter_id = $1 AND o.deleted_at IS NULL) AS "ordersReceived",
          (SELECT COUNT(*)::int FROM orders o WHERE o.hunter_id = $1 AND o.deleted_at IS NULL AND (o.order_status = 'ISSUE' OR COALESCE(o.issue_status, '') IN ('OPEN', 'IN_REVIEW'))) AS "orderIssues",
          COALESCE((SELECT SUM(o.profit) FROM orders o WHERE o.hunter_id = $1 AND o.deleted_at IS NULL), 0)::numeric(10, 2) AS "totalProfit",
          COALESCE((SELECT AVG(o.roi) FROM orders o WHERE o.hunter_id = $1 AND o.deleted_at IS NULL), 0)::numeric(10, 2) AS "averageRoi"
        FROM product_quality
      `,
      [id],
    ),
    pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM products p WHERE p.listed_by = $1 AND p.deleted_at IS NULL AND p.status = 'listed') AS "productsListed",
          (SELECT COUNT(*)::int FROM products p WHERE p.assigned_lister_id = $1 AND p.deleted_at IS NULL AND p.status = 'rejected') AS "rejectedProducts",
          (SELECT COUNT(*)::int FROM hunter_lister_assignments assignment WHERE assignment.lister_id = $1) AS "assignedHunters",
          (SELECT COUNT(*)::int FROM product_change_requests request WHERE request.lister_id = $1) AS "changeRequests",
          (SELECT COUNT(*)::int FROM product_change_requests request WHERE request.lister_id = $1 AND request.status IN ('OPEN', 'IN_PROGRESS')) AS "pendingChangeRequests",
          (SELECT COUNT(*)::int FROM product_change_requests request WHERE request.lister_id = $1 AND request.status = 'FIXED') AS "fixedChangeRequests",
          (SELECT COUNT(DISTINCT assignment.account_id)::int FROM lister_account_assignments assignment WHERE assignment.lister_id = $1) AS "listingAccountsUsed",
          (SELECT COUNT(*)::int FROM products p WHERE p.listed_by = $1 AND p.deleted_at IS NULL AND p.listed_at IS NOT NULL) AS "totalListingsByDate"
      `,
      [id],
    ),
    pool.query(
      `
        SELECT
          COUNT(*)::int AS "ordersAdded",
          COUNT(*) FILTER (WHERE order_status IN ('PLACED', 'SHIPPED', 'DELIVERED'))::int AS "ordersPlaced",
          COUNT(*) FILTER (WHERE order_status IN ('SHIPPED', 'DELIVERED'))::int AS "shippedOrders",
          COUNT(*) FILTER (WHERE order_status = 'ISSUE' OR COALESCE(issue_status, '') IN ('OPEN', 'IN_REVIEW'))::int AS "issueOrders",
          COUNT(*) FILTER (WHERE profit < 0)::int AS "lossOrders",
          COUNT(*) FILTER (WHERE product_id IS NULL)::int AS "unmatchedOrders"
        FROM orders
        WHERE created_by = $1
          AND deleted_at IS NULL
      `,
      [id],
    ),
    pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM employee_profiles profile WHERE profile.created_by = $1 OR profile.updated_by = $1) AS "employeesManaged",
          (SELECT COUNT(*)::int FROM hr_attendance attendance WHERE attendance.marked_by = $1) AS "attendanceActions",
          (SELECT COUNT(*)::int FROM hr_leave_requests leave_request WHERE leave_request.approved_by = $1 AND leave_request.status = 'APPROVED') AS "leavesApproved",
          (SELECT COUNT(*)::int FROM hr_leave_requests leave_request WHERE leave_request.approved_by = $1 AND leave_request.status = 'REJECTED') AS "leavesRejected",
          (SELECT COUNT(*)::int FROM hr_expenses expense WHERE expense.approved_by = $1 AND expense.status = 'APPROVED') AS "expensesApproved",
          (SELECT COUNT(*)::int FROM hr_expenses expense WHERE expense.approved_by = $1 AND expense.status = 'REJECTED') AS "expensesRejected",
          (SELECT COUNT(*)::int FROM hr_payroll payroll WHERE payroll.created_by = $1 OR payroll.updated_by = $1 OR payroll.approved_by = $1) AS "payrollActions"
      `,
      [id],
    ),
    pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM users workspace_user WHERE workspace_user.created_by = $1) AS "usersCreated",
          (SELECT COUNT(*)::int FROM audit_logs audit WHERE audit.actor_user_id = $1 AND audit.action IN ('PRODUCT_EDITED_BY_ADMIN', 'product.bulk_update', 'product.update.admin')) AS "productsEdited",
          (SELECT COUNT(*)::int FROM audit_logs audit WHERE audit.actor_user_id = $1 AND audit.action IN ('PRODUCT_REJECTED_BY_ADMIN', 'product.rejected')) AS "productsRejected",
          (SELECT COUNT(*)::int FROM audit_logs audit WHERE audit.actor_user_id = $1 AND audit.action IN ('ACCOUNT_EDITED', 'ACCOUNT_DELETED', 'ACCOUNT_DISABLED', 'ACCOUNT_PROFIT_SPLIT_UPDATED', 'account.assignment.update', 'account.bulk_import')) AS "accountsManaged",
          (SELECT COUNT(*)::int FROM audit_logs audit WHERE audit.actor_user_id = $1 AND (audit.action ILIKE '%export%' OR audit.action IN ('report.export', 'reports.export'))) AS "reportsExported",
          (SELECT COUNT(*)::int FROM audit_logs audit WHERE audit.actor_user_id = $1) AS "activityFeedActions"
      `,
      [id],
    ),
  ]);

  return {
    user,
    team: teamResult.rows[0] || null,
    assignedAccounts: assignedAccountsResult.rows,
    assignedHunters: assignedHuntersResult.rows,
    assignedListers: assignedListersResult.rows,
    stats: {
      ...(hasRole(user, 'hunter') ? { hunter: {
        ...hunterStatsResult.rows[0],
        totalProfit: Number(hunterStatsResult.rows[0]?.totalProfit || 0),
        averageRoi: Number(hunterStatsResult.rows[0]?.averageRoi || 0),
      } } : {}),
      ...(hasRole(user, 'lister') ? { lister: listerStatsResult.rows[0] || {} } : {}),
      ...(hasRole(user, 'order_processor') ? { orderProcessor: orderProcessorStatsResult.rows[0] || {} } : {}),
      ...(hasRole(user, 'hr') ? { hr: hrStatsResult.rows[0] || {} } : {}),
      ...(hasRole(user, 'admin') ? { admin: adminStatsResult.rows[0] || {} } : {}),
    },
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
  const hunterStatus = roles.includes('hunter')
    ? normalizeHunterStatus(payload.hunterStatus, 'TRAINING')
    : 'ACTIVE';
  const trainingExtendedUntil = roles.includes('hunter')
    ? sanitizeTrainingDate(payload.trainingExtendedUntil)
    : null;

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
          hunter_status,
          training_extended_until,
          permissions,
          created_by,
          updated_by,
          disabled_by
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb, $11, $11, $12)
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
        hunterStatus,
        trainingExtendedUntil,
        JSON.stringify(permissions),
        actor.id,
        isActive ? null : actor.id,
      ],
    );
  } catch (error) {
    mapUserPersistenceError(error);
  }

  const createdUser = normalizeUser(result.rows[0]);

  if (roles.includes('hunter')) {
    await syncMentorListerAssignment(actor, createdUser.id, payload.mentorListerId);
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: 'user.create',
    targetType: 'user',
    targetId: createdUser.id,
    details: {
      role: createdUser.role,
      roles: createdUser.roles,
      status: createdUser.status,
      hunterStatus: createdUser.hunterStatus,
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

  if (payload.hunterStatus !== undefined) {
    if (!nextRoles.includes('hunter')) {
      throw new AppError('Hunter status can only be set for hunter users.', 400);
    }

    addUpdate('hunter_status', normalizeHunterStatus(payload.hunterStatus, existing.hunterStatus || 'ACTIVE'));
  }

  if (payload.trainingExtendedUntil !== undefined) {
    if (!nextRoles.includes('hunter')) {
      throw new AppError('Training extension can only be set for hunter users.', 400);
    }

    addUpdate('training_extended_until', sanitizeTrainingDate(payload.trainingExtendedUntil));
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

  if (payload.mentorListerId !== undefined && nextRoles.includes('hunter')) {
    await syncMentorListerAssignment(actor, updatedUser.id, payload.mentorListerId);
  }

  const action =
    actor.role === 'super_admin'
      ? 'SUPER_ADMIN_EDITED_USER'
      : payload.role !== undefined || payload.roles !== undefined
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
      hunterStatus: updatedUser.hunterStatus,
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
    action: actor.role === 'super_admin' ? 'SUPER_ADMIN_DELETED_USER' : 'user.delete',
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

const acknowledgeTrainingRules = async (actor) => {
  const user = await getUserById(actor.id, { includeDeleted: false });

  if (!hasRole(user, 'hunter')) {
    throw new AppError('Only hunters can acknowledge training rules.', 403);
  }

  if (user.hunterStatus !== 'TRAINING') {
    return user;
  }

  const result = await pool.query(
    `
      UPDATE users
      SET training_rules_acknowledged_at = COALESCE(training_rules_acknowledged_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
      RETURNING ${userSelect}
    `,
    [actor.id],
  );

  const updatedUser = normalizeUser(result.rows[0]);

  await writeAuditLog({
    actorUserId: actor.id,
    action: 'TRAINING_RULES_ACKNOWLEDGED',
    targetType: 'user',
    targetId: actor.id,
    details: {
      hunterStatus: updatedUser.hunterStatus,
      acknowledgedAt: updatedUser.trainingRulesAcknowledgedAt,
    },
  });

  return updatedUser;
};

module.exports = {
  getUserById,
  getUserDetails,
  listUserReference,
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
  acknowledgeTrainingRules,
};
