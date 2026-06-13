import { Account } from './product.models';

export interface AccountInvoiceLineItem {
  title: string;
  description: string | null;
  amount: number;
  includeInTotal: boolean;
}

export interface AccountInvoicePaymentBlock {
  title: string | null;
  bankName: string | null;
  accountNumber: string | null;
  iban: string | null;
  branch: string | null;
}

export interface AccountInvoice {
  id: string;
  invoiceCode: string;
  accountId: string;
  accountName: string | null;
  billToName: string;
  invoiceMonth: string | null;
  invoiceMonthLabel: string;
  invoiceDate: string;
  currency: string;
  lineItems: AccountInvoiceLineItem[];
  primaryPayment: AccountInvoicePaymentBlock | null;
  alternatePayment: AccountInvoicePaymentBlock | null;
  notes: string | null;
  totalNetPayable: number;
  createdBy: string | null;
  createdByName: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSummary {
  account: Account;
  stats: {
    totalProducts: number;
    totalListed: number;
    pendingListings: number;
    rejectedProducts: number;
    lastListedAt: string | null;
    totalOrders: number;
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    averageRoi: number;
    previousOrderCount: number;
    lastMonthProfit: number;
    deliveredOrders: number;
    returnedOrders: number;
    refundedOrders: number;
    cancelledOrders: number;
    issueOrders: number;
    lossOrders: number;
    lastOrderDate: string | null;
    openChangeRequests: number;
    fixedChangeRequests: number;
    assignedListerCount: number;
  };
  recentOrders: Array<{
    id: string;
    orderCode: string;
    ebayOrderId: string;
    label: string;
    status: string;
    profit: number;
    orderDate: string;
  }>;
  invoices: AccountInvoice[];
}

export interface AccountInvoicePayload {
  billToName: string;
  invoiceMonth: string;
  invoiceDate: string;
  currency: string;
  lineItems: AccountInvoiceLineItem[];
  primaryPayment: AccountInvoicePaymentBlock | null;
  alternatePayment: AccountInvoicePaymentBlock | null;
  notes?: string | null;
}

export interface AccountBulkImportResult {
  summary: {
    total: number;
    created: number;
    updated: number;
    failed: number;
  };
  accounts: Account[];
  errors: Array<{
    row: number;
    name?: string | null;
    message: string;
  }>;
}

export interface AccountBulkInvoiceResult {
  summary: {
    total: number;
    created: number;
    failed: number;
  };
  invoices: AccountInvoice[];
  errors: Array<{
    row: number;
    accountName?: string | null;
    message: string;
  }>;
}
