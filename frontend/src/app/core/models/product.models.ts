export type ProductStatus = 'approved' | 'rejected' | 'assigned' | 'listed';

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
  ebayUrl: string;
  asin: string | null;
  title: string | null;
  amazonPrice: number | null;
  ebayPrice: number | null;
  fees: number;
  soldCount: number;
  stockQuantity: number | null;
  deliveryDays: number | null;
  profit: number;
  roi: number;
  status: ProductStatus;
  rejectionReason: string | null;
  validationNotes: ValidationNote[];
  listedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCreatePayload {
  amazonUrl: string;
  ebayUrl: string;
  title?: string;
  asin?: string;
  amazonPrice: number;
  ebayPrice: number;
  soldCount: number;
}

export interface Account {
  id: string;
  name: string;
  marketplace: string;
  isActive: boolean;
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
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface ProductFilters {
  search?: string;
  status?: ProductStatus | '';
  hunterId?: string;
  from?: string;
  to?: string;
}

export interface BulkListedPayload {
  accountId: string;
  items: Array<{
    id: string;
    listingUrl?: string;
    itemId?: string;
  }>;
}
