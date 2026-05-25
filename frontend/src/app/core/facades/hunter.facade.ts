import { Validators } from '@angular/forms';
import { computed, DestroyRef, effect, inject, Injectable, Injector, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { HunterApiService } from '../api/hunter-api.service';
import { WeeklyReviewApiService } from '../api/weekly-review-api.service';
import { AuthService } from '../auth/auth.service';
import { BRANDING } from '../config/branding';
import { QUALITY_RULES } from '../config/quality';
import {
  AsinCheckResult,
  HuntingCriteria,
  Product,
  ProductCreatePayload,
  ProductDuplicateInfo,
  ProductQualityLabel,
  WeeklyReviewStatus,
} from '../models/product.models';
import { ReferenceDataService } from '../state/reference-data.service';
import { WorkspaceSyncService } from '../state/workspace-sync.service';
import { ToastService } from '../ui/toast.service';
import { ValidationMessageService } from '../ui/validation-message.service';
import {
  createProductSubmissionForm,
  createSubmissionAsinControl,
  SubmissionControlName,
  SubmissionFieldState,
} from '../../shared/forms/product-submission.form';
import { integerValidator } from '../../shared/validators/integer.validator';
import { decimalMinValidator, decimalValidator, decimalValue } from '../../shared/validators/price.validator';

type SummaryTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface SubmissionModalState {
  product: Product;
  qualityLabel: ProductQualityLabel;
  shortReason: string;
  nextAction: string;
}

const SUBMISSION_FIELDS: readonly SubmissionControlName[] = [
  'title',
  'amazonUrl',
  'amazonAltUrl',
  'ebayUrl',
  'customLabel',
  'amazonStockCount',
  'alternateAmazonStockCount',
  'soldCount',
  'rating',
  'productWatchers',
  'salesLastTwoMonths',
  'basketCount',
  'deliveryDays',
  'monthlyGraphUptrend',
  'amazonPrice',
  'ebayPrice',
];

@Injectable()
export class HunterFacade {
  readonly saving = signal(false);
  readonly attemptedSubmit = signal(false);
  readonly error = signal('');
  readonly criteriaLoading = signal(false);
  readonly asinChecking = signal(false);
  readonly asinVerified = signal(false);
  readonly asinDuplicate = signal<ProductDuplicateInfo | null>(null);
  readonly weeklyReviewLoading = signal(false);
  readonly weeklyReviewStatus = signal<WeeklyReviewStatus | null>(null);
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
    basketCountRequired: false,
    deliveryDaysRequired: false,
    maxDeliveryDays: 7,
    monthlyGraphRequired: false,
  });

  readonly asinControl = createSubmissionAsinControl();
  readonly form = createProductSubmissionForm();
  readonly qualityRules = QUALITY_RULES;

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthService);
  private readonly formVersion = signal(0);
  private initialized = false;

  readonly defaultCustomLabel = computed(() => this.auth.currentUser()?.name || `${BRANDING.logoLabel} Hunter`);
  readonly asinTouched = computed(() => this.asinControl.touched || this.attemptedSubmit());
  readonly asinMessage = computed(() => this.messages.asinError(this.asinControl, this.asinTouched()));

  readonly fieldStates = computed<Record<SubmissionControlName, SubmissionFieldState>>(() => {
    this.formVersion();
    const criteria = this.criteria();

    return Object.fromEntries(
      SUBMISSION_FIELDS.map((field) => {
        const control = this.form.controls[field];
        const touched = control.touched || this.attemptedSubmit();

        return [
          field,
          {
            error: this.messages.submissionFieldError(control, field, criteria, touched),
            helper: this.messages.submissionHelper(field, criteria),
          },
        ];
      }),
    ) as Record<SubmissionControlName, SubmissionFieldState>;
  });

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

  readonly coreFieldIssues = computed(() =>
    [
      this.fieldStates().title.error,
      this.fieldStates().amazonUrl.error,
      this.fieldStates().amazonAltUrl.error,
      this.fieldStates().ebayUrl.error,
      this.criteria().customLabelRequired ? this.fieldStates().customLabel.error : '',
    ].filter(Boolean),
  );

  readonly stockFieldIssues = computed(() =>
    [
      this.fieldStates().amazonStockCount.error,
      this.fieldStates().alternateAmazonStockCount.error,
      this.fieldStates().soldCount.error,
      this.fieldStates().rating.error,
      this.fieldStates().productWatchers.error,
      this.fieldStates().salesLastTwoMonths.error,
      this.fieldStates().basketCount.error,
      this.fieldStates().deliveryDays.error,
      this.fieldStates().monthlyGraphUptrend.error,
    ].filter(Boolean),
  );

  readonly pricingFieldIssues = computed(() =>
    [this.fieldStates().amazonPrice.error, this.fieldStates().ebayPrice.error].filter(Boolean),
  );

  readonly stockSalesRuleFailures = computed(() => {
    this.formVersion();
    const failures: string[] = [];
    const criteria = this.criteria();

    if (
      this.form.controls.amazonStockCount.valid &&
      this.form.controls.amazonStockCount.value !== null &&
      this.form.controls.amazonStockCount.value < criteria.minStockCount
    ) {
      failures.push(`Amazon stock must be at least ${criteria.minStockCount}.`);
    }

    if (
      this.form.controls.alternateAmazonStockCount.valid &&
      this.form.controls.alternateAmazonStockCount.value !== null &&
      this.form.controls.alternateAmazonStockCount.value < criteria.minAlternateStockCount
    ) {
      failures.push(`Alternate Amazon stock must be at least ${criteria.minAlternateStockCount}.`);
    }

    if (
      this.form.controls.soldCount.valid &&
      this.form.controls.soldCount.value !== null &&
      this.form.controls.soldCount.value < criteria.minSoldCount
    ) {
      failures.push(`Sold count must be at least ${criteria.minSoldCount}.`);
    }

    if (
      this.form.controls.rating.valid &&
      this.form.controls.rating.value !== null &&
      this.form.controls.rating.value < criteria.minRating
    ) {
      failures.push(`Rating must be at least ${criteria.minRating}.`);
    }

    if (
      this.form.controls.productWatchers.valid &&
      this.form.controls.productWatchers.value !== null &&
      this.form.controls.productWatchers.value < criteria.minWatcherCount
    ) {
      failures.push(`Watchers must be at least ${criteria.minWatcherCount}.`);
    }

    if (
      this.form.controls.salesLastTwoMonths.valid &&
      this.form.controls.salesLastTwoMonths.value !== null &&
      this.form.controls.salesLastTwoMonths.value < criteria.minSalesLastTwoMonths
    ) {
      failures.push(`Sales in the past 2 months must be at least ${criteria.minSalesLastTwoMonths}.`);
    }

    if (criteria.basketCountRequired && this.form.controls.basketCount.value === null) {
      failures.push('Basket count is required.');
    }

    if (
      this.form.controls.deliveryDays.valid &&
      this.form.controls.deliveryDays.value !== null &&
      this.form.controls.deliveryDays.value > criteria.maxDeliveryDays
    ) {
      failures.push(`Delivery days must be ${criteria.maxDeliveryDays} or less.`);
    }

    if (criteria.deliveryDaysRequired && this.form.controls.deliveryDays.value === null) {
      failures.push('Delivery days are required.');
    }

    if (criteria.monthlyGraphRequired && this.form.controls.monthlyGraphUptrend.value !== true) {
      failures.push('One month graph must show an up-price trend.');
    }

    return failures;
  });

  readonly economicsRuleFailures = computed(() => {
    this.formVersion();

    if (this.pricingFieldIssues().length || this.economics().profit === null || this.economics().roi === null) {
      return [];
    }

    const failures: string[] = [];

    if ((this.economics().profit ?? 0) < this.criteria().minProfit) {
      failures.push(`Profit must be at least ${this.criteria().minProfit.toFixed(2)}.`);
    }

    if ((this.economics().roi ?? 0) < this.criteria().minRoi) {
      failures.push(`ROI must be at least ${this.criteria().minRoi}%.`);
    }

    return failures;
  });

  readonly validationReasons = computed(() => [
    ...this.stockSalesRuleFailures(),
    ...this.economicsRuleFailures(),
  ]);

  readonly qualityPreview = computed<ProductQualityLabel | null>(() => {
    if (
      !this.asinVerified() ||
      this.asinDuplicate() ||
      this.coreFieldIssues().length ||
      this.stockFieldIssues().length ||
      this.pricingFieldIssues().length
    ) {
      return null;
    }

    if (this.validationReasons().length) {
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
        message: `A matching product already exists with status ${this.asinDuplicate()?.status}.`,
      };
    }

    if (!this.asinVerified()) {
      return {
        tone: 'warning' as SummaryTone,
        label: 'ASIN check required',
        message: 'Verify the ASIN before entering the full product details.',
      };
    }

    if (this.coreFieldIssues().length) {
      return {
        tone: 'warning' as SummaryTone,
        label: 'Finish required fields',
        message: this.coreFieldIssues()[0],
      };
    }

    if (this.stockFieldIssues().length || this.pricingFieldIssues().length) {
      return {
        tone: 'warning' as SummaryTone,
        label: 'Finish validation inputs',
        message: this.stockFieldIssues()[0] || this.pricingFieldIssues()[0] || 'Complete the remaining required inputs.',
      };
    }

    if (this.validationReasons().length) {
      return {
        tone: 'danger' as SummaryTone,
        label: 'System Rejected',
        message: this.validationReasons()[0],
      };
    }

    if (this.qualityPreview()) {
      return {
        tone: 'success' as SummaryTone,
        label: 'System Approved',
        message: 'Current values satisfy the active validation rules.',
      };
    }

    return {
      tone: 'warning' as SummaryTone,
      label: 'Keep filling',
      message: 'Complete the required fields to finish the system check.',
    };
  });

  readonly validationItems = computed(() => [
    {
      label: 'ASIN verified',
      passed: this.asinVerified() && !this.asinDuplicate(),
      detail: this.asinDuplicate()
        ? `Already exists with status ${this.asinDuplicate()?.status}.`
        : this.asinVerified()
          ? this.asinControl.value
          : 'Verify before submission',
    },
    {
      label: 'Required fields',
      passed: this.coreFieldIssues().length === 0,
      detail: this.coreFieldIssues()[0] || 'Core product and marketplace fields are ready.',
    },
    {
      label: 'Stock and sales rules',
      passed: this.stockFieldIssues().length === 0 && this.stockSalesRuleFailures().length === 0,
      detail:
        this.stockFieldIssues()[0] ||
        this.stockSalesRuleFailures()[0] ||
        'Within the current admin thresholds.',
    },
    {
      label: 'Basket and delivery',
      passed:
        !this.fieldStates().basketCount.error &&
        !this.fieldStates().deliveryDays.error &&
        !this.fieldStates().monthlyGraphUptrend.error &&
        !this.stockSalesRuleFailures().some((reason) =>
          ['Basket count', 'Delivery days', 'graph'].some((token) => reason.includes(token)),
        ),
      detail:
        this.fieldStates().basketCount.error ||
        this.fieldStates().deliveryDays.error ||
        this.fieldStates().monthlyGraphUptrend.error ||
        this.stockSalesRuleFailures().find((reason) =>
          ['Basket count', 'Delivery days', 'graph'].some((token) => reason.includes(token)),
        ) ||
        'Additional delivery and graph signals are ready.',
    },
    {
      label: 'Economics check',
      passed:
        this.pricingFieldIssues().length === 0 &&
        this.economicsRuleFailures().length === 0 &&
        this.economics().profit !== null,
      detail:
        this.pricingFieldIssues()[0] ||
        this.economicsRuleFailures()[0] ||
        (this.economics().profit === null
          ? 'Enter prices to calculate profit and ROI.'
          : `${this.economics().profit?.toFixed(2)} profit / ${this.economics().roi?.toFixed(2)}% ROI`),
    },
    {
      label: 'Quality label',
      passed: this.qualityPreview() !== 'Rejected' && this.qualityPreview() !== null,
      detail:
        this.qualityPreview() === 'Rejected'
          ? this.validationReasons()[0] || 'One or more rule checks failed.'
          : this.qualityPreview() || 'Complete the form to grade hunting quality.',
    },
  ]);

  readonly canSubmit = computed(() => {
    this.formVersion();
    return (
      !(this.weeklyReviewStatus()?.required) &&
      this.asinVerified() &&
      !this.asinDuplicate() &&
      !this.saving() &&
      !this.criteriaLoading() &&
      this.form.controls.title.valid &&
      this.form.controls.amazonUrl.valid &&
      this.form.controls.amazonAltUrl.valid &&
      this.form.controls.ebayUrl.valid &&
      this.form.controls.customLabel.valid &&
      this.form.controls.amazonStockCount.valid &&
      this.form.controls.alternateAmazonStockCount.valid &&
      this.form.controls.soldCount.valid &&
      this.form.controls.rating.valid &&
      this.form.controls.productWatchers.valid &&
      this.form.controls.salesLastTwoMonths.valid &&
      this.form.controls.basketCount.valid &&
      this.form.controls.deliveryDays.valid &&
      this.form.controls.monthlyGraphUptrend.valid &&
      this.form.controls.amazonPrice.valid &&
      this.form.controls.ebayPrice.valid
    );
  });

  constructor(
    private readonly productsApi: HunterApiService,
    private readonly weeklyReviewApi: WeeklyReviewApiService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly toast: ToastService,
    private readonly messages: ValidationMessageService,
  ) {
    this.initialize();
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

    this.productsApi
      .checkAsin(this.asinControl.value)
      .pipe(finalize(() => this.asinChecking.set(false)))
      .subscribe({
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

    const raw = this.form.getRawValue();
    const payload: ProductCreatePayload = {
      title: raw.title,
      amazonUrl: raw.amazonUrl,
      amazonAltUrl: raw.amazonAltUrl || null,
      ebayUrl: raw.ebayUrl,
      customLabel: raw.customLabel || null,
      asin: this.asinControl.value,
      amazonStockCount: raw.amazonStockCount ?? 0,
      alternateAmazonStockCount: raw.alternateAmazonStockCount ?? null,
      soldCount: raw.soldCount ?? 0,
      rating: raw.rating ?? 0,
      productWatchers: raw.productWatchers ?? null,
      salesLastTwoMonths: raw.salesLastTwoMonths ?? 0,
      basketCount: raw.basketCount ?? null,
      amazonPrice: decimalValue(raw.amazonPrice),
      ebayPrice: decimalValue(raw.ebayPrice),
      deliveryDays: raw.deliveryDays ?? null,
      monthlyGraphUptrend: raw.monthlyGraphUptrend ?? null,
    };

    this.productsApi
      .createProduct(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (product) => {
          this.lastSubmitted.set(product);
          this.submissionModal.set({
            product,
            qualityLabel:
              (product.qualityLabel as ProductQualityLabel) || this.qualityPreview() || 'Average Hunting',
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

  private initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
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
    this.weeklyReviewLoading.set(true);
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

    this.weeklyReviewApi
      .getStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.weeklyReviewStatus.set(status);
          this.weeklyReviewLoading.set(false);
        },
        error: () => this.weeklyReviewLoading.set(false),
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

  private applyCriteriaValidators(criteria: HuntingCriteria): void {
    this.form.controls.customLabel.setValidators(criteria.customLabelRequired ? [Validators.required] : []);
    this.form.controls.amazonStockCount.setValidators([Validators.required, integerValidator]);
    this.form.controls.alternateAmazonStockCount.setValidators([integerValidator]);
    this.form.controls.soldCount.setValidators([Validators.required, integerValidator]);
    this.form.controls.rating.setValidators([Validators.required]);
    this.form.controls.productWatchers.setValidators([
      ...(criteria.watchersRequired ? [Validators.required] : []),
      integerValidator,
    ]);
    this.form.controls.salesLastTwoMonths.setValidators([Validators.required, integerValidator]);
    this.form.controls.basketCount.setValidators([
      ...(criteria.basketCountRequired ? [Validators.required] : []),
      integerValidator,
    ]);
    this.form.controls.deliveryDays.setValidators([
      ...(criteria.deliveryDaysRequired ? [Validators.required] : []),
      integerValidator,
      Validators.max(criteria.maxDeliveryDays),
    ]);
    this.form.controls.monthlyGraphUptrend.setValidators(criteria.monthlyGraphRequired ? [Validators.requiredTrue] : []);
    this.form.controls.amazonPrice.setValidators([Validators.required, decimalValidator, decimalMinValidator(0.01)]);
    this.form.controls.ebayPrice.setValidators([Validators.required, decimalValidator, decimalMinValidator(0.01)]);

    Object.values(this.form.controls).forEach((control) =>
      control.updateValueAndValidity({ emitEvent: false }),
    );
    this.form.updateValueAndValidity({ emitEvent: false });
    this.formVersion.update((value) => value + 1);
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
        basketCount: null,
        deliveryDays: null,
        monthlyGraphUptrend: null,
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
