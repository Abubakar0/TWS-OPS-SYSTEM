export type UserRole = 'super_admin' | 'admin' | 'hr' | 'hunter' | 'lister' | 'order_processor';
export type UserStatus = 'active' | 'disabled' | 'locked' | 'deleted';
export type UserPermissionKey =
  | 'canManageAdmins'
  | 'canManageUsers'
  | 'canViewReports'
  | 'canExportReports'
  | 'canManageSettings'
  | 'canManageHr'
  | 'canViewPayroll'
  | 'canProcessOrders'
  | 'canViewAllOrders'
  | 'canViewLogs'
  | 'canImpersonate'
  | 'canDeleteUsers'
  | 'canRestoreRecords';

export type UserPermissions = Record<UserPermissionKey, boolean>;

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  isActive: boolean;
  status?: UserStatus;
  permissions?: UserPermissions;
  createdBy?: string | null;
  updatedBy?: string | null;
  disabledBy?: string | null;
  lastLogin?: string | null;
  deletedAt?: string | null;
  parentUserId?: string | null;
  tenantId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface HunterAssignment {
  hunterId: string;
  hunterName: string;
  hunterEmail: string;
  hunterActive: boolean;
  listerId: string | null;
  listerName: string | null;
  listerEmail: string | null;
  listerActive: boolean | null;
}

export const normalizeUserRoles = (
  user: Pick<User, 'role' | 'roles'> | null | undefined,
): UserRole[] => {
  const roles = Array.isArray(user?.roles) && user.roles.length ? user.roles : user?.role ? [user.role] : [];
  return [...new Set(roles)];
};

export const userHasRole = (
  user: Pick<User, 'role' | 'roles'> | null | undefined,
  role: UserRole,
): boolean => normalizeUserRoles(user).includes(role);

export const userHasAnyRole = (
  user: Pick<User, 'role' | 'roles'> | null | undefined,
  roles: readonly UserRole[],
): boolean => roles.some((role) => userHasRole(user, role));

export interface BulkImportError {
  row: number;
  message: string;
  email?: string | null;
  name?: string | null;
}

export interface UserBulkImportResult {
  summary: {
    total: number;
    created: number;
    failed: number;
  };
  users: User[];
  errors: BulkImportError[];
}
