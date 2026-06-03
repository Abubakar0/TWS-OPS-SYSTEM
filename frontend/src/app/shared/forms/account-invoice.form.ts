import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';

export interface InvoiceLineItemValue {
  title: string;
  description: string;
  amount: number | null;
  includeInTotal: boolean;
}

export interface InvoicePaymentValue {
  title: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  branch: string;
}

export type InvoiceLineItemForm = FormGroup<{
  title: FormControl<string>;
  description: FormControl<string>;
  amount: FormControl<number | null>;
  includeInTotal: FormControl<boolean>;
}>;

export type InvoicePaymentForm = FormGroup<{
  title: FormControl<string>;
  bankName: FormControl<string>;
  accountNumber: FormControl<string>;
  iban: FormControl<string>;
  branch: FormControl<string>;
}>;

export type AccountInvoiceForm = FormGroup<{
  billToName: FormControl<string>;
  invoiceMonth: FormControl<string>;
  invoiceDate: FormControl<string>;
  currency: FormControl<string>;
  lineItems: FormArray<InvoiceLineItemForm>;
  primaryPayment: InvoicePaymentForm;
  alternatePayment: InvoicePaymentForm;
  notes: FormControl<string>;
}>;

export const DEFAULT_PRIMARY_PAYMENT: InvoicePaymentValue = {
  title: 'Primary Account',
  bankName: 'Trend Wave Solutions | Bank Alfalah (BAF)',
  accountNumber: '00081010150545',
  iban: 'PK54ALFH0008001010150545',
  branch: 'S. Town Branch',
};

export const DEFAULT_ALTERNATE_PAYMENT: InvoicePaymentValue = {
  title: 'Alternate Account',
  bankName: 'M Adil Ghaffar | Meezan Bank Limited (MBL)',
  accountNumber: '03120102615756',
  iban: 'PK50MEZN0003120102615756',
  branch: 'I-8 Branch',
};

export const DEFAULT_INVOICE_LINE_ITEMS: InvoiceLineItemValue[] = [
  {
    title: 'Total Profit',
    description: '',
    amount: 0,
    includeInTotal: false,
  },
  {
    title: 'Company Profit',
    description: '',
    amount: 0,
    includeInTotal: true,
  },
  {
    title: 'Client Profit',
    description: '',
    amount: 0,
    includeInTotal: false,
  },
  {
    title: 'Tracking Fees',
    description: '',
    amount: 0,
    includeInTotal: true,
  },
];

const pad = (value: number) => String(value).padStart(2, '0');

export const buildInvoiceMonthValue = (date = new Date()): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

export const buildInvoiceDateValue = (date = new Date()): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const createInvoiceLineItemForm = (
  value: Partial<InvoiceLineItemValue> = {},
): InvoiceLineItemForm =>
  new FormGroup({
    title: new FormControl(value.title ?? '', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl(value.description ?? '', {
      nonNullable: true,
    }),
    amount: new FormControl<number | null>(value.amount ?? null, {
      validators: [Validators.required],
    }),
    includeInTotal: new FormControl(value.includeInTotal ?? true, {
      nonNullable: true,
    }),
  });

export const createInvoicePaymentForm = (
  value: Partial<InvoicePaymentValue> = {},
): InvoicePaymentForm =>
  new FormGroup({
    title: new FormControl(value.title ?? '', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    bankName: new FormControl(value.bankName ?? '', { nonNullable: true }),
    accountNumber: new FormControl(value.accountNumber ?? '', { nonNullable: true }),
    iban: new FormControl(value.iban ?? '', { nonNullable: true }),
    branch: new FormControl(value.branch ?? '', { nonNullable: true }),
  });

export const createAccountInvoiceForm = (): AccountInvoiceForm =>
  new FormGroup({
    billToName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    invoiceMonth: new FormControl(buildInvoiceMonthValue(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    invoiceDate: new FormControl(buildInvoiceDateValue(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    currency: new FormControl('USD', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    lineItems: new FormArray(
      DEFAULT_INVOICE_LINE_ITEMS.map((item) => createInvoiceLineItemForm(item)),
      Validators.required,
    ),
    primaryPayment: createInvoicePaymentForm(DEFAULT_PRIMARY_PAYMENT),
    alternatePayment: createInvoicePaymentForm(DEFAULT_ALTERNATE_PAYMENT),
    notes: new FormControl('', { nonNullable: true }),
  });
