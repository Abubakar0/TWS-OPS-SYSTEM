import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

import { HuntingCriteria, Product, ProductCreatePayload } from '../../core/models/product.models';
import { ProductService } from '../../core/services/product.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ToastService } from '../../core/ui/toast.service';

type SubmissionControlName =
  | 'title'
  | 'asin'
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

const integerValidator: ValidatorFn = (control) => {
  if (control.value === null || control.value === undefined || control.value === '') {
    return null;
  }

  return Number.isInteger(Number(control.value)) ? null : { integer: true };
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
  const amazonPrice = group.get('amazonPrice')?.value as number | null;
  const ebayPrice = group.get('ebayPrice')?.value as number | null;

  if (amazonPrice === null || ebayPrice === null || amazonPrice <= 0 || ebayPrice <= 0) {
    return { economicsMissing: true };
  }

  const criteria = getCriteria();
  const fees = Number(((ebayPrice * criteria.feePercent) / 100).toFixed(2));
  const profit = Number((ebayPrice - amazonPrice - fees).toFixed(2));
  const roi = Number(((profit / amazonPrice) * 100).toFixed(2));
  const errors: ValidationErrors = {};

  if (!Number.isFinite(profit)) {
    errors['economicsMissing'] = true;
  }

  if (profit < criteria.minProfit) {
    errors['profitBelowMin'] = true;
  }

  if (!Number.isFinite(roi) || roi < criteria.minRoi) {
    errors['roiBelowMin'] = true;
  }

  return Object.keys(errors).length > 0 ? errors : null;
};

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
  ],
  templateUrl: './hunter-submission.component.html',
  styleUrl: './hunter-submission.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterSubmissionComponent implements OnInit {
  readonly saving = signal(false);
  readonly attemptedSubmit = signal(false);
  readonly error = signal('');
  readonly lastSubmitted = signal<Product | null>(null);
  readonly criteriaLoading = signal(false);
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
  readonly formVersion = signal(0);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    asin: new FormControl('', { nonNullable: true }),
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
    amazonPrice: new FormControl<number | null>(null),
    ebayPrice: new FormControl<number | null>(null),
  });

  readonly economics = computed(() => {
    this.formVersion();
    const { amazonPrice, ebayPrice } = this.form.getRawValue();

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

  constructor(
    private readonly productsApi: ProductService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.form.setValidators(economicsValidator(() => this.criteria()));
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formVersion.update((value) => value + 1));

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

  controlError(name: SubmissionControlName): string {
    const control = this.form.controls[name];

    if (!this.shouldShowControlError(control)) {
      return '';
    }

    if (control.hasError('required')) {
      switch (name) {
        case 'title':
          return 'Product title is required.';
        case 'asin':
          return 'ASIN is required by the current admin settings.';
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
      return 'Whole numbers only. Decimals are not allowed here.';
    }

    if (control.hasError('min')) {
      switch (name) {
        case 'amazonStockCount':
          return `Amazon stock count must be at least ${this.criteria().minStockCount}.`;
        case 'alternateAmazonStockCount':
          return `Alternate Amazon stock count must be at least ${this.criteria().minAlternateStockCount}.`;
        case 'soldCount':
          return `Sold count must be at least ${this.criteria().minSoldCount}.`;
        case 'rating':
          return `Rating must be at least ${this.criteria().minRating}.`;
        case 'productWatchers':
          return `Product watchers must be at least ${this.criteria().minWatcherCount}.`;
        case 'salesLastTwoMonths':
          return `Sales in the past two months must be at least ${this.criteria().minSalesLastTwoMonths}.`;
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
      case 'asin':
        return this.criteria().asinRequired ? 'Required by the current admin settings.' : 'Optional right now.';
      case 'customLabel':
        return this.criteria().customLabelRequired
          ? 'Required by the current admin settings.'
          : 'Optional based on the current business rules.';
      case 'amazonStockCount':
        return `Minimum allowed stock is ${this.criteria().minStockCount}.`;
      case 'alternateAmazonStockCount':
        return `Optional. Minimum when provided is ${this.criteria().minAlternateStockCount}.`;
      case 'soldCount':
        return `Whole number only. Minimum allowed is ${this.criteria().minSoldCount}.`;
      case 'rating':
        return `Minimum rating is ${this.criteria().minRating}.`;
      case 'productWatchers':
        return this.criteria().watchersRequired
          ? `Required. Minimum watcher count is ${this.criteria().minWatcherCount}.`
          : `Optional. Minimum when provided is ${this.criteria().minWatcherCount}.`;
      case 'salesLastTwoMonths':
        return `Minimum allowed is ${this.criteria().minSalesLastTwoMonths}.`;
      default:
        return '';
    }
  }

  submit(): void {
    this.attemptedSubmit.set(true);

    if (this.form.invalid || this.saving() || this.criteriaLoading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.productsApi.createProduct(this.form.getRawValue() as ProductCreatePayload).subscribe({
      next: (product) => {
        this.lastSubmitted.set(product);
        this.resetForm();
        this.toast.success('Product submitted.');
        this.workspaceSync.notifyProductsChanged();
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not submit product.'),
      complete: () => this.saving.set(false),
    });
  }

  private shouldShowControlError(control: AbstractControl | null): boolean {
    return Boolean(control && (control.touched || this.attemptedSubmit()));
  }

  private applyCriteriaValidators(criteria: HuntingCriteria): void {
    this.form.controls.asin.setValidators(criteria.asinRequired ? [Validators.required] : []);
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
    this.form.controls.amazonPrice.setValidators([Validators.required, Validators.min(0.01)]);
    this.form.controls.ebayPrice.setValidators([Validators.required, Validators.min(0.01)]);

    Object.values(this.form.controls).forEach((control) =>
      control.updateValueAndValidity({ emitEvent: false }),
    );
    this.form.updateValueAndValidity({ emitEvent: false });
  }

  private resetForm(): void {
    this.form.reset({
      title: '',
      asin: '',
      amazonUrl: '',
      amazonAltUrl: '',
      ebayUrl: '',
      customLabel: '',
      amazonStockCount: null,
      alternateAmazonStockCount: null,
      soldCount: null,
      rating: null,
      productWatchers: null,
      salesLastTwoMonths: null,
      amazonPrice: null,
      ebayPrice: null,
    });
    this.attemptedSubmit.set(false);
    this.applyCriteriaValidators(this.criteria());
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}
