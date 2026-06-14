import { ProductStatus } from '../models/product.models';
import { UserStatus } from '../models/auth.models';

const PRODUCT_STATUS_ALIASES: Record<string, ProductStatus> = {
  ready_for_listing: 'assigned',
  listing_rejected: 'rejected',
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  ready_for_listing: 'Assigned',
  listed_needs_review: 'Listed Needs Review',
  approved: 'Approved',
  assigned: 'Assigned',
  listed: 'Listed',
  listing_rejected: 'Rejected',
  rejected: 'Rejected',
};

export const normalizeProductStatus = (value: string | null | undefined): ProductStatus | string => {
  const raw = String(value || '').trim();
  return PRODUCT_STATUS_ALIASES[raw] || raw;
};

export const productStatusLabel = (value: string | null | undefined): string => {
  const normalized = normalizeProductStatus(value);
  if (!normalized) {
    return 'Unknown';
  }

  if (normalized in PRODUCT_STATUS_LABELS) {
    return PRODUCT_STATUS_LABELS[normalized as ProductStatus];
  }

  return String(normalized).replaceAll('_', ' ');
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Active',
  disabled: 'Disabled',
  locked: 'Locked',
  deleted: 'Deleted',
};
