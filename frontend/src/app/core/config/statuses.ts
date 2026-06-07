import { ProductStatus } from '../models/product.models';
import { UserStatus } from '../models/auth.models';

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  ready_for_listing: 'Ready for Listing',
  listed_needs_review: 'Listed Needs Review',
  approved: 'Approved',
  assigned: 'Assigned',
  listed: 'Listed',
  listing_rejected: 'Listing Rejected',
  rejected: 'Rejected',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Active',
  disabled: 'Disabled',
  locked: 'Locked',
  deleted: 'Deleted',
};
