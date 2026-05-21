export type ProductStatus = 'approved' | 'rejected' | 'assigned' | 'listed';
export type ProductQualityLabel =
  | 'Excellent Hunting'
  | 'Good Hunting'
  | 'Average Hunting'
  | 'Rejected';

export interface ValidationNote {
  rule: string;
  passed: boolean;
  message: string;
}

export interface Product {
  id: string;
  hunterId: string;
  hunterName: string;
  assignedListerId: string | null;
  assignedListerName: string | null;
  listedBy: string | null;
  listedByName: string | null;
  accountUsed: string | null;
  accountName: string | null;
  listingUrl: string | null;
  itemId: string | null;
  amazonUrl: string;
  amazonAltUrl: string | null;
  ebayUrl: string;
  asin: string | null;
  title: string | null;
  customLabel: string | null;
  amazonPrice: number | null;
  ebayPrice: number | null;
  fees: number;
  soldCount: number;
  amazonStockCount: number | null;
  alternateAmazonStockCount: number | null;
  rating: number | null;
  productWatchers: number | null;
  salesLastTwoMonths: number | null;
  stockQuantity: number | null;
  deliveryDays: number | null;
  profit: number;
  roi: number;
  status: ProductStatus;
  rejectionReason: string | null;
  validationNotes: ValidationNote[];
  primaryFailure?: string | null;
  qualityLabel?: ProductQualityLabel;
  listedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCreatePayload {
  title: string;
  customLabel?: string | null;
  amazonUrl: string;
  amazonAltUrl?: string | null;
  ebayUrl: string;
  asin?: string;
  amazonStockCount: number;
  alternateAmazonStockCount?: number | null;
  soldCount: number;
  rating: number;
  productWatchers?: number | null;
  salesLastTwoMonths: number;
  amazonPrice: number | null;
  ebayPrice: number | null;
}

export interface Account {
  id: string;
  name: string;
  marketplace: string;
  isActive: boolean;
  totalProductsListed?: number;
  assignedListers?: Array<{
    id: string;
    name: string;
    email: string;
    isActive: boolean;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductDuplicateInfo {
  id: string;
  asin: string | null;
  title: string | null;
  status: ProductStatus;
  listedAt: string | null;
  accountName: string | null;
}

export interface AsinCheckResult {
  asin: string;
  isDuplicate: boolean;
  product: ProductDuplicateInfo | null;
}

export interface AssignedHunter {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  productCount?: number;
  readyCount?: number;
  listedCount?: number;
}

export interface HuntingCriteria {
  minRoi: number;
  minProfit: number;
  minSoldCount: number;
  feePercent: number;
  asinRequired: boolean;
  minStockCount: number;
  minAlternateStockCount: number;
  minRating: number;
  customLabelRequired: boolean;
  watchersRequired: boolean;
  minWatcherCount: number;
  minSalesLastTwoMonths: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface ProductFilters {
  search?: string;
  status?: ProductStatus | '';
  hunterId?: string;
  accountId?: string;
  from?: string;
  to?: string;
  listerName?: string;
  accountName?: string;
  listedFrom?: string;
  listedTo?: string;
}

export interface BulkListedPayload {
  accountId: string;
  items: Array<{
    id: string;
    listingUrl: string;
    itemId?: string;
  }>;
}
