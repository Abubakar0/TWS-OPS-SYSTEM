import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { ProductAdminApiService } from '../api/product-admin-api.service';
import { AuthService } from '../auth/auth.service';
import {
  Product,
  ProductFilters,
  ProductQualityLabel,
  ProductStatus,
} from '../models/product.models';
import { ExportService } from '../services/export.service';
import { ReferenceDataService } from '../state/reference-data.service';
import { WorkspaceSyncService } from '../state/workspace-sync.service';
import { ConfirmService } from '../ui/confirm.service';
import { ToastService } from '../ui/toast.service';

@Injectable()
export class AdminProductsFacade {
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly deleting = signal(false);
  readonly error = signal('');
  readonly products = signal<Product[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(30);
  readonly selectedIds = signal<string[]>([]);
  readonly detailProduct = signal<Product | null>(null);
  readonly deleteModalOpen = signal(false);
  readonly deleteMode = signal<'soft' | 'permanent'>('soft');
  readonly availableHunters = signal<Array<{ id: string; name: string }>>([]);
  readonly availableListers = signal<Array<{ id: string; name: string }>>([]);
  readonly availableAccounts = signal<Array<{ id: string; name: string }>>([]);

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    hunterId: new FormControl('', { nonNullable: true }),
    listerId: new FormControl('', { nonNullable: true }),
    accountId: new FormControl('', { nonNullable: true }),
    status: new FormControl<ProductStatus | ''>('', { nonNullable: true }),
    quality: new FormControl<ProductQualityLabel | ''>('', { nonNullable: true }),
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
  readonly canRestore = computed(() => this.auth.currentUser()?.role === 'super_admin');
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
    private readonly confirm: ConfirmService,
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

  async confirmDelete(): Promise<void> {
    if (this.deleteForm.invalid || this.deleting()) {
      this.deleteForm.markAllAsTouched();
      return;
    }

    const permanent = this.deleteMode() === 'permanent';
    const confirmed = await this.confirm.ask({
      title: permanent ? 'Permanently delete products?' : 'Soft delete products?',
      message: permanent
        ? 'This action cannot be undone.'
        : 'Deleted products will be hidden from active workflows until restored.',
      confirmText: permanent ? 'Delete forever' : 'Delete',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.deleting.set(true);
    this.error.set('');
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
      deletedState: raw.deletedState,
      from: raw.from || undefined,
      to: raw.to || undefined,
      page: this.pageIndex() + 1,
      limit: this.pageSize(),
    };
  }
}
