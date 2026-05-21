import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import {
  AsinCheckResult,
  HuntingCriteria,
  Product,
  ProductCreatePayload,
  ProductDuplicateInfo,
  ProductQualityLabel,
} from '../../core/models/product.models';
import { ProductService } from '../../core/services/product.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ToastService } from '../../core/ui/toast.service';

type SubmissionControlName =
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
  | 'amazonPrice'
  | 'ebayPrice';

type SummaryTone = 'success' | 'warning' | 'danger' | 'neutral';

const integerValidator: ValidatorFn = (control) => {
  if (control.value === null || control.value === undefined || control.value === '') {
    return null;
  }

  return Number.isInteger(Number(control.value)) ? null : { integer: true };
};

const asinValidator: ValidatorFn = (control) => {
  const value = String(control.value || '').trim().toUpperCase();

  if (!value) {
    return { required: true };
  }

  return /^[A-Z0-9]{10}$/.test(value) ? null : { asin: true };
};

const decimalValue = (value: unknown): number | null => {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    return null;
  }

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const decimalValidator: ValidatorFn = (control) => {
  if (!String(control.value ?? '').trim()) {
    return null;
  }

  return decimalValue(control.value) === null ? { decimal: true } : null;
};

const decimalMinValidator = (min: number): ValidatorFn => (control) => {
  const parsed = decimalValue(control.value);

  if (parsed === null) {
    return String(control.value ?? '').trim() ? null : null;
  }

  return parsed >= min ? null : { min: { min, actual: parsed } };
};

const marketplaceUrlValidator = (marketplace: 'amazon' | 'ebay'): ValidatorFn => (control) => {
  if (!control.value) {
    return null;
  }

  try {
    const parsed = new URL(String(control.value).trim());
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';

    if (!isHttp) {
      return { url: true };
    }

    const hostname = parsed.hostname.toLowerCase();
    const matchesMarketplace =
      marketplace === 'amazon'
        ? hostname.includes('amazon.') || hostname.includes('amzn.')
        : hostname.includes('ebay.');

    return matchesMarketplace ? null : { marketplace: true };
  } catch {
    return { url: true };
  }
};

const economicsValidator = (getCriteria: () => HuntingCriteria): ValidatorFn => (control) => {
  const group = control as FormGroup;
  const amazonPrice = decimalValue(group.get('amazonPrice')?.value);
  const ebayPrice = decimalValue(group.get('ebayPrice')?.value);

  if (amazonPrice === null || ebayPrice === null || amazonPrice <= 0 || ebayPrice <= 0) {
    return { economicsMissing: true };
  }

  const criteria = getCriteria();
  const fees = Number(((ebayPrice * criteria.feePercent) / 100).toFixed(2));
  const profit = Number((ebayPrice - amazonPrice - fees).toFixed(2));
  const roi = Number(((profit / amazonPrice) * 100).toFixed(2));
  const errors: ValidationErrors = {};

  if (profit < criteria.minProfit) {
    errors['profitBelowMin'] = true;
  }

  if (!Number.isFinite(roi) || roi < criteria.minRoi) {
    errors['roiBelowMin'] = true;
  }

  return Object.keys(errors).length > 0 ? errors : null;
};

interface SubmissionModalState {
  product: Product;
  qualityLabel: ProductQualityLabel;
  shortReason: string;
  nextAction: string;
}

