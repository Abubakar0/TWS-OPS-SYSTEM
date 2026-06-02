export type ProductStatus = 'approved' | 'rejected' | 'assigned' | 'listed';
export type ProductQualityLabel = 'Best Hunt' | 'Good Hunt' | 'Avg Hunt' | 'Rejected';

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
  category?: string | null;
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
  basketCount?: number | null;
  stockQuantity: number | null;
  deliveryDays: number | null;
  monthlyGraphUptrend?: boolean | null;
  profit: number;
  roi: number;
  status: ProductStatus;
  rejectionReason: string | null;
  validationNotes: ValidationNote[];
  primaryFailure?: string | null;
  qualityLabel?: ProductQualityLabel;
  deletedBy?: string | null;
  deletedAt?: string | null;
  deleteReason?: string | null;
  listedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCreatePayload {
  title: string;
  category?: string | null;
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
  basketCount?: number | null;
  amazonPrice: number | null;
  ebayPrice: number | null;
  deliveryDays?: number | null;
  monthlyGraphUptrend?: boolean | null;
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
  pendingCount?: number;
  rejectedCount?: number;
}

export interface ProductCategory {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
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
  basketCountRequired: boolean;
  deliveryDaysRequired: boolean;
  maxDeliveryDays: number;
  monthlyGraphRequired: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface ProductFilters {
  search?: string;
  status?: ProductStatus | '';
  category?: string;
  hunterId?: string;
  listerId?: string;
  accountId?: string;
  from?: string;
  to?: string;
  listerName?: string;
  accountName?: string;
  listedFrom?: string;
  listedTo?: string;
  quality?: ProductQualityLabel | '';
  deletedState?: 'active' | 'deleted' | 'all';
  page?: number;
  limit?: number;
}

export interface BulkListedPayload {
  accountId: string;
  items: Array<{
    id: string;
    listingUrl: string;
    itemId?: string;
  }>;
}

export interface ChangeRequest {
  id: string;
  productId: string;
  orderId?: string | null;
  hunterId: string;
  hunterName: string;
  hunterEmail?: string | null;
  listerId: string | null;
  listerName: string | null;
  listerEmail?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  asin: string;
  productTitle: string | null;
  requestedChanges: string;
  issueType?: string | null;
  issueReason?: string | null;
  currentAmazonLink?: string | null;
  currentEbayLink?: string | null;
  currentPrice?: number | null;
  newAmazonLink?: string | null;
  newEbayLink?: string | null;
  newPrice?: number | null;
  newStockCount?: number | null;
  notes?: string | null;
  rejectedReason?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'REJECTED' | 'CLOSED';
  completionNotes: string | null;
  completedBy: string | null;
  completedByName: string | null;
  completedAt: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  startedAt?: string | null;
  startedBy?: string | null;
  startedByName?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolvedByName?: string | null;
  createdAt: string;
  updatedAt: string;
  productStatus?: ProductStatus | null;
  listingUrl?: string | null;
  orderCode?: string | null;
  orderStatus?: string | null;
  orderIssueStatus?: string | null;
  currentStockCount?: number | null;
}

export interface ChangeRequestSummary {
  total: number;
  pending: number;
  completed: number;
  open?: number;
  inProgress?: number;
  fixed?: number;
  rejected?: number;
  closed?: number;
  fixedToday?: number;
}

export interface ListerChangeRequestBlockStatus {
  blocked: boolean;
  openRequests: number;
}

export interface WeeklyReviewStatus {
  isReviewDay: boolean;
  required: boolean;
  completed: boolean;
  reviewDate: string;
  review?: {
    id: string;
    reviewDate: string;
    notes: string | null;
    updatedAt: string;
  } | null;
}
