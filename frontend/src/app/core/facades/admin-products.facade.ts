import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { ProductAdminApiService } from '../api/product-admin-api.service';
import { AuthService } from '../auth/auth.service';
import {
  Product,
  ProductCategory,
  ProductFilters,
  ProductQualityLabel,
  ProductStatus,
} from '../models/product.models';
import { ExportService } from '../services/export.service';
import { ReferenceDataService } from '../state/reference-data.service';
import { WorkspaceSyncService } from '../state/workspace-sync.service';
import { ToastService } from '../ui/toast.service';
import { userHasRole } from '../models/auth.models';

@Injectable()
export class AdminProductsFacade {
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly deleting = signal(false);
  readonly bulkEditing = signal(false);
  readonly error = signal('');
  readonly products = signal<Product[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(30);
  readonly selectedIds = signal<string[]>([]);
  readonly detailProduct = signal<Product | null>(null);
  readonly editModalOpen = signal(false);
  readonly rejectModalOpen = signal(false);
  readonly deleteModalOpen = signal(false);
  readonly deleteMode = signal<'soft' | 'permanent'>('soft');
  readonly bulkEditModalOpen = signal(false);
  readonly availableHunters = signal<Array<{ id: string; name: string }>>([]);
  readonly availableListers = signal<Array<{ id: string; name: string }>>([]);
  readonly availableAccounts = signal<Array<{ id: string; name: string }>>([]);
  readonly availableCategories = signal<ProductCategory[]>([]);
  readonly availableHunterOptions = computed(() => [
    { value: '', label: 'All hunters', description: 'Keep every hunter in scope.' },
    ...this.availableHunters().map((hunter) => ({ value: hunter.id, label: hunter.name })),
  ]);
  readonly availableListerOptions = computed(() => [
    { value: '', label: 'All listers', description: 'Keep every assigned lister in scope.' },
    ...this.availableListers().map((lister) => ({ value: lister.id, label: lister.name })),
  ]);
  readonly availableAccountOptions = computed(() => [
    { value: '', label: 'All accounts', description: 'Show products across every listing account.' },
    ...this.availableAccounts().map((account) => ({ value: account.id, label: account.name })),
  ]);
  readonly availableCategoryOptions = computed(() => [
    { value: '', label: 'All categories', description: 'Keep every category in the result set.' },
    ...this.availableCategories().map((category) => ({ value: category.name, label: category.name })),
  ]);
  readonly statusOptions = [
    { value: '', label: 'All statuses', description: 'Show approved, assigned, listed, and rejected products.' },
    { value: 'approved', label: 'Approved' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'listed', label: 'Listed' },
    { value: 'rejected', label: 'Rejected' },
  ] as const;
  readonly qualityFilterOptions = [
    { value: '', label: 'All quality', description: 'Show every quality band.' },
    { value: 'Best Hunt', label: 'Best Hunt' },
    { value: 'Good Hunt', label: 'Good Hunt' },
    { value: 'Avg Hunt', label: 'Avg Hunt' },
    { value: 'Rejected', label: 'Rejected' },
  ] as const;
  readonly deletedStateOptions = [
    { value: 'active', label: 'Active only' },
    { value: 'deleted', label: 'Deleted only' },
    { value: 'all', label: 'All products' },
  ] as const;

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    hunterId: new FormControl('', { nonNullable: true }),
    listerId: new FormControl('', { nonNullable: true }),
    accountId: new FormControl('', { nonNullable: true }),
    status: new FormControl<ProductStatus | ''>('', { nonNullable: true }),
    quality: new FormControl<ProductQualityLabel | ''>('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    deletedState: new FormControl<'active' | 'deleted' | 'all'>('active', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  readonly deleteForm = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
  });
  readonly rejectForm = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
  });
  readonly bulkEditForm = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    customLabel: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    amazonUrl: new FormControl('', { nonNullable: true }),
    ebayUrl: new FormControl('', { nonNullable: true }),
  });
  readonly editForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl('', { nonNullable: true }),
    customLabel: new FormControl('', { nonNullable: true }),
    amazonUrl: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    amazonAltUrl: new FormControl('', { nonNullable: true }),
    ebayUrl: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    amazonPrice: new FormControl<number | null>(null),
    ebayPrice: new FormControl<number | null>(null),
    amazonStockCount: new FormControl<number | null>(null),
    alternateAmazonStockCount: new FormControl<number | null>(null),
    soldCount: new FormControl<number | null>(null),
    rating: new FormControl<number | null>(null),
    productWatchers: new FormControl<number | null>(null),
    salesLastTwoMonths: new FormControl<number | null>(null),
    basketCount: new FormControl<number | null>(null),
    deliveryDays: new FormControl<number | null>(null),
    monthlyGraphUptrend: new FormControl(false, { nonNullable: true }),
  });

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly pageLabel = computed(() => {
    if (!this.total()) {
      return 'No products to show';
    }

    const start = this.pageIndex() * this.pageSize() + 1;
    const end = Math.min(this.total(), start + this.products().length - 1);
    return `Showing ${start}-${end} of ${this.total()}`;
  });
  readonly allSelected = computed(
    () => this.products().length > 0 && this.selectedIds().length === this.products().length,
  );
  readonly someSelected = computed(
    () => this.selectedIds().length > 0 && this.selectedIds().length < this.products().length,
  );
  readonly canRestore = computed(() => {
    const user = this.auth.currentUser();
    return Boolean(user && userHasRole(user, 'super_admin'));
  });
  readonly canBulkEdit = computed(() => {
    const user = this.auth.currentUser();
    return Boolean(user && userHasRole(user, 'super_admin'));
  });
  readonly canEditProducts = computed(() => {
    const user = this.auth.currentUser();
    return Boolean(user && (userHasRole(user, 'admin') || userHasRole(user, 'super_admin')));
  });
  readonly canRejectProducts = computed(() => {
    const user = this.auth.currentUser();
    return Boolean(user && (userHasRole(user, 'admin') || userHasRole(user, 'super_admin')));
  });
  readonly qualityOptions: ProductQualityLabel[] = [
    'Best Hunt',
    'Good Hunt',
    'Avg Hunt',
    'Rejected',
  ];

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly api: ProductAdminApiService,
    private readonly auth: AuthService,
    private readonly exportService: ExportService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly toast: ToastService,
  ) {
    this.referenceData
      .getUsers('hunter')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) =>
        this.availableHunters.set(users.map((user) => ({ id: user.id, name: user.name }))),
      );

    this.referenceData
      .getUsers('lister')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) =>
        this.availableListers.set(users.map((user) => ({ id: user.id, name: user.name }))),
      );

    this.referenceData
      .getAccounts(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((accounts) =>
        this.availableAccounts.set(
          accounts.map((account) => ({ id: account.id, name: account.name })),
        ),
      );

    this.referenceData
      .getProductCategories(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((categories) => this.availableCategories.set(categories));
  }

  loadProducts(): void {
    this.loading.set(true);
    this.error.set('');

    this.api.listProducts(this.buildFilters()).subscribe({
      next: (page) => {
        this.products.set(page.items);
        this.total.set(page.total);
        this.selectedIds.set([]);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load products.');
        this.loading.set(false);
      },
    });
  }

  applyFilters(): void {
    this.pageIndex.set(0);
    this.loadProducts();
  }

  resetFilters(): void {
    this.filters.reset(
      {
        search: '',
        hunterId: '',
        listerId: '',
        accountId: '',
        status: '',
        quality: '',
        category: '',
        deletedState: 'active',
        from: '',
        to: '',
      },
      { emitEvent: false },
    );
    this.pageIndex.set(0);
    this.loadProducts();
  }

  setPageSize(value: string | number): void {
    this.pageSize.set(Number(value));
    this.pageIndex.set(0);
    this.loadProducts();
  }

  previousPage(): void {
    this.pageIndex.update((value) => Math.max(0, value - 1));
    this.loadProducts();
  }

  nextPage(): void {
    this.pageIndex.update((value) => Math.min(this.pageCount() - 1, value + 1));
    this.loadProducts();
  }

  toggleSelection(id: string, checked: boolean): void {
    const next = new Set(this.selectedIds());

    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }

    this.selectedIds.set([...next]);
  }

  toggleSelectAll(checked: boolean): void {
    this.selectedIds.set(checked ? this.products().map((product) => product.id) : []);
  }

  openDetail(product: Product): void {
    this.detailProduct.set(product);
  }

  closeDetail(): void {
    this.detailProduct.set(null);
  }

  openEditModal(product: Product): void {
    if (!this.canEditProducts()) {
      return;
    }

    this.detailProduct.set(product);
    this.editForm.reset(
      {
        title: product.title || '',
        category: product.category || '',
        customLabel: product.customLabel || '',
        amazonUrl: product.amazonUrl,
        amazonAltUrl: product.amazonAltUrl || '',
        ebayUrl: product.ebayUrl,
        amazonPrice: product.amazonPrice,
        ebayPrice: product.ebayPrice,
        amazonStockCount: product.amazonStockCount,
        alternateAmazonStockCount: product.alternateAmazonStockCount,
        soldCount: product.soldCount,
        rating: product.rating,
        productWatchers: product.productWatchers,
        salesLastTwoMonths: product.salesLastTwoMonths,
        basketCount: product.basketCount || null,
        deliveryDays: product.deliveryDays,
        monthlyGraphUptrend: Boolean(product.monthlyGraphUptrend),
      },
      { emitEvent: false },
    );
    this.editModalOpen.set(true);
  }

  closeEditModal(force = false): void {
    if (this.bulkEditing() && !force) {
      return;
    }

    this.editModalOpen.set(false);
  }

  confirmEdit(): void {
    const product = this.detailProduct();

    if (!product || this.editForm.invalid || this.bulkEditing()) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.bulkEditing.set(true);
    this.error.set('');

    const raw = this.editForm.getRawValue();
    this.api
      .updateProduct(product.id, {
        title: raw.title.trim(),
        category: raw.category || null,
        customLabel: raw.customLabel.trim() || null,
        amazonUrl: raw.amazonUrl.trim(),
        amazonAltUrl: raw.amazonAltUrl.trim() || null,
        ebayUrl: raw.ebayUrl.trim(),
        amazonPrice: raw.amazonPrice,
        ebayPrice: raw.ebayPrice,
        amazonStockCount: raw.amazonStockCount,
        alternateAmazonStockCount: raw.alternateAmazonStockCount,
        soldCount: raw.soldCount,
        rating: raw.rating,
        productWatchers: raw.productWatchers,
        salesLastTwoMonths: raw.salesLastTwoMonths,
        basketCount: raw.basketCount,
        deliveryDays: raw.deliveryDays,
        monthlyGraphUptrend: raw.monthlyGraphUptrend,
      })
      .subscribe({
        next: (updatedProduct) => {
          this.applyProductUpdate(updatedProduct);
          this.closeEditModal(true);
          this.bulkEditing.set(false);
          this.toast.success('Product updated.');
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not update product.');
          this.bulkEditing.set(false);
        },
      });
  }

  openRejectModal(product: Product): void {
    if (!this.canRejectProducts()) {
      return;
    }

    this.detailProduct.set(product);
    this.rejectForm.reset({ reason: '' }, { emitEvent: false });
    this.rejectModalOpen.set(true);
  }

  closeRejectModal(force = false): void {
    if (this.deleting() && !force) {
      return;
    }

    this.rejectModalOpen.set(false);
  }

  confirmReject(): void {
    const product = this.detailProduct();

    if (!product || this.rejectForm.invalid || this.deleting()) {
      this.rejectForm.markAllAsTouched();
      return;
    }

    this.deleting.set(true);
    this.error.set('');

    this.api.rejectProduct(product.id, this.rejectForm.controls.reason.value.trim()).subscribe({
      next: (updatedProduct) => {
        this.applyProductUpdate(updatedProduct);
        this.closeRejectModal(true);
        this.deleting.set(false);
        this.toast.success('Product rejected.');
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not reject product.');
        this.deleting.set(false);
      },
    });
  }

  openDeleteModal(mode: 'soft' | 'permanent', productIds?: string[]): void {
    const ids = productIds?.length ? productIds : this.selectedIds();

    if (!ids.length) {
      this.toast.warning('Select at least one product first.');
      return;
    }

    this.selectedIds.set(ids);
    this.deleteMode.set(mode);
    this.deleteForm.reset({ reason: '' });
    this.deleteModalOpen.set(true);
  }

  closeDeleteModal(force = false): void {
    if (this.deleting() && !force) {
      return;
    }

    this.deleteModalOpen.set(false);
  }

  openBulkEditModal(productIds?: string[]): void {
    if (!this.canBulkEdit()) {
      return;
    }

    const ids = productIds?.length ? productIds : this.selectedIds();

    if (!ids.length) {
      this.toast.warning('Select at least one product first.');
      return;
    }

    this.selectedIds.set(ids);
    this.bulkEditForm.reset(
      {
        title: '',
        customLabel: '',
        category: '',
        amazonUrl: '',
        ebayUrl: '',
      },
      { emitEvent: false },
    );
    this.bulkEditModalOpen.set(true);
  }

  closeBulkEditModal(force = false): void {
    if (this.bulkEditing() && !force) {
      return;
    }

    this.bulkEditModalOpen.set(false);
  }

  confirmBulkEdit(): void {
    if (!this.canBulkEdit() || this.bulkEditing()) {
      return;
    }

    const raw = this.bulkEditForm.getRawValue();
    const payload = {
      title: raw.title.trim() || undefined,
      customLabel: raw.customLabel.trim() || undefined,
      category: raw.category || undefined,
      amazonUrl: raw.amazonUrl.trim() || undefined,
      ebayUrl: raw.ebayUrl.trim() || undefined,
    };

    if (!payload.title && !payload.customLabel && !payload.category && !payload.amazonUrl && !payload.ebayUrl) {
      this.toast.warning('Add at least one field to apply.');
      return;
    }

    this.bulkEditing.set(true);
    this.error.set('');

    this.api.bulkUpdateProducts(this.selectedIds(), payload).subscribe({
      next: (updatedProducts) => {
        const updatedById = new Map(updatedProducts.map((product) => [product.id, product]));
        this.products.update((products) =>
          products.map((product) => updatedById.get(product.id) ?? product),
        );

        const currentDetail = this.detailProduct();
        if (currentDetail && updatedById.has(currentDetail.id)) {
          this.detailProduct.set(updatedById.get(currentDetail.id) ?? currentDetail);
        }

        this.workspaceSync.notifyProductsChanged();
        this.toast.success('Selected products updated.');
        this.closeBulkEditModal(true);
        this.bulkEditing.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not bulk update products.');
        this.bulkEditing.set(false);
      },
    });
  }

  confirmDelete(): void {
    if (this.deleteForm.invalid || this.deleting()) {
      this.deleteForm.markAllAsTouched();
      return;
    }

    this.deleting.set(true);
    this.error.set('');
    const permanent = this.deleteMode() === 'permanent';
    const action = permanent ? this.api.permanentlyDeleteProducts : this.api.softDeleteProducts;

    action
      .call(this.api, this.selectedIds(), this.deleteForm.controls.reason.value.trim())
      .subscribe({
        next: () => {
          this.workspaceSync.notifyProductsChanged();
          this.toast.success(permanent ? 'Products permanently deleted.' : 'Products deleted.');
          this.closeDeleteModal(true);
          this.loadProducts();
          this.deleting.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not delete products.');
          this.deleting.set(false);
        },
      });
  }

  restoreProduct(product: Product): void {
    if (!this.canRestore()) {
      return;
    }

    this.api.restoreProduct(product.id).subscribe({
      next: () => {
        this.workspaceSync.notifyProductsChanged();
        this.toast.success('Product restored.');
        this.loadProducts();
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not restore product.'),
    });
  }

  async exportProducts(): Promise<void> {
    this.exporting.set(true);
    this.error.set('');

    try {
      const filters = this.buildFilters();
      const firstPage = await firstValueFrom(
        this.api.listProducts({ ...filters, page: 1, limit: 100 }),
      );
      const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.limit));
      const rows = [...firstPage.items];

      for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await firstValueFrom(
          this.api.listProducts({ ...filters, page, limit: 100 }),
        );
        rows.push(...nextPage.items);
      }

      const dateStamp = new Date().toISOString().slice(0, 10);
      this.exportService.exportAsExcelTable({
        filename: `admin-products-${dateStamp}.xlsx`,
        sheetName: 'Products',
        rows,
        columns: [
          { header: 'Product', value: (product) => product.title || '' },
          { header: 'ASIN', value: (product) => product.asin || '' },
          { header: 'Category', value: (product) => product.category || '' },
          { header: 'Hunter', value: (product) => product.hunterName },
          { header: 'Assigned Lister', value: (product) => product.assignedListerName || '' },
          { header: 'Quality', value: (product) => product.qualityLabel || '' },
          { header: 'Status', value: (product) => product.status },
          { header: 'Created', value: (product) => product.createdAt },
          { header: 'Listed', value: (product) => product.listedAt || '' },
        ],
      });
      this.toast.success('Products exported.');
    } catch (error) {
      this.error.set('Could not export products.');
    } finally {
      this.exporting.set(false);
    }
  }

  private buildFilters(): ProductFilters {
    const raw = this.filters.getRawValue();

    return {
      search: raw.search.trim() || undefined,
      hunterId: raw.hunterId || undefined,
      listerId: raw.listerId || undefined,
      accountId: raw.accountId || undefined,
      status: raw.status || undefined,
      quality: raw.quality || undefined,
      category: raw.category || undefined,
      deletedState: raw.deletedState,
      from: raw.from || undefined,
      to: raw.to || undefined,
      page: this.pageIndex() + 1,
      limit: this.pageSize(),
    };
  }

  private applyProductUpdate(updatedProduct: Product): void {
    this.products.update((products) =>
      products.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)),
    );
    this.detailProduct.set(updatedProduct);
    this.workspaceSync.notifyProductsChanged();
  }
}
