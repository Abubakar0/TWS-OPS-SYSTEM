import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, effect, inject, signal } from '@angular/core';
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
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, catchError, debounceTime, distinctUntilChanged, finalize, of, switchMap } from 'rxjs';

import { ExportService } from '../../core/services/export.service';
import { ProductService } from '../../core/services/product.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { Account, AssignedHunter, Product, ProductFilters, ProductStatus } from '../../core/models/product.models';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { GridSortState, clampPageIndex, paginateRecords, sortRecords } from '../../shared/grid/grid.utils';

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
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './lister-products.component.html',
  styleUrl: './lister-products.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListerProductsComponent implements OnInit {
  readonly pageSizeOptions = [10, 25, 50];
  readonly hunters = signal<AssignedHunter[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedHunterId = signal('');
  readonly currentProductId = signal('');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly sortState = signal<GridSortState>({ active: 'createdAt', direction: 'desc' });
  readonly pageIndex = signal(0);
  readonly pageSize = signal(this.pageSizeOptions[0]);
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
  readonly hasAssignedAccounts = computed(() => this.accounts().length > 0);
  readonly sortedProducts = computed(() =>
    sortRecords(this.products(), this.sortState(), (product, key) => {
      switch (key) {
        case 'title':
          return `${product.title || ''} ${product.asin || ''}`.trim().toLowerCase();
        case 'hunterName':
          return product.hunterName.toLowerCase();
        case 'profit':
          return product.profit;
        case 'status':
          return product.status;
        case 'listedAt':
          return product.listedAt ? new Date(product.listedAt).getTime() : 0;
        case 'createdAt':
          return new Date(product.createdAt).getTime();
        default:
          return '';
      }
    }),
  );
  readonly selectedProduct = computed(
    () => this.sortedProducts().find((product) => product.id === this.currentProductId()) || null,
  );
  readonly selectedQueueIndex = computed(() =>
    this.sortedProducts().findIndex((product) => product.id === this.currentProductId()),
  );
  readonly pagedProducts = computed(() => paginateRecords(this.sortedProducts(), this.pageIndex(), this.pageSize()));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.sortedProducts().length / this.pageSize())));
  readonly pageLabel = computed(() => {
    const total = this.sortedProducts().length;

    if (!total) {
      return 'No products to show';
    }

    const start = this.pageIndex() * this.pageSize() + 1;
    const end = Math.min(total, start + this.pageSize() - 1);
    return `Showing ${start}-${end} of ${total}`;
  });
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
    const accountId = this.bulkForm.controls.accountId.value.trim();

    if (!selectedIds.length || !accountId || this.saving()) {
      return false;
    }

    return selectedIds.every((productId) => {
      const control = this.listingLinkControl(productId);
      return Boolean(control.value.trim() && !control.hasError('ebayUrl'));
    });
  });
  readonly canMarkCurrentListed = computed(() => {
    const product = this.selectedProduct();
    const accountId = this.bulkForm.controls.accountId.value.trim();

    if (!product || !this.canMarkListed(product) || !accountId || this.saving()) {
      return false;
    }

    const control = this.listingLinkControl(product.id);
    return Boolean(control.value.trim() && !control.hasError('ebayUrl'));
  });
  readonly currentListingBlockingMessage = computed(() => {
    const product = this.selectedProduct();

    if (!product) {
      return 'Select a product to start listing.';
    }

    if (!this.hasAssignedAccounts()) {
      return 'No listing accounts are assigned to you yet.';
    }

    if (!this.canMarkListed(product)) {
      return product.status === 'listed' ? 'This product is already listed.' : 'This product cannot be listed from this queue.';
    }

    if (!this.bulkForm.controls.accountId.value.trim()) {
      return 'Choose a listing account to continue.';
    }

    const control = this.listingLinkControl(product.id);

    if (!control.value.trim()) {
      return 'Enter the listed eBay link to enable Mark as Listed.';
    }

    if (control.hasError('ebayUrl')) {
      return 'Enter a valid eBay URL for the listed product.';
    }

    return '';
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly reloadProducts$ = new Subject<void>();
  private accountsSubscribed = false;

  constructor(
    private readonly productsApi: ProductService,
    private readonly referenceData: ReferenceDataService,
    private readonly exportService: ExportService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.filters.controls.search.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadProducts());

    this.reloadProducts$
      .pipe(
        switchMap(() => {
          if (!this.selectedHunterId()) {
            this.products.set([]);
            return of<Product[]>([]);
          }

          this.loading.set(true);
          this.error.set('');

          return this.productsApi
            .listProducts({
              ...this.buildFilters(),
              hunterId: this.selectedHunterId(),
            })
            .pipe(
              catchError((error) => {
                this.error.set(error?.error?.message || 'Could not load products.');
                return of<Product[]>([]);
              }),
              finalize(() => this.loading.set(false)),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((products) => {
        this.products.set(products);
        this.syncRowControls(products);
        this.pruneSelection(products);
        this.syncCurrentProduct(products);
        this.pageIndex.set(clampPageIndex(products.length, this.pageSize(), this.pageIndex()));
      });

    this.loadInitial();

    effect(
      () => {
        const version = this.workspaceSync.productsVersion();

        if (version > 0 && this.selectedHunterId()) {
          this.loadProducts();
        }
      },
      { allowSignalWrites: true, injector: this.injector },
    );
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

    if (!this.accountsSubscribed) {
      this.accountsSubscribed = true;

      this.referenceData
        .getAccounts()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (accounts) => {
            this.accounts.set(accounts);
            this.syncAccountControls(accounts);
          },
          error: (error) => this.error.set(error?.error?.message || 'Could not load accounts.'),
        });
    }
  }

  selectHunter(hunterId: string): void {
    this.selectedHunterId.set(hunterId);
    this.currentProductId.set('');
    this.selectedIds.set(new Set());
    this.attemptedBulkSubmit.set(false);
    this.pageIndex.set(0);
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
    this.pageIndex.set(0);
    this.loadProducts();
  }

  exportProducts(): void {
    const hunterName = this.hunters().find((hunter) => hunter.id === this.selectedHunterId())?.name || 'hunter';
    const dateStamp = new Date().toISOString().slice(0, 10);

    this.exportService.exportAsExcelTable({
      filename: `lister-products-${hunterName.replaceAll(/\s+/g, '-').toLowerCase()}-${dateStamp}.xlsx`,
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
        { header: 'Listed eBay Link', value: (product) => product.listingUrl || this.listingLinkControl(product.id).value || '' },
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
    this.toast.success('Products exported.');
  }

  loadProducts(): void {
    this.reloadProducts$.next();
  }

  selectProduct(productId: string): void {
    this.currentProductId.set(productId);
  }

  goToPreviousProduct(): void {
    const currentIndex = this.selectedQueueIndex();

    if (currentIndex <= 0) {
      return;
    }

    this.currentProductId.set(this.sortedProducts()[currentIndex - 1]?.id || '');
  }

  goToNextProduct(): void {
    const currentIndex = this.selectedQueueIndex();

    if (currentIndex < 0 || currentIndex >= this.sortedProducts().length - 1) {
      return;
    }

    this.currentProductId.set(this.sortedProducts()[currentIndex + 1]?.id || '');
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
        this.listingLinkControl(productId).markAsTouched();
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
          listingUrl: this.listingLinkControl(productId).value.trim(),
        })),
      })
      .subscribe({
        next: () => {
          this.selectedIds.set(new Set());
          this.attemptedBulkSubmit.set(false);
          this.loadProducts();
          this.loadInitial();
          this.workspaceSync.notifyProductsChanged();
          this.toast.success('Products listed.');
        },
        error: (error) => this.error.set(error?.error?.message || 'Could not mark products as listed.'),
        complete: () => this.saving.set(false),
      });
  }

  markCurrentListed(): void {
    const product = this.selectedProduct();

    if (!product) {
      return;
    }

    this.selectedIds.set(new Set([product.id]));
    this.markSelectedListed();
  }

  async rejectProduct(product: Product): Promise<void> {
    const control = this.rejectionReasonControl(product.id);

    if (control.invalid || !this.canReject(product) || this.saving()) {
      control.markAsTouched();
      return;
    }

    const confirmed = await this.confirm.ask({
      title: 'Reject product?',
      message: 'This will send the product back to the hunter with the entered rejection reason.',
      confirmText: 'Reject',
      tone: 'danger',
    });

    if (!confirmed) {
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
        this.workspaceSync.notifyProductsChanged();
        this.toast.success('Product rejected.');
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not reject product.');
        this.rejectingId.set('');
      },
      complete: () => this.rejectingId.set(''),
    });
  }

  toggleSort(active: GridSortState['active']): void {
    const current = this.sortState();

    this.sortState.set({
      active,
      direction: current.active === active && current.direction === 'asc' ? 'desc' : 'asc',
    });
    this.pageIndex.set(0);
  }

  isSortedBy(active: GridSortState['active']): boolean {
    return this.sortState().active === active;
  }

  sortIcon(active: GridSortState['active']): string {
    const current = this.sortState();

    if (current.active !== active) {
      return 'unfold_more';
    }

    return current.direction === 'asc' ? 'north' : 'south';
  }

  setPageSize(value: string): void {
    this.pageSize.set(Number(value));
    this.pageIndex.set(0);
  }

  previousPage(): void {
    this.pageIndex.update((pageIndex) => Math.max(pageIndex - 1, 0));
  }

  nextPage(): void {
    this.pageIndex.update((pageIndex) => Math.min(pageIndex + 1, this.pageCount() - 1));
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

      if (!listingControl.dirty && product.listingUrl && !listingControl.value) {
        listingControl.setValue(product.listingUrl, { emitEvent: false });
      }

      const rejectionControl = this.rejectionReasonControl(product.id);

      if (!rejectionControl.dirty && product.status === 'rejected') {
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

  private syncCurrentProduct(products: Product[]): void {
    if (!products.length) {
      this.currentProductId.set('');
      return;
    }

    const existing = products.some((product) => product.id === this.currentProductId());

    if (existing) {
      return;
    }

    this.currentProductId.set(products[0]?.id || '');
  }

  private syncAccountControls(accounts: Account[]): void {
    const allowedIds = new Set(accounts.map((account) => account.id));

    if (this.filters.controls.accountId.value && !allowedIds.has(this.filters.controls.accountId.value)) {
      this.filters.controls.accountId.setValue('', { emitEvent: false });
    }

    if (this.bulkForm.controls.accountId.value && !allowedIds.has(this.bulkForm.controls.accountId.value)) {
      this.bulkForm.controls.accountId.setValue('', { emitEvent: false });
    }
  }
}
