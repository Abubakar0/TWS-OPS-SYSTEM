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
  listedBy: string | null;
  listedByName: string | null;
  accountUsed: string | null;
  accountName: string | null;
  amazonUrl: string;
  ebayUrl: string;
  asin: string | null;
  title: string | null;
  amazonPrice: number | null;
  ebayPrice: number | null;
  fees: number;
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
  fees: number;
  stockQuantity: number;
  deliveryDays: number;
}
