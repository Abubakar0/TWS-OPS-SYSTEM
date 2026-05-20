import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  FormRecord,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

import { ExportService } from '../../core/services/export.service';
import { AdminService } from '../../core/services/admin.service';
import { ProductService } from '../../core/services/product.service';
import { Account, AssignedHunter, Product, ProductFilters, ProductStatus } from '../../core/models/product.models';

const ebayUrlValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = String(control.value || '').trim();

  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase().includes('ebay.') ? null : { ebayUrl: true };
  } catch (error) {
    return { ebayUrl: true };
  }
};

@Component({
  selector: 'app-lister-products',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './lister-products.component.html',
  styleUrl: './lister-products.component.scss',
})
export class ListerProductsComponent implements OnInit, OnDestroy {
  readonly hunters = signal<AssignedHunter[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedHunterId = signal('');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly copied = signal('');
  readonly error = signal('');
  readonly attemptedBulkSubmit = signal(false);
  readonly rejectingId = signal('');

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    status: new FormControl<ProductStatus | ''>('assigned', { nonNullable: true }),
    accountId: new FormControl('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  readonly bulkForm = new FormGroup({
    accountId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly listingLinkControls = new FormRecord<FormControl<string>>({});
  readonly rejectionReasonControls = new FormRecord<FormControl<string>>({});

  readonly totalCount = computed(() => this.products().length);
  readonly readyCount = computed(
    () => this.products().filter((product) => product.status === 'approved' || product.status === 'assigned').length,
  );
  readonly listedCount = computed(() => this.products().filter((product) => product.status === 'listed').length);
  readonly rejectedCount = computed(() => this.products().filter((product) => product.status === 'rejected').length);
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly selectableIds = computed(() =>
    this.products()
      .filter((product) => this.canMarkListed(product))
      .map((product) => product.id),
  );
  readonly allSelectableSelected = computed(
    () =>
      this.selectableIds().length > 0 &&
      this.selectableIds().every((productId) => this.selectedIds().has(productId)),
  );
  readonly canMarkSelectedListed = computed(() => {
    const selectedIds = [...this.selectedIds()];

    if (!selectedIds.length || this.bulkForm.invalid || this.saving()) {
      return false;
    }

    return selectedIds.every((productId) => {
      const control = this.listingLinkControl(productId);
      return Boolean(control.value.trim() && control.valid);
    });
  });

  private readonly destroyRef = inject(DestroyRef);
  private productsSubscription?: Subscription;

  constructor(
    private readonly productsApi: ProductService,
    private readonly adminApi: AdminService,
    private readonly exportService: ExportService,
  ) {}

  ngOnInit(): void {
    this.filters.controls.search.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadProducts());

    this.loadInitial();
  }

  ngOnDestroy(): void {
    this.productsSubscription?.unsubscribe();
  }

  loadInitial(): void {
    this.error.set('');

    this.productsApi.listAssignedHunters().subscribe({
      next: (hunters) => {
        this.hunters.set(hunters);

        if (!this.selectedHunterId() && hunters[0]) {
          this.selectHunter(hunters[0].id);
        }
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not load assigned hunters.'),
    });

    this.adminApi.listAccounts().subscribe({
      next: (accounts) => this.accounts.set(accounts),
      error: (error) => this.error.set(error?.error?.message || 'Could not load accounts.'),
    });
  }

  selectHunter(hunterId: string): void {
    this.selectedHunterId.set(hunterId);
    this.selectedIds.set(new Set());
    this.attemptedBulkSubmit.set(false);
    this.loadProducts();
  }

  applyFilters(): void {
    this.loadProducts();
  }

  resetFilters(): void {
    this.filters.reset(
      {
        search: '',
        status: 'assigned',
        accountId: '',
        from: '',
        to: '',
      },
      { emitEvent: false },
    );

    this.selectedIds.set(new Set());
    this.attemptedBulkSubmit.set(false);
    this.loadProducts();
  }

  exportProducts(): void {
    const hunterName = this.hunters().find((hunter) => hunter.id === this.selectedHunterId())?.name || 'hunter';
    const dateStamp = new Date().toISOString().slice(0, 10);

    this.exportService.exportAsExcelTable({
      filename: `lister-products-${hunterName.replaceAll(/\s+/g, '-').toLowerCase()}-${dateStamp}.xls`,
      sheetName: 'Lister Products',
      rows: this.products(),
      columns: [
        { header: 'Hunter', value: (product) => product.hunterName },
        { header: 'Title', value: (product) => product.title || '' },
        { header: 'ASIN', value: (product) => product.asin || '' },
        { header: 'Custom Label', value: (product) => product.customLabel || '' },
        { header: 'Status', value: (product) => product.status },
        { header: 'Amazon Link', value: (product) => product.amazonUrl },
        { header: 'Amazon Alternate Link', value: (product) => product.amazonAltUrl || '' },
        { header: 'eBay Source Link', value: (product) => product.ebayUrl },
        { header: 'Listed eBay Link', value: (product) => product.listingUrl || this.listingLinkControl(product.id)?.value || '' },
        { header: 'Amazon Price', value: (product) => product.amazonPrice ?? '' },
        { header: 'eBay Price', value: (product) => product.ebayPrice ?? '' },
        { header: 'Profit', value: (product) => product.profit },
        { header: 'ROI', value: (product) => product.roi },
        { header: 'Sold Count', value: (product) => product.soldCount },
        { header: 'Stock Count', value: (product) => product.amazonStockCount ?? '' },
        { header: 'Account', value: (product) => product.accountName || '' },
        { header: 'Rejection Reason', value: (product) => product.rejectionReason || '' },
        { header: 'Submitted At', value: (product) => product.createdAt },
        { header: 'Listed At', value: (product) => product.listedAt || '' },
      ],
    });
  }

  loadProducts(): void {
    if (!this.selectedHunterId()) {
      this.products.set([]);
      return;
    }

    this.productsSubscription?.unsubscribe();
    this.loading.set(true);
    this.error.set('');

    this.productsSubscription = this.productsApi
      .listProducts({
        ...this.buildFilters(),
        hunterId: this.selectedHunterId(),
      })
      .subscribe({
        next: (products) => {
          this.products.set(products);
          this.syncRowControls(products);
          this.pruneSelection(products);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load products.');
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
  }

  isSelected(productId: string): boolean {
    return this.selectedIds().has(productId);
  }

  toggleSelection(product: Product, checked: boolean): void {
    if (!this.canMarkListed(product)) {
      return;
    }

    const next = new Set(this.selectedIds());
    checked ? next.add(product.id) : next.delete(product.id);
    this.selectedIds.set(next);
  }

  toggleAll(checked: boolean): void {
    this.selectedIds.set(checked ? new Set(this.selectableIds()) : new Set());
  }

  canMarkListed(product: Product): boolean {
    return product.status === 'approved' || product.status === 'assigned';
  }

  canReject(product: Product): boolean {
    return product.status === 'approved' || product.status === 'assigned';
  }

  copy(value: string | null | undefined, label: string): void {
    if (!value) {
      return;
    }

    navigator.clipboard?.writeText(value);
    this.copied.set(label);
    window.setTimeout(() => this.copied.set(''), 1400);
  }

  openLink(url: string | null | undefined): void {
    if (!url) {
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  listingLinkControl(productId: string): FormControl<string> {
    const existing = this.listingLinkControls.get(productId) as FormControl<string> | null;

    if (existing) {
      return existing;
    }

    const created = new FormControl('', {
      nonNullable: true,
      validators: [ebayUrlValidator],
    });

    this.listingLinkControls.addControl(productId, created);
    return created;
  }

  rejectionReasonControl(productId: string): FormControl<string> {
    const existing = this.rejectionReasonControls.get(productId) as FormControl<string> | null;

    if (existing) {
      return existing;
    }

    const created = new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    });

    this.rejectionReasonControls.addControl(productId, created);
    return created;
  }

  listingLinkError(productId: string): string {
    const control = this.listingLinkControl(productId);

    if (!control.value.trim()) {
      return 'Listed eBay link is required for selected products.';
    }

    if (control.hasError('ebayUrl')) {
      return 'Enter a valid eBay URL.';
    }

    return '';
  }

  showListingLinkError(productId: string): boolean {
    const control = this.listingLinkControl(productId);

    return this.isSelected(productId) && (control.touched || this.attemptedBulkSubmit()) && !control.valid;
  }

  rejectionReasonError(productId: string): string {
    const control = this.rejectionReasonControl(productId);

    if (control.hasError('required')) {
      return 'Rejection reason is required.';
    }

    if (control.hasError('minlength')) {
      return 'Rejection reason should be at least 3 characters.';
    }

    return '';
  }

  markSelectedListed(): void {
    this.attemptedBulkSubmit.set(true);

    if (!this.canMarkSelectedListed()) {
      this.bulkForm.markAllAsTouched();

      for (const productId of this.selectedIds()) {
        this.listingLinkControl(productId)?.markAsTouched();
      }

      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.productsApi
      .markBulkListed({
        accountId: this.bulkForm.getRawValue().accountId,
        items: [...this.selectedIds()].map((productId) => ({
          id: productId,
          listingUrl: this.listingLinkControl(productId)?.value.trim() || '',
        })),
      })
      .subscribe({
        next: () => {
          this.selectedIds.set(new Set());
          this.attemptedBulkSubmit.set(false);
          this.loadProducts();
          this.loadInitial();
        },
        error: (error) => this.error.set(error?.error?.message || 'Could not mark products as listed.'),
        complete: () => this.saving.set(false),
      });
  }

  rejectProduct(product: Product): void {
    const control = this.rejectionReasonControl(product.id);

    if (control.invalid || !this.canReject(product) || this.saving()) {
      control.markAsTouched();
      return;
    }

    this.rejectingId.set(product.id);
    this.error.set('');

    this.productsApi.rejectProduct(product.id, control.value.trim()).subscribe({
      next: () => {
        control.reset('', { emitEvent: false });
        const next = new Set(this.selectedIds());
        next.delete(product.id);
        this.selectedIds.set(next);
        this.loadProducts();
        this.loadInitial();
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not reject product.');
        this.rejectingId.set('');
      },
      complete: () => this.rejectingId.set(''),
    });
  }

  private buildFilters(): ProductFilters {
    const raw = this.filters.getRawValue();

    return {
      search: raw.search.trim() || undefined,
      status: raw.status || undefined,
      accountId: raw.accountId || undefined,
      from: raw.from || undefined,
      to: raw.to || undefined,
    };
  }

  private syncRowControls(products: Product[]): void {
    const productIds = new Set(products.map((product) => product.id));

    for (const product of products) {
      const listingControl = this.listingLinkControl(product.id);

      if (!listingControl) {
        this.listingLinkControls.addControl(
          product.id,
          new FormControl(product.listingUrl || '', {
            nonNullable: true,
            validators: [ebayUrlValidator],
          }),
        );
      } else if (!listingControl.dirty && product.listingUrl && !listingControl.value) {
        listingControl.setValue(product.listingUrl, { emitEvent: false });
      }

      const rejectionControl = this.rejectionReasonControl(product.id);

      if (!rejectionControl) {
        this.rejectionReasonControls.addControl(
          product.id,
          new FormControl(product.rejectionReason || '', {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(3)],
          }),
        );
      } else if (!rejectionControl.dirty && product.status === 'rejected') {
        rejectionControl.setValue(product.rejectionReason || '', { emitEvent: false });
      }
    }

    for (const controlKey of Object.keys(this.listingLinkControls.controls)) {
      if (!productIds.has(controlKey)) {
        this.listingLinkControls.removeControl(controlKey);
      }
    }

    for (const controlKey of Object.keys(this.rejectionReasonControls.controls)) {
      if (!productIds.has(controlKey)) {
        this.rejectionReasonControls.removeControl(controlKey);
      }
    }
  }

  private pruneSelection(products: Product[]): void {
    const validIds = new Set(products.filter((product) => this.canMarkListed(product)).map((product) => product.id));
    const next = new Set([...this.selectedIds()].filter((productId) => validIds.has(productId)));
    this.selectedIds.set(next);
  }
}
