export type ProductStatus =
  | 'ready_for_listing'
  | 'listed_needs_review'
  | 'listed'
  | 'listing_rejected'
  | 'rejected'
  | 'approved'
  | 'assigned';
export type ProductQualityLabel = 'Best Hunt' | 'Good Hunt' | 'Avg Hunt' | 'Rejected';

export interface ValidationNote {
  rule: string;
  passed: boolean;
  message: string;
}

export interface ProductListingHistoryEntry {
  id: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  editedBy: string | null;
  editedByName: string | null;
  editedAt: string;
}

export interface Product {
  id: string;
  hunterId: string;
  hunterName: string;
  hunterStatus?: 'TRAINING' | 'ACTIVE' | 'REJECTED';
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
  rawStatus?: string;
  listingReviewStatus?: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  listingSubmittedForReviewAt?: string | null;
  listingReviewedBy?: string | null;
  listingReviewedByName?: string | null;
  listingReviewedAt?: string | null;
  listingReviewRejectionReason?: string | null;
  listingNotes?: string | null;
  reviewNotes?: string | null;
  originalHunterId?: string | null;
  originalHunterName?: string | null;
  currentHunterId?: string | null;
  currentHunterName?: string | null;
  rejectedBy?: string | null;
  rejectedByName?: string | null;
  rejectedAt?: string | null;
  rejectionPreviousStatus?: string | null;
  rejectionPreviousListingReviewStatus?: string | null;
  rejectionReversedBy?: string | null;
  rejectionReversedByName?: string | null;
  rejectionReversedAt?: string | null;
  orderCount?: number;
  hasOrders?: boolean;
  listingHistory?: ProductListingHistoryEntry[];
  transferHistory?: Array<{
    id: string;
    sourceHunterId: string;
    sourceHunterName: string;
    targetHunterId: string;
    targetHunterName: string;
    transferredBy: string;
    transferredByName: string;
    transferredAt: string;
  }>;
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

export interface ProductUpdatePayload {
  title?: string | null;
  category?: string | null;
  customLabel?: string | null;
  amazonUrl?: string;
  amazonAltUrl?: string | null;
  ebayUrl?: string;
  amazonStockCount?: number | null;
  alternateAmazonStockCount?: number | null;
  soldCount?: number | null;
  rating?: number | null;
  productWatchers?: number | null;
  salesLastTwoMonths?: number | null;
  basketCount?: number | null;
  amazonPrice?: number | null;
  ebayPrice?: number | null;
  deliveryDays?: number | null;
  monthlyGraphUptrend?: boolean | null;
}

export interface Account {
  id: string;
  name: string;
  marketplace: string;
  country?: string | null;
  currency?: string | null;
  isActive: boolean;
  clientProfitPercentage?: number | null;
  companyProfitPercentage?: number | null;
  previousOrderCount?: number;
  lastMonthProfit?: number;
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
  categoryRequired?: boolean;
  amazonAltUrlRequired?: boolean;
  trainingMinRoi?: number;
  trainingMinProfit?: number;
  trainingMinSoldCount?: number;
  trainingMinStockCount?: number;
  trainingMinRating?: number;
  trainingMinWatcherCount?: number;
  trainingMinSalesLastTwoMonths?: number;
  trainingAsinRequired?: boolean;
  trainingCustomLabelRequired?: boolean;
  trainingCategoryRequired?: boolean;
  trainingAmazonAltUrlRequired?: boolean;
  trainingMaxRejectedProductsAllowed?: number;
  trainingMinApprovalRateForActivation?: number;
  trainingMinListedProductsForActivation?: number;
  trainingMinOrdersGeneratedForActivation?: number;
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

export interface ListingCorrectionPayload {
  listingUrl?: string | null;
  accountId?: string | null;
  listingNotes?: string | null;
  listingStatus?: ProductStatus;
  reviewNotes?: string | null;
  confirmOrderImpact?: boolean;
}

export interface ProductOwnershipTransferSummary {
  hunter: {
    id: string;
    name: string;
    email: string;
  };
  summary: {
    total: number;
    readyForListing: number;
    listedNeedsReview: number;
    listed: number;
    rejected: number;
  };
  warning?: string | null;
  recentTransfers?: Array<{
    id: string;
    productId: string;
    sourceHunterId: string;
    sourceHunterName: string;
    targetHunterId: string;
    targetHunterName: string;
    transferredBy: string;
    transferredByName: string;
    transferredAt: string;
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
