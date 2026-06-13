import { AccountSummary } from './account.models';
import { UserDetails, UserRole } from './auth.models';
import { Order } from './order.models';
import { Product } from './product.models';

export type ReportScope = 'admin' | 'superadmin' | 'hr';

export type ReportSection =
  | 'executive'
  | 'users'
  | 'hunters'
  | 'listers'
  | 'order-processors'
  | 'admins'
  | 'accounts'
  | 'products'
  | 'orders'
  | 'hr'
  | 'teams'
  | 'categories'
  | 'marketplaces'
  | 'activity';

export interface ReportFilters {
  page?: number;
  limit?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  role?: string;
  teamId?: string;
  userId?: string;
  accountId?: string;
  assignedHunterId?: string;
  assignedListerId?: string;
  marketplace?: string;
  country?: string;
  category?: string;
  status?: string;
  sortBy?: string;
  sortDirection?: string;
}

export interface ReportSummary {
  totalRevenue: number;
  totalProfit: number;
  companyShare: number;
  clientShare: number;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
  huntedProducts: number;
  listedProducts: number;
  rejectedProducts: number;
  averageRoi: number;
  openIssues: number;
  pendingChangeRequests: number;
}

export interface UserReportMetricSet {
  primary: number;
  secondary: number;
  tertiary: number;
  profit: number;
  roi: number;
  primaryLabel: string;
  secondaryLabel: string;
  tertiaryLabel: string;
}

export interface UserReportRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  status: string;
  teamName: string | null;
  metrics: UserReportMetricSet;
  details: UserDetails;
}

export interface AccountReportRow {
  id: string;
  name: string;
  marketplace: string;
  country: string | null;
  currency: string;
  isActive: boolean;
  clientProfitPercentage: number | null;
  companyProfitPercentage: number | null;
  previousOrderCount: number;
  lastMonthProfit: number;
  assignedHunterNames: string;
  assignedHunterCount: number;
  assignedListerNames: string;
  assignedListerCount: number;
  totalListed: number;
  pendingListings: number;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  refundedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageRoi: number;
  openIssues: number;
  pendingChangeRequests: number;
  visualIndicators?: string[];
}

export interface AccountReportSummary {
  totalAccountsWithOrders: number;
  totalOrders: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface ProductReportRow {
  id: string;
  title: string | null;
  asin: string | null;
  category: string | null;
  customLabel: string | null;
  status: string;
  amazonPrice: number | null;
  ebayPrice: number | null;
  profit: number;
  roi: number;
  revenue: number;
  qualityLabel: string | null;
  rating: number | null;
  soldCount: number;
  createdAt: string;
  listedAt: string | null;
  updatedAt: string;
  hunterName: string | null;
  listerName: string | null;
  accountName: string | null;
  marketplace: string | null;
  country: string | null;
  orderCount: number;
  issueCount: number;
}

export interface OrderReportRow {
  id: string;
  orderCode: string;
  ebayOrderId: string;
  amazonOrderId: string | null;
  asin: string | null;
  productTitle: string | null;
  orderStatus: string;
  placementStatus: string;
  issueStatus: string | null;
  salePrice: number;
  totalCost: number;
  profit: number;
  roi: number;
  orderDate: string;
  deliveredDate: string | null;
  createdAt: string;
  updatedAt: string;
  hunterName: string | null;
  listerName: string | null;
  accountName: string | null;
  marketplace: string | null;
  country: string | null;
  category: string | null;
}

export interface TeamReportRow {
  id: string;
  name: string;
  description: string | null;
  membersCount: number;
  hunters: number;
  listers: number;
  admins: number;
  hrs: number;
  listedProducts: number;
  totalOrders: number;
  totalProfit: number;
}

export interface CategoryReportRow {
  category: string;
  productCount: number;
  listedCount: number;
  rejectedCount: number;
  orderCount: number;
  revenue: number;
  profit: number;
  averageRoi: number;
  openIssues: number;
}

export interface MarketplaceReportRow {
  marketplace: string;
  country: string;
  accountsCount: number;
  listedCount: number;
  orderCount: number;
  revenue: number;
  profit: number;
  companyShare: number;
  clientShare: number;
}

export interface ActivityReportSummary {
  totalEvents: number;
  logins: number;
  exports: number;
  settingsActions: number;
  productActions: number;
  orderActions: number;
  reportActions: number;
}

export interface ActivityReportRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  targetName: string | null;
  targetEmail: string | null;
  productTitle?: string | null;
  productAsin?: string | null;
  orderCode?: string | null;
  orderEbayId?: string | null;
  accountName?: string | null;
  details?: Record<string, unknown> | null;
}

export interface ExecutiveReport {
  summary: ReportSummary;
  topHunters: UserReportRow[];
  topAccounts: AccountReportRow[];
  topCategories: CategoryReportRow[];
  topMarketplaces: MarketplaceReportRow[];
  warnings?: Array<{ section: string; message: string }>;
}

export interface HrReportBundle {
  dashboard: Record<string, unknown>;
  attendance: { summary: Record<string, number>; rows: Array<Record<string, unknown>> };
  payroll: { summary: Record<string, number>; rows: Array<Record<string, unknown>> };
  expenses: { summary: Record<string, number>; rows: Array<Record<string, unknown>> };
  performance: Array<Record<string, unknown>>;
  employees: {
    items: Array<Record<string, unknown>>;
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export interface PagedReportResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  summary?: Record<string, number>;
}

export interface ReportEventPayload {
  kind: 'VIEW' | 'EXPORT' | 'DRILLDOWN';
  section: string;
  targetId?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface AccountReportDetails extends AccountSummary {
  split: {
    companyShare: number;
    clientShare: number;
    companyProfitPercentage: number;
    clientProfitPercentage: number;
  };
}

export interface ProductReportDetails {
  product: Product;
  metrics: {
    orderCount: number;
    issueCount: number;
    profitGenerated: number;
    lastOrderDate: string | null;
  };
}

export interface OrderReportDetails {
  order: Order;
}
