import { FormControl, FormGroup, Validators } from '@angular/forms';

import { OrderImpact, OrderIssueType, OrderIssueStatus, OrderStatus, PaymentStatus, PlacementStatus } from '../../core/models/order.models';
import { asinValidator } from '../validators/asin.validator';
import { integerValidator } from '../validators/integer.validator';
import { decimalMinValidator, decimalValidator } from '../validators/price.validator';
import { marketplaceUrlValidator } from '../validators/listing-link.validator';

export type OrderForm = FormGroup<{
  ebayOrderId: FormControl<string>;
  ebayItemId: FormControl<string>;
  ebayListingUrl: FormControl<string>;
  orderDate: FormControl<string>;
  quantity: FormControl<number | null>;
  salePrice: FormControl<string>;
  buyerCountry: FormControl<string>;
  buyerName: FormControl<string>;
  buyerState: FormControl<string>;
  buyerCity: FormControl<string>;
  productId: FormControl<string>;
  hunterId: FormControl<string>;
  listerId: FormControl<string>;
  accountId: FormControl<string>;
  asin: FormControl<string>;
  productTitle: FormControl<string>;
  customLabel: FormControl<string>;
  amazonOrderId: FormControl<string>;
  amazonOrderLink: FormControl<string>;
  amazonBuyingPrice: FormControl<string>;
  supplierShippingCost: FormControl<string>;
  otherCost: FormControl<string>;
  ebayFee: FormControl<string>;
  shippingCharged: FormControl<string>;
  taxCollected: FormControl<string>;
  paymentDate: FormControl<string>;
  expectedShipDate: FormControl<string>;
  placedDate: FormControl<string>;
  deliveredDate: FormControl<string>;
  trackingNumber: FormControl<string>;
  carrier: FormControl<string>;
  supplierOrderStatus: FormControl<string>;
  orderStatus: FormControl<OrderStatus>;
  placementStatus: FormControl<PlacementStatus>;
  paymentStatus: FormControl<PaymentStatus>;
  issueType: FormControl<OrderIssueType>;
  issueStatus: FormControl<OrderIssueStatus | ''>;
  orderImpact: FormControl<OrderImpact | ''>;
  notes: FormControl<string>;
  issueReason: FormControl<string>;
}>;

export const createOrderForm = (): OrderForm =>
  new FormGroup({
    ebayOrderId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ebayItemId: new FormControl('', { nonNullable: true }),
    ebayListingUrl: new FormControl('', {
      nonNullable: true,
      validators: [marketplaceUrlValidator('ebay')],
    }),
    orderDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    quantity: new FormControl<number | null>(1, {
      validators: [Validators.required, Validators.min(1), integerValidator],
    }),
    salePrice: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, decimalValidator, decimalMinValidator(0.01)],
    }),
    buyerCountry: new FormControl('', { nonNullable: true }),
    buyerName: new FormControl('', { nonNullable: true }),
    buyerState: new FormControl('', { nonNullable: true }),
    buyerCity: new FormControl('', { nonNullable: true }),
    productId: new FormControl('', { nonNullable: true }),
    hunterId: new FormControl('', { nonNullable: true }),
    listerId: new FormControl('', { nonNullable: true }),
    accountId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    asin: new FormControl('', { nonNullable: true, validators: [asinValidator] }),
    productTitle: new FormControl('', { nonNullable: true }),
    customLabel: new FormControl('', { nonNullable: true }),
    amazonOrderId: new FormControl('', { nonNullable: true }),
    amazonOrderLink: new FormControl('', {
      nonNullable: true,
      validators: [marketplaceUrlValidator('amazon')],
    }),
    amazonBuyingPrice: new FormControl('', {
      nonNullable: true,
      validators: [decimalValidator, decimalMinValidator(0)],
    }),
    supplierShippingCost: new FormControl('', {
      nonNullable: true,
      validators: [decimalValidator, decimalMinValidator(0)],
    }),
    otherCost: new FormControl('', {
      nonNullable: true,
      validators: [decimalValidator, decimalMinValidator(0)],
    }),
    ebayFee: new FormControl('', {
      nonNullable: true,
      validators: [decimalValidator, decimalMinValidator(0)],
    }),
    shippingCharged: new FormControl('', {
      nonNullable: true,
      validators: [decimalValidator, decimalMinValidator(0)],
    }),
    taxCollected: new FormControl('', {
      nonNullable: true,
      validators: [decimalValidator, decimalMinValidator(0)],
    }),
    paymentDate: new FormControl('', { nonNullable: true }),
    expectedShipDate: new FormControl('', { nonNullable: true }),
    placedDate: new FormControl('', { nonNullable: true }),
    deliveredDate: new FormControl('', { nonNullable: true }),
    trackingNumber: new FormControl('', { nonNullable: true }),
    carrier: new FormControl('', { nonNullable: true }),
    supplierOrderStatus: new FormControl('NOT_PLACED', { nonNullable: true }),
    orderStatus: new FormControl<OrderStatus>('NEW', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    placementStatus: new FormControl<PlacementStatus>('NOT_PLACED', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    paymentStatus: new FormControl<PaymentStatus>('PENDING', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    issueType: new FormControl<OrderIssueType>('OTHER', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    issueStatus: new FormControl<OrderIssueStatus | ''>('', { nonNullable: true }),
    orderImpact: new FormControl<OrderImpact | ''>('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    issueReason: new FormControl('', { nonNullable: true }),
  });

export type OrderFilterForm = FormGroup<{
  search: FormControl<string>;
  category: FormControl<string>;
  hunterId: FormControl<string>;
  listerId: FormControl<string>;
  accountId: FormControl<string>;
  status: FormControl<OrderStatus | ''>;
  placementStatus: FormControl<PlacementStatus | ''>;
  dateFrom: FormControl<string>;
  dateTo: FormControl<string>;
  asin: FormControl<string>;
  ebayOrderId: FormControl<string>;
  amazonOrderId: FormControl<string>;
  unmatched: FormControl<boolean>;
  deletedState: FormControl<'active' | 'deleted' | 'all'>;
}>;

export const createOrderFilterForm = (): OrderFilterForm =>
  new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    hunterId: new FormControl('', { nonNullable: true }),
    listerId: new FormControl('', { nonNullable: true }),
    accountId: new FormControl('', { nonNullable: true }),
    status: new FormControl<OrderStatus | ''>('', { nonNullable: true }),
    placementStatus: new FormControl<PlacementStatus | ''>('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
    asin: new FormControl('', { nonNullable: true }),
    ebayOrderId: new FormControl('', { nonNullable: true }),
    amazonOrderId: new FormControl('', { nonNullable: true }),
    unmatched: new FormControl(false, { nonNullable: true }),
    deletedState: new FormControl<'active' | 'deleted' | 'all'>('active', { nonNullable: true }),
  });
