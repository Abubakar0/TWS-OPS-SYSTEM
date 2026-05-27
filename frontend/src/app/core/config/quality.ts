import { ProductQualityLabel } from '../models/product.models';

export const QUALITY_LABELS: readonly ProductQualityLabel[] = [
  'Best Hunt',
  'Good Hunt',
  'Avg Hunt',
  'Rejected',
];

export const QUALITY_RULES: Record<ProductQualityLabel, string> = {
  'Best Hunt':
    'All required rules pass and the product is clearly above the minimum ROI, profit, sales, stock, and rating thresholds.',
  'Good Hunt':
    'All required rules pass and the product stays comfortably above the active minimum thresholds.',
  'Avg Hunt':
    'The product passes the active minimum thresholds, but one or more signals stay close to the baseline.',
  Rejected: 'One or more required rules failed, so the product is not ready for listing.',
};
