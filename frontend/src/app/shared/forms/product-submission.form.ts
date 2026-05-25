import { FormControl, FormGroup, Validators } from '@angular/forms';

import { marketplaceUrlValidator } from '../validators/listing-link.validator';
import { asinValidator } from '../validators/asin.validator';

export type SubmissionControlName =
  | 'title'
  | 'amazonUrl'
  | 'amazonAltUrl'
  | 'ebayUrl'
  | 'customLabel'
  | 'amazonStockCount'
  | 'alternateAmazonStockCount'
  | 'soldCount'
  | 'rating'
  | 'productWatchers'
  | 'salesLastTwoMonths'
  | 'basketCount'
  | 'deliveryDays'
  | 'monthlyGraphUptrend'
  | 'amazonPrice'
  | 'ebayPrice';

export interface SubmissionFieldState {
  error: string;
  helper: string;
}

export type ProductSubmissionForm = FormGroup<{
  title: FormControl<string>;
  amazonUrl: FormControl<string>;
  amazonAltUrl: FormControl<string>;
  ebayUrl: FormControl<string>;
  customLabel: FormControl<string>;
  amazonStockCount: FormControl<number | null>;
  alternateAmazonStockCount: FormControl<number | null>;
  soldCount: FormControl<number | null>;
  rating: FormControl<number | null>;
  productWatchers: FormControl<number | null>;
  salesLastTwoMonths: FormControl<number | null>;
  basketCount: FormControl<number | null>;
  deliveryDays: FormControl<number | null>;
  monthlyGraphUptrend: FormControl<boolean | null>;
  amazonPrice: FormControl<string>;
  ebayPrice: FormControl<string>;
}>;

export const createSubmissionAsinControl = () =>
  new FormControl('', {
    nonNullable: true,
    validators: [asinValidator],
  });

export const createProductSubmissionForm = (): ProductSubmissionForm =>
  new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    amazonUrl: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, marketplaceUrlValidator('amazon')],
    }),
    amazonAltUrl: new FormControl('', {
      nonNullable: true,
      validators: [marketplaceUrlValidator('amazon')],
    }),
    ebayUrl: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, marketplaceUrlValidator('ebay')],
    }),
    customLabel: new FormControl('', { nonNullable: true }),
    amazonStockCount: new FormControl<number | null>(null),
    alternateAmazonStockCount: new FormControl<number | null>(null),
    soldCount: new FormControl<number | null>(null),
    rating: new FormControl<number | null>(null),
    productWatchers: new FormControl<number | null>(null),
    salesLastTwoMonths: new FormControl<number | null>(null),
    basketCount: new FormControl<number | null>(null),
    deliveryDays: new FormControl<number | null>(null),
    monthlyGraphUptrend: new FormControl<boolean | null>(null),
    amazonPrice: new FormControl('', { nonNullable: true }),
    ebayPrice: new FormControl('', { nonNullable: true }),
  });
