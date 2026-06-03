import { UserRole } from '../models/auth.models';

export const APP_ROLES = ['super_admin', 'admin', 'hr', 'hunter', 'lister', 'order_processor'] as const satisfies readonly UserRole[];

export const ADMIN_MANAGED_ROLES = ['hr', 'hunter', 'lister', 'order_processor'] as const satisfies readonly UserRole[];
export const SUPER_ADMIN_MANAGED_ROLES = ['admin', 'hr', 'hunter', 'lister', 'order_processor'] as const satisfies readonly UserRole[];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  hr: 'HR',
  hunter: 'Hunter',
  lister: 'Lister',
  order_processor: 'Order Processor',
};
