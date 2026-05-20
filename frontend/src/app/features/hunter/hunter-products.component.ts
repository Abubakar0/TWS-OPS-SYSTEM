import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

import { Product, ProductFilters, ProductStatus } from '../../core/models/product.models';
import { ExportService } from '../../core/services/export.service';
import { ProductService } from '../../core/services/product.service';
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
    ProductsTableComponent,
  ],
  templateUrl: './hunter-products.component.html',
  styleUrl: './hunter-products.component.scss',
})
export class HunterProductsComponent implements OnInit, OnDestroy {
  readonly products = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly resultLabel = computed(() => {
    const count = this.products().length;
    return `${count} product${count === 1 ? '' : 's'}`;
  });

  private readonly destroyRef = inject(DestroyRef);
  private listSubscription?: Subscription;
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
    listedFrom: new FormControl('', { nonNullable: true }),
    listedTo: new FormControl('', { nonNullable: true }),
  });

  readonly readyCount = computed(
    () => this.products().filter((product) => product.status === 'approved' || product.status === 'assigned').length,
  );
  readonly listedCount = computed(() => this.products().filter((product) => product.status === 'listed').length);
  readonly rejectedCount = computed(() => this.products().filter((product) => product.status === 'rejected').length);

  constructor(
    private readonly productsApi: ProductService,
    private readonly exportService: ExportService,
  ) {}

  ngOnInit(): void {
    this.filters.controls.search.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadProducts());

    this.loadProducts();
  }

  ngOnDestroy(): void {
    this.listSubscription?.unsubscribe();
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
        listedFrom: '',
        listedTo: '',
      },
      { emitEvent: false },
    );

    this.loadProducts();
  }

  exportProducts(): void {
    const dateStamp = new Date().toISOString().slice(0, 10);

    this.exportService.exportAsExcelTable({
      filename: `hunter-products-${dateStamp}.xls`,
      sheetName: 'Hunter Products',
      rows: this.products(),
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
  }

  loadProducts(): void {
    this.listSubscription?.unsubscribe();
    this.loading.set(true);
    this.error.set('');

    this.listSubscription = this.productsApi.listProducts(this.buildFilters()).subscribe({
      next: (products) => this.products.set(products),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load products.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
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
      listedFrom: raw.listedFrom || undefined,
      listedTo: raw.listedTo || undefined,
    };
  }

  private formatDateTime(value: string | null): string {
    if (!value) {
      return '';
    }

    return this.dateTimeFormatter.format(new Date(value));
  }
}
