const VALID_ROLES = ['super_admin', 'admin', 'hr', 'lister', 'hunter', 'order_processor'];

const ROLE_PRIORITY = ['super_admin', 'admin', 'hr', 'order_processor', 'lister', 'hunter'];

const PERMISSION_KEYS = [
  'canManageAdmins',
  'canManageUsers',
  'canViewReports',
  'canExportReports',
  'canManageSettings',
  'canManageHr',
  'canViewPayroll',
  'canProcessOrders',
  'canViewAllOrders',
  'canViewLogs',
  'canImpersonate',
  'canDeleteUsers',
  'canRestoreRecords',
];

const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: {
    canManageAdmins: true,
    canManageUsers: true,
    canViewReports: true,
    canExportReports: true,
    canManageSettings: true,
    canManageHr: true,
    canViewPayroll: true,
    canProcessOrders: true,
    canViewAllOrders: true,
    canViewLogs: true,
    canImpersonate: true,
    canDeleteUsers: true,
    canRestoreRecords: true,
  },
  admin: {
    canManageAdmins: false,
    canManageUsers: true,
    canViewReports: true,
    canExportReports: true,
    canManageSettings: true,
    canManageHr: true,
    canViewPayroll: true,
    canProcessOrders: true,
    canViewAllOrders: true,
    canViewLogs: false,
    canImpersonate: false,
    canDeleteUsers: false,
    canRestoreRecords: false,
  },
  hr: {
    canManageAdmins: false,
    canManageUsers: false,
    canViewReports: false,
    canExportReports: false,
    canManageSettings: false,
    canManageHr: true,
    canViewPayroll: true,
    canProcessOrders: false,
    canViewAllOrders: false,
    canViewLogs: false,
    canImpersonate: false,
    canDeleteUsers: false,
    canRestoreRecords: false,
  },
  lister: {
    canManageAdmins: false,
    canManageUsers: false,
    canViewReports: false,
    canExportReports: false,
    canManageSettings: false,
    canManageHr: false,
    canViewPayroll: false,
    canProcessOrders: false,
    canViewAllOrders: false,
    canViewLogs: false,
    canImpersonate: false,
    canDeleteUsers: false,
    canRestoreRecords: false,
  },
  hunter: {
    canManageAdmins: false,
    canManageUsers: false,
    canViewReports: false,
    canExportReports: false,
    canManageSettings: false,
    canManageHr: false,
    canViewPayroll: false,
    canProcessOrders: false,
    canViewAllOrders: false,
    canViewLogs: false,
    canImpersonate: false,
    canDeleteUsers: false,
    canRestoreRecords: false,
  },
  order_processor: {
    canManageAdmins: false,
    canManageUsers: false,
    canViewReports: false,
    canExportReports: false,
    canManageSettings: false,
    canManageHr: false,
    canViewPayroll: false,
    canProcessOrders: true,
    canViewAllOrders: false,
    canViewLogs: false,
    canImpersonate: false,
    canDeleteUsers: false,
    canRestoreRecords: false,
  },
};

const normalizePermissionOverrides = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, Boolean(value[key])]).filter(([, enabled]) => enabled),
  );
};

const normalizeRoles = (value, fallbackRole = 'hunter') => {
  const rawRoles = Array.isArray(value) ? value : value ? [value] : [fallbackRole];
  const normalized = rawRoles
    .map((role) => String(role ?? '').trim().toLowerCase())
    .filter((role) => VALID_ROLES.includes(role));

  if (!normalized.length) {
    return [fallbackRole];
  }

  return [...new Set(normalized)];
};

const resolvePrimaryRole = (roles, fallbackRole = 'hunter') => {
  const normalized = normalizeRoles(roles, fallbackRole);
  return (
    ROLE_PRIORITY.find((role) => normalized.includes(role)) ||
    normalized[0] ||
    fallbackRole
  );
};

const resolvePermissions = (rolesOrRole, overrides = {}) => {
  const roles = normalizeRoles(rolesOrRole);
  const resolved = PERMISSION_KEYS.reduce((result, key) => {
    result[key] = roles.some((role) => Boolean(DEFAULT_ROLE_PERMISSIONS[role]?.[key]));
    return result;
  }, {});

  return {
    ...resolved,
    ...normalizePermissionOverrides(overrides),
  };
};

const hasRole = (userOrRoles, role) => normalizeRoles(userOrRoles?.roles || userOrRoles?.role || userOrRoles).includes(role);

const hasAnyRole = (userOrRoles, roles) => {
  const normalized = normalizeRoles(userOrRoles?.roles || userOrRoles?.role || userOrRoles);
  return roles.some((role) => normalized.includes(role));
};

const canManageRole = (actorRoles, targetRole) => {
  if (hasRole(actorRoles, 'super_admin')) {
    return true;
  }

  if (hasRole(actorRoles, 'admin')) {
    return ['hunter', 'lister', 'order_processor', 'hr'].includes(targetRole);
  }

  return false;
};

const listPermissionMatrix = () =>
  VALID_ROLES.map((role) => ({
    role,
    permissions: resolvePermissions(role),
  }));

module.exports = {
  VALID_ROLES,
  ROLE_PRIORITY,
  PERMISSION_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  normalizeRoles,
  resolvePrimaryRole,
  resolvePermissions,
  hasRole,
  hasAnyRole,
  canManageRole,
  listPermissionMatrix,
};