@Component({
  selector: 'app-hunter-submission',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    CurrencyPipe,
    DecimalPipe,
    DatePipe,
  ],
  templateUrl: './hunter-submission.component.html',
  styleUrl: './hunter-submission.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterSubmissionComponent implements OnInit {
  readonly saving = signal(false);
  readonly attemptedSubmit = signal(false);
  readonly error = signal('');
  readonly criteriaLoading = signal(false);
  readonly asinChecking = signal(false);
  readonly asinVerified = signal(false);
  readonly asinDuplicate = signal<ProductDuplicateInfo | null>(null);
  readonly lastSubmitted = signal<Product | null>(null);
  readonly submissionModal = signal<SubmissionModalState | null>(null);
  readonly criteria = signal<HuntingCriteria>({
    minRoi: 30,
    minProfit: 0,
    minSoldCount: 1,
    feePercent: 21,
    asinRequired: true,
    minStockCount: 8,
    minAlternateStockCount: 8,
    minRating: 0,
    customLabelRequired: false,
    watchersRequired: false,
    minWatcherCount: 0,
    minSalesLastTwoMonths: 0,
  });

  readonly asinControl = new FormControl('', {
    nonNullable: true,
    validators: [asinValidator],
  });

  readonly form = new FormGroup({
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
    amazonPrice: new FormControl('', { nonNullable: true }),
    ebayPrice: new FormControl('', { nonNullable: true }),
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthService);
  private readonly formVersion = signal(0);

  readonly economics = computed(() => {
    this.formVersion();
    const amazonPrice = decimalValue(this.form.controls.amazonPrice.value);
    const ebayPrice = decimalValue(this.form.controls.ebayPrice.value);

    if (amazonPrice === null || ebayPrice === null || amazonPrice <= 0 || ebayPrice <= 0) {
      return { fees: null, profit: null, roi: null };
    }

    const feePercent = this.criteria().feePercent;
    const fees = Number(((ebayPrice * feePercent) / 100).toFixed(2));
    const profit = Number((ebayPrice - amazonPrice - fees).toFixed(2));
    const roi = Number(((profit / amazonPrice) * 100).toFixed(2));

    return { fees, profit, roi };
  });

  readonly economicsError = computed(() => {
    this.formVersion();
    const errors = this.form.errors;
    const shouldShow =
      this.attemptedSubmit() ||
      this.form.controls.amazonPrice.touched ||
      this.form.controls.ebayPrice.touched;

    if (!errors || !shouldShow) {
      return '';
    }

    if (errors['profitBelowMin']) {
      return `Profit must be at least ${this.criteria().minProfit.toFixed(2)}.`;
    }

    if (errors['roiBelowMin']) {
      return `ROI must be at least ${this.criteria().minRoi}%.`;
    }

    if (errors['economicsMissing']) {
      return 'Enter valid Amazon and eBay prices to calculate profit and ROI.';
    }

    return '';
  });

  readonly qualityPreview = computed<ProductQualityLabel>(() => {
    if (!this.asinVerified()) {
      return 'Average Hunting';
    }

    if (this.form.invalid || this.economicsError()) {
      return 'Rejected';
    }

    const roi = this.economics().roi ?? 0;
    const profit = this.economics().profit ?? 0;
    const sales = this.form.controls.salesLastTwoMonths.value ?? 0;
    const stock = this.form.controls.amazonStockCount.value ?? 0;
    const rating = this.form.controls.rating.value ?? 0;
    const criteria = this.criteria();

    const strongSignals = [
      roi >= Math.max(criteria.minRoi + 15, criteria.minRoi * 1.35, 35),
      profit >= Math.max(criteria.minProfit + 5, criteria.minProfit * 1.5, 5),
      sales >= Math.max(criteria.minSalesLastTwoMonths + 12, criteria.minSalesLastTwoMonths * 1.4, 12),
      stock >= Math.max(criteria.minStockCount + 4, criteria.minStockCount * 1.3, 12),
      rating >= Math.max(criteria.minRating + 0.5, 4.2),
    ].filter(Boolean).length;

    if (strongSignals >= 4) {
      return 'Excellent Hunting';
    }

    if (strongSignals >= 2) {
      return 'Good Hunting';
    }

    return 'Average Hunting';
  });

  readonly approvalSummary = computed(() => {
    if (this.criteriaLoading()) {
      return {
        tone: 'neutral' as SummaryTone,
        label: 'Loading rules',
        message: 'Fetching the latest approval settings.',
      };
    }

    if (this.asinDuplicate()) {
      return {
        tone: 'danger' as SummaryTone,
        label: 'Duplicate ASIN',
        message: `This ASIN already exists with status ${this.asinDuplicate()?.status}.`,
      };
    }

    if (!this.asinVerified()) {
      return {
        tone: 'warning' as SummaryTone,
        label: 'ASIN check required',
        message: 'Verify the ASIN before entering the full product details.',
      };
    }

    if (this.economicsError()) {
      return {
        tone: 'danger' as SummaryTone,
        label: 'Needs review',
        message: this.economicsError(),
      };
    }

    if (this.form.valid) {
      return {
        tone: 'success' as SummaryTone,
        label: this.qualityPreview(),
        message: 'Current values satisfy the active validation rules.',
      };
    }

    return {
      tone: 'warning' as SummaryTone,
      label: 'Keep filling',
      message: 'Complete the required fields to finish the system check.',
    };
  });

  readonly validationItems = computed(() => {
    this.formVersion();

    return [
      {
        label: 'ASIN verified',
        passed: this.asinVerified() && !this.asinDuplicate(),
        detail: this.asinVerified() ? this.asinControl.value : 'Verify before submission',
      },
      {
        label: 'Required fields',
        passed: ['title', 'amazonUrl', 'ebayUrl'].every(
          (field) => !this.controlError(field as SubmissionControlName) && Boolean(this.form.get(field)?.value),
        ),
        detail: 'Core product and marketplace fields',
      },
      {
        label: 'Stock and sales rules',
        passed:
          !this.controlError('amazonStockCount') &&
          !this.controlError('soldCount') &&
          !this.controlError('salesLastTwoMonths') &&
          !this.controlError('rating'),
        detail: 'Uses the current admin thresholds',
      },
      {
        label: 'Economics check',
        passed: !this.economicsError() && this.economics().profit !== null,
        detail:
          this.economics().profit === null
            ? 'Enter prices to calculate profit and ROI'
            : `${this.economics().profit?.toFixed(2)} profit / ${this.economics().roi?.toFixed(2)}% ROI`,
      },
      {
        label: 'Quality label',
        passed: this.qualityPreview() !== 'Rejected',
        detail: this.qualityPreview(),
      },
    ];
  });

  readonly canSubmit = computed(
    () =>
      this.asinVerified() &&
      !this.asinDuplicate() &&
      !this.form.invalid &&
      !this.saving() &&
      !this.criteriaLoading(),
  );

  readonly defaultCustomLabel = computed(() => this.auth.currentUser()?.name || 'Trend Wave Hunter');

  constructor(
    private readonly productsApi: ProductService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.form.setValidators(economicsValidator(() => this.criteria()));
    this.form.disable({ emitEvent: false });
    this.resetFormFields();

    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formVersion.update((value) => value + 1));

    this.asinControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        const normalized = value.trim().toUpperCase();

        if (value !== normalized) {
          this.asinControl.setValue(normalized, { emitEvent: false });
        }

        this.asinVerified.set(false);
        this.asinDuplicate.set(null);
        this.disableFormOnly();
      });

    this.criteriaLoading.set(true);
    this.referenceData
      .getCriteria()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (criteria) => {
          this.criteria.set(criteria);
          this.applyCriteriaValidators(criteria);
          this.criteriaLoading.set(false);
        },
        error: () => this.criteriaLoading.set(false),
      });

    effect(
      () => {
        const version = this.workspaceSync.settingsVersion();

        if (version > 0) {
          this.referenceData.refreshCriteria();
        }
      },
      { allowSignalWrites: true, injector: this.injector },
    );
  }

  asinError(): string {
    if (!this.asinControl.touched && !this.attemptedSubmit()) {
      return '';
    }

    if (this.asinControl.hasError('required')) {
      return 'ASIN is required to unlock the submission form.';
    }

    if (this.asinControl.hasError('asin')) {
      return 'Enter a valid 10-character ASIN.';
    }

    return '';
  }

  controlError(name: SubmissionControlName): string {
    const control = this.form.controls[name];

    if (!this.shouldShowControlError(control)) {
      return '';
    }

    if (control.hasError('required')) {
      switch (name) {
        case 'title':
          return 'Product title is required.';
        case 'amazonUrl':
          return 'Amazon link is required.';
        case 'ebayUrl':
          return 'eBay link is required.';
        case 'customLabel':
          return 'Custom label is required by the current admin settings.';
        case 'amazonStockCount':
          return 'Amazon stock count is required.';
        case 'soldCount':
          return 'Sold count is required.';
        case 'rating':
          return 'Rating is required.';
        case 'productWatchers':
          return 'Product watchers are required by the current admin settings.';
        case 'salesLastTwoMonths':
          return 'Sales in the past two months are required.';
        case 'amazonPrice':
          return 'Amazon price is required.';
        case 'ebayPrice':
          return 'eBay price is required.';
        default:
          return 'This field is required.';
      }
    }

    if (control.hasError('url')) {
      return 'Enter a valid http or https URL.';
    }

    if (control.hasError('marketplace')) {
      return name === 'ebayUrl' ? 'Enter a valid eBay URL.' : 'Enter a valid Amazon URL.';
    }

    if (control.hasError('integer')) {
      return 'Whole numbers only.';
    }

    if (control.hasError('decimal')) {
      return 'Use numbers with up to 2 decimal places.';
    }

    if (control.hasError('min')) {
      switch (name) {
        case 'amazonStockCount':
          return `Minimum stock is ${this.criteria().minStockCount}.`;
        case 'alternateAmazonStockCount':
          return `Minimum alternate stock is ${this.criteria().minAlternateStockCount}.`;
        case 'soldCount':
          return `Minimum sold count is ${this.criteria().minSoldCount}.`;
        case 'rating':
          return `Minimum rating is ${this.criteria().minRating}.`;
        case 'productWatchers':
          return `Minimum watcher count is ${this.criteria().minWatcherCount}.`;
        case 'salesLastTwoMonths':
          return `Minimum sales is ${this.criteria().minSalesLastTwoMonths}.`;
        case 'amazonPrice':
        case 'ebayPrice':
          return 'Enter a value greater than zero.';
        default:
          return 'Enter a valid value.';
      }
    }

    return '';
  }

  helperText(name: SubmissionControlName): string {
    switch (name) {
      case 'customLabel':
        return this.criteria().customLabelRequired
          ? 'Required by the current rules.'
          : 'Defaults to your name.';
      case 'amazonStockCount':
        return `Minimum ${this.criteria().minStockCount}.`;
      case 'alternateAmazonStockCount':
        return `Optional. Minimum ${this.criteria().minAlternateStockCount}.`;
      case 'soldCount':
        return `Whole number. Minimum ${this.criteria().minSoldCount}.`;
      case 'rating':
        return `Minimum ${this.criteria().minRating}.`;
      case 'productWatchers':
        return this.criteria().watchersRequired
          ? `Required. Minimum ${this.criteria().minWatcherCount}.`
          : `Optional. Minimum ${this.criteria().minWatcherCount}.`;
      case 'salesLastTwoMonths':
        return `Minimum ${this.criteria().minSalesLastTwoMonths}.`;
      case 'amazonPrice':
      case 'ebayPrice':
        return 'Keeps your decimals while you type.';
      default:
        return '';
    }
  }

  checkAsin(): void {
    if (this.asinControl.invalid || this.asinChecking()) {
      this.asinControl.markAsTouched();
      return;
    }

    this.asinChecking.set(true);
    this.error.set('');
    this.asinDuplicate.set(null);
    this.asinVerified.set(false);

    this.productsApi.checkAsin(this.asinControl.value).subscribe({
      next: (result: AsinCheckResult) => {
        if (result.isDuplicate) {
          this.asinDuplicate.set(result.product);
          this.disableFormOnly();
          return;
        }

        this.asinVerified.set(true);
        this.asinDuplicate.set(null);
        this.enableFormOnly();
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not verify this ASIN.');
        this.disableFormOnly();
      },
      complete: () => this.asinChecking.set(false),
    });
  }

  submit(): void {
    this.attemptedSubmit.set(true);

    if (!this.canSubmit()) {
      this.asinControl.markAsTouched();
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const payload: ProductCreatePayload = {
      ...(this.form.getRawValue() as Omit<ProductCreatePayload, 'asin' | 'amazonPrice' | 'ebayPrice'>),
      asin: this.asinControl.value,
      amazonPrice: decimalValue(this.form.controls.amazonPrice.value),
      ebayPrice: decimalValue(this.form.controls.ebayPrice.value),
    };

    this.productsApi.createProduct(payload).subscribe({
      next: (product) => {
        this.lastSubmitted.set(product);
        this.submissionModal.set({
          product,
          qualityLabel: (product.qualityLabel as ProductQualityLabel) || this.qualityPreview(),
          shortReason:
            product.status === 'rejected'
              ? product.primaryFailure || product.rejectionReason || 'This product did not pass the current rules.'
              : 'All required checks passed and the product is ready for the listing workflow.',
          nextAction:
            product.status === 'rejected'
              ? 'Review the rejection reason, update the product details, and submit again.'
              : 'The product is now ready for listing. You can follow it from the product list.',
        });
        this.resetAll();
        this.toast.success('Product submitted.');
        this.workspaceSync.notifyProductsChanged();
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not submit product.');

        if (error?.status === 409 && error?.error?.details?.product) {
          this.asinDuplicate.set(error.error.details.product);
          this.asinVerified.set(false);
          this.disableFormOnly();
        }
      },
      complete: () => this.saving.set(false),
    });
  }

  clearForm(): void {
    if (this.saving()) {
      return;
    }

    this.resetAll();
    this.lastSubmitted.set(null);
    this.error.set('');
  }

  closeSubmissionModal(): void {
    this.submissionModal.set(null);
  }

  private shouldShowControlError(control: AbstractControl | null): boolean {
    return Boolean(control && (control.touched || this.attemptedSubmit()));
  }

  private applyCriteriaValidators(criteria: HuntingCriteria): void {
    this.form.controls.customLabel.setValidators(
      criteria.customLabelRequired ? [Validators.required] : [],
    );
    this.form.controls.amazonStockCount.setValidators([
      Validators.required,
      integerValidator,
      Validators.min(criteria.minStockCount),
    ]);
    this.form.controls.alternateAmazonStockCount.setValidators([
      integerValidator,
      Validators.min(criteria.minAlternateStockCount),
    ]);
    this.form.controls.soldCount.setValidators([
      Validators.required,
      integerValidator,
      Validators.min(criteria.minSoldCount),
    ]);
    this.form.controls.rating.setValidators([
      Validators.required,
      Validators.min(criteria.minRating),
    ]);
    this.form.controls.productWatchers.setValidators([
      ...(criteria.watchersRequired ? [Validators.required] : []),
      integerValidator,
      Validators.min(criteria.minWatcherCount),
    ]);
    this.form.controls.salesLastTwoMonths.setValidators([
      Validators.required,
      integerValidator,
      Validators.min(criteria.minSalesLastTwoMonths),
    ]);
    this.form.controls.amazonPrice.setValidators([
      Validators.required,
      decimalValidator,
      decimalMinValidator(0.01),
    ]);
    this.form.controls.ebayPrice.setValidators([
      Validators.required,
      decimalValidator,
      decimalMinValidator(0.01),
    ]);

    Object.values(this.form.controls).forEach((control) =>
      control.updateValueAndValidity({ emitEvent: false }),
    );
    this.form.updateValueAndValidity({ emitEvent: false });
  }

  private enableFormOnly(): void {
    this.form.enable({ emitEvent: false });
    this.form.controls.customLabel.setValue(
      this.form.controls.customLabel.value || this.defaultCustomLabel(),
      { emitEvent: false },
    );
    this.applyCriteriaValidators(this.criteria());
    this.formVersion.update((value) => value + 1);
  }

  private disableFormOnly(): void {
    this.form.disable({ emitEvent: false });
    this.formVersion.update((value) => value + 1);
  }

  private resetFormFields(): void {
    this.form.reset(
      {
        title: '',
        amazonUrl: '',
        amazonAltUrl: '',
        ebayUrl: '',
        customLabel: this.defaultCustomLabel(),
        amazonStockCount: null,
        alternateAmazonStockCount: null,
        soldCount: null,
        rating: null,
        productWatchers: null,
        salesLastTwoMonths: null,
        amazonPrice: '',
        ebayPrice: '',
      },
      { emitEvent: false },
    );
    this.applyCriteriaValidators(this.criteria());
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private resetAll(): void {
    this.resetFormFields();
    this.asinControl.reset('', { emitEvent: false });
    this.asinVerified.set(false);
    this.asinDuplicate.set(null);
    this.attemptedSubmit.set(false);
    this.disableFormOnly();
  }
}
