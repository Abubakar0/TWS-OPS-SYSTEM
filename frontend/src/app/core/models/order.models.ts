export type OrderStatus =
  | 'NEW'
  | 'READY_TO_PLACE'
  | 'PLACED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'ISSUE'
  | 'ON_HOLD';

export type PlacementStatus = 'NOT_PLACED' | 'PLACED' | 'FAILED' | 'CANCELLED';
export type PaymentStatus = 'PAID' | 'PENDING' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type OrderMatchStatus = 'matched' | 'unmatched';
export type OrderIssueType =
  | 'PRODUCT_NOT_AVAILABLE'
  | 'PRICE_INCREASED'
  | 'ORDER_IN_LOSS'
  | 'LOW_STOCK'
  | 'WRONG_PRODUCT_LINK'
  | 'AMAZON_LINK_NOT_WORKING'
  | 'SUPPLIER_CANCELLED'
  | 'BUYER_ADDRESS_ISSUE'
  | 'TRACKING_ISSUE'
  | 'OTHER';
export type OrderIssueStatus = 'OPEN' | 'IN_REVIEW' | 'FIXED' | 'REJECTED' | 'CLOSED';
export type OrderImpact =
  | 'Product unavailable'
  | 'Product in loss'
  | 'Price changed'
  | 'Stock not enough'
  | 'Wrong listing/product'
  | 'Other';

export interface OrderProductMatch {
  id: string;
  asin: string | null;
  title: string | null;
  customLabel: string | null;
  category?: string | null;
  hunterId: string;
  hunterName: string;
  listerId: string | null;
  listerName: string | null;
  accountId: string | null;
  accountName: string | null;
  amazonUrl: string;
  ebayUrl: string;
  listingUrl: string | null;
  itemId: string | null;
  profit: number;
  roi: number;
  status: string;
}

export interface Order {
  id: string;
  orderCode: string;
  ebayOrderId: string;
  ebayItemId: string | null;
  ebayListingUrl: string | null;
  productId: string | null;
  asin: string | null;
  productTitle: string | null;
  customLabel: string | null;
  productCategory?: string | null;
  hunterId: string | null;
  hunterName: string | null;
  listerId: string | null;
  listerName: string | null;
  accountId: string;
  accountName: string | null;
  accountMarketplace: string | null;
  buyerName: string | null;
  buyerCountry: string | null;
  buyerState: string | null;
  buyerCity: string | null;
  quantity: number;
  salePrice: number;
  ebayFee: number | null;
  shippingCharged: number | null;
  taxCollected: number | null;
  amazonBuyingPrice: number;
  supplierShippingCost: number | null;
  otherCost: number | null;
  totalCost: number;
  profit: number;
  roi: number;
  currency: string;
  orderDate: string;
  paymentDate: string | null;
  expectedShipDate: string | null;
  placedDate: string | null;
  deliveredDate: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  amazonOrderId: string | null;
  amazonOrderLink: string | null;
  supplierOrderStatus: string;
  orderStatus: OrderStatus;
  placementStatus: PlacementStatus;
  paymentStatus: PaymentStatus;
  matchStatus: OrderMatchStatus;
  issueType: OrderIssueType | null;
  issueStatus: OrderIssueStatus | null;
  orderImpact: OrderImpact | null;
  notes: string | null;
  issueReason: string | null;
  issueCreatedAt: string | null;
  issueCreatedBy: string | null;
  issueCreatedByName: string | null;
  issueResolvedAt: string | null;
  issueResolvedBy: string | null;
  issueResolvedByName: string | null;
  createdBy: string | null;
  createdByName: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  deletedBy: string | null;
  deletedByName: string | null;
  deletedAt: string | null;
  deleteReason: string | null;
  createdAt: string;
  updatedAt: string;
  productAmazonUrl: string | null;
  productEbayUrl: string | null;
  listingUrl: string | null;
  listingItemId: string | null;
}

