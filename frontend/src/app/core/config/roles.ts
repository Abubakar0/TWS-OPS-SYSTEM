import { UserRole } from '../models/auth.models';

export const APP_ROLES = ['super_admin', 'admin', 'hunter', 'lister'] as const satisfies readonly UserRole[];

export const ADMIN_MANAGED_ROLES = ['hunter', 'lister'] as const satisfies readonly UserRole[];
export const SUPER_ADMIN_MANAGED_ROLES = ['hunter', 'lister', 'admin'] as const satisfies readonly UserRole[];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  hunter: 'Hunter',
  lister: 'Lister',
};
