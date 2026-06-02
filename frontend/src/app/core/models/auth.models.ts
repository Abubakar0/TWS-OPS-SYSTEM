export type UserRole = 'super_admin' | 'admin' | 'hunter' | 'lister' | 'order_processor';
export type UserStatus = 'active' | 'disabled' | 'locked' | 'deleted';
export type UserPermissionKey =
  | 'canManageAdmins'
  | 'canManageUsers'
  | 'canViewReports'
  | 'canExportReports'
  | 'canManageSettings'
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