export interface OrderFilters {
  search?: string;
  category?: string;
  hunterId?: string;
  listerId?: string;
  accountId?: string;
  status?: OrderStatus | '';
  placementStatus?: PlacementStatus | '';
  dateFrom?: string;
  dateTo?: string;
  minProfit?: number | null;
  maxProfit?: number | null;
  asin?: string;
  ebayOrderId?: string;
  amazonOrderId?: string;
  unmatched?: boolean;
  deletedState?: 'active' | 'deleted' | 'all';
  page?: number;
  limit?: number;
}

export interface OrderUpsertPayload {
  ebayOrderId: string;
  ebayItemId?: string | null;
  ebayListingUrl?: string | null;
  orderDate: string;
  quantity: number;
  salePrice: number | string;
  buyerCountry?: string | null;
  buyerName?: string | null;
  buyerState?: string | null;
  buyerCity?: string | null;
  productId?: string | null;
  hunterId?: string | null;
  listerId?: string | null;
  accountId: string;
  asin?: string | null;
  productTitle?: string | null;
  customLabel?: string | null;
  amazonOrderId?: string | null;
  amazonOrderLink?: string | null;
  amazonBuyingPrice?: number | string | null;
  supplierShippingCost?: number | string | null;
  otherCost?: number | string | null;
  ebayFee?: number | string | null;
  shippingCharged?: number | string | null;
  taxCollected?: number | string | null;
  paymentDate?: string | null;
  expectedShipDate?: string | null;
  placedDate?: string | null;
  deliveredDate?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  supplierOrderStatus?: string | null;
  orderStatus?: OrderStatus;
  placementStatus?: PlacementStatus;
  paymentStatus?: PaymentStatus;
  issueType?: OrderIssueType | null;
  issueStatus?: OrderIssueStatus | null;
  orderImpact?: OrderImpact | null;
  notes?: string | null;
  issueReason?: string | null;
}

export interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageRoi: number;
  pendingPlacement: number;
  placedOrders: number;
  deliveredOrders: number;
  issueOrders: number;
  lossOrders: number;
  unavailableIssues: number;
  unmatchedOrders: number;
  ordersToday: number;
  placedToday: number;
  ordersThisMonth: number;
  bestSellingProduct: string | null;
  byHunter: Array<{
    hunterId: string;
    hunterName: string;
    orderCount: number;
    revenue: number;
    profit: number;
    roi: number;
  }>;
  byAccount: Array<{
    accountId: string;
    accountName: string;
    orderCount: number;
    revenue: number;
    profit: number;
  }>;
  byStatus: Array<{
    status: OrderStatus;
    count: number;
  }>;
  daily: Array<{
    date: string;
    orders: number;
    revenue: number;
    profit: number;
  }>;
}

export interface OrderIssue {
  id: string;
  orderCode: string;
  ebayOrderId: string;
  productId: string | null;
  asin: string | null;
  productTitle: string | null;
  hunterId: string | null;
  hunterName: string | null;
  listerId: string | null;
  listerName: string | null;
  accountId: string | null;
  accountName: string | null;
  salePrice: number;
  totalCost: number;
  profit: number;
  roi: number;
  orderDate: string;
  orderStatus: OrderStatus;
  issueType: OrderIssueType | null;
  issueReason: string | null;
  issueStatus: OrderIssueStatus | null;
  orderImpact: OrderImpact | null;
  issueCreatedAt: string | null;
  issueCreatedBy: string | null;
  issueCreatedByName: string | null;
  issueResolvedAt: string | null;
  issueResolvedBy: string | null;
  issueResolvedByName: string | null;
  notes: string | null;
  amazonOrderId: string | null;
  amazonOrderLink: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  productAmazonUrl: string | null;
  productEbayUrl: string | null;
  listingUrl: string | null;
  changeRequestId: string | null;
  changeRequestStatus: string | null;
}
