import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { firstValueFrom, Subject, catchError, debounceTime, distinctUntilChanged, finalize, of, switchMap } from 'rxjs';

import { Product, ProductFilters, ProductStatus } from '../../core/models/product.models';
import { ExportService } from '../../core/services/export.service';
import { ProductService } from '../../core/services/product.service';
import { PageResult } from '../../core/state/query-state.models';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { ProductsTableComponent } from '../../shared/products-table/products-table.component';

@Component({
  selector: 'app-hunter-products',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ErrorStateComponent,
    ProductsTableComponent,
  ],
  templateUrl: './hunter-products.component.html',
  styleUrl: './hunter-products.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterProductsComponent implements OnInit {
  readonly pageSizeOptions = [10, 25, 50];
  readonly products = signal<Product[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(this.pageSizeOptions[1]);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly resultLabel = computed(() => {
    const count = this.total();
    return `${count} product${count === 1 ? '' : 's'}`;
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly pageLabel = computed(() => {
    const total = this.total();

    if (!total) {
      return 'No products to show';
    }

    const start = this.pageIndex() * this.pageSize() + 1;
    const end = Math.min(total, start + this.products().length - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly reloadProducts$ = new Subject<void>();
  private readonly dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    status: new FormControl<ProductStatus | ''>('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
    listerName: new FormControl('', { nonNullable: true }),
    accountName: new FormControl('', { nonNullable: true }),
  });

  readonly readyCount = computed(
    () => this.products().filter((product) => product.status === 'approved' || product.status === 'assigned').length,
  );
  readonly listedCount = computed(() => this.products().filter((product) => product.status === 'listed').length);
  readonly rejectedCount = computed(() => this.products().filter((product) => product.status === 'rejected').length);

  constructor(
    private readonly productsApi: ProductService,
    private readonly exportService: ExportService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.filters.controls.search.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadProducts());

    this.reloadProducts$
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.error.set('');

          return this.productsApi.listProducts(this.buildFilters()).pipe(
            catchError((error) => {
              this.error.set(error?.error?.message || 'Could not load products.');
              return of<PageResult<Product>>({
                items: [],
                page: this.pageIndex() + 1,
                limit: this.pageSize(),
                total: 0,
                hasMore: false,
              });
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        this.products.set(page.items);
        this.total.set(page.total);
      });

    this.loadProducts();

    effect(
      () => {
        const version = this.workspaceSync.productsVersion();

        if (version > 0) {
          this.loadProducts();
        }
      },
      { allowSignalWrites: true, injector: this.injector },
    );
  }

  applyFilters(): void {
    this.loadProducts();
  }

  resetFilters(): void {
    this.filters.reset(
      {
        search: '',
        status: '',
        from: '',
        to: '',
        listerName: '',
        accountName: '',
      },
      { emitEvent: false },
    );

    this.loadProducts();
  }

  exportProducts(): void {
    void this.exportAllProducts();
  }

  loadProducts(): void {
    this.reloadProducts$.next();
  }

  onPageChange(event: PageEvent): void {
    const nextSize = event.pageSize;
    const sizeChanged = nextSize !== this.pageSize();

    this.pageSize.set(nextSize);
    this.pageIndex.set(sizeChanged ? 0 : event.pageIndex);
    this.loadProducts();
  }

  private buildFilters(): ProductFilters {
    const raw = this.filters.getRawValue();

    return {
      search: raw.search.trim() || undefined,
      status: raw.status || undefined,
      from: raw.from || undefined,
      to: raw.to || undefined,
      listerName: raw.listerName.trim() || undefined,
      accountName: raw.accountName.trim() || undefined,
      page: this.pageIndex() + 1,
      limit: this.pageSize(),
    };
  }

  private async exportAllProducts(): Promise<void> {
    this.exporting.set(true);

    try {
      const firstPage = await firstValueFrom(
        this.productsApi.listProducts({
          ...this.buildFilters(),
          page: 1,
          limit: 100,
        }),
      );
      const rows = [...firstPage.items];
      const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.limit));

      for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await firstValueFrom(
          this.productsApi.listProducts({
            ...this.buildFilters(),
            page,
            limit: 100,
          }),
        );
        rows.push(...nextPage.items);
      }

      const dateStamp = new Date().toISOString().slice(0, 10);

      this.exportService.exportAsExcelTable({
        filename: `hunter-products-${dateStamp}.xlsx`,
        sheetName: 'Hunter Products',
        rows,
        columns: [
          { header: 'Title', value: (product) => product.title || '' },
          { header: 'ASIN', value: (product) => product.asin || '' },
          { header: 'Custom Label', value: (product) => product.customLabel || '' },
          { header: 'Status', value: (product) => product.status },
          { header: 'Rejection Reason', value: (product) => product.rejectionReason || '' },
          { header: 'Amazon Link', value: (product) => product.amazonUrl },
          { header: 'Amazon Alternate Link', value: (product) => product.amazonAltUrl || '' },
          { header: 'eBay Link', value: (product) => product.ebayUrl },
          { header: 'Amazon Price', value: (product) => product.amazonPrice ?? '' },
          { header: 'eBay Price', value: (product) => product.ebayPrice ?? '' },
          { header: 'Profit', value: (product) => product.profit },
          { header: 'ROI', value: (product) => product.roi },
          { header: 'Fees', value: (product) => product.fees },
          { header: 'Lister', value: (product) => product.listedByName || product.assignedListerName || '' },
          { header: 'Account', value: (product) => product.accountName || '' },
          { header: 'Listed At', value: (product) => this.formatDateTime(product.listedAt) },
          { header: 'Submitted At', value: (product) => this.formatDateTime(product.createdAt) },
        ],
      });
      this.toast.success('Products exported.');
    } catch (error) {
      this.toast.error('Could not export products.');
    } finally {
      this.exporting.set(false);
    }
  }

  private formatDateTime(value: string | null): string {
    if (!value) {
      return '';
    }

    return this.dateTimeFormatter.format(new Date(value));
  }
}
