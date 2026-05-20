const VALID_ROLES = ['super_admin', 'admin', 'lister', 'hunter'];

const PERMISSION_KEYS = [
  'canManageAdmins',
  'canManageUsers',
  'canViewReports',
  'canExportReports',
  'canManageSettings',
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

const resolvePermissions = (role, overrides = {}) => ({
  ...(DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.hunter),
  ...normalizePermissionOverrides(overrides),
});

const canManageRole = (actorRole, targetRole) => {
  if (actorRole === 'super_admin') {
    return true;
  }

  if (actorRole === 'admin') {
    return ['hunter', 'lister'].includes(targetRole);
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
  PERMISSION_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  resolvePermissions,
  canManageRole,
  listPermissionMatrix,
};
