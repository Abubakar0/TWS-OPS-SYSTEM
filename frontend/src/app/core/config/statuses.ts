import { ProductStatus } from '../models/product.models';
import { UserStatus } from '../models/auth.models';

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  approved: 'Approved',
  assigned: 'Assigned',
  listed: 'Listed',
  rejected: 'Rejected',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Active',
  disabled: 'Disabled',
  locked: 'Locked',
  deleted: 'Deleted',
};
