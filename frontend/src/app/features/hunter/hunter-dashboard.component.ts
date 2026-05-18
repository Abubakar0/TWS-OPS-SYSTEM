import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { Product, ProductCreatePayload, ProductStatus, HuntingCriteria } from '../../core/models/product.models';
import { ProductService } from '../../core/services/product.service';
import { AdminService } from '../../core/services/admin.service';
import { ProductsTableComponent } from '../../shared/products-table/products-table.component';

@Component({
  selector: 'app-hunter-dashboard',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ProductsTableComponent,
  ],
  templateUrl: './hunter-dashboard.component.html',
  styleUrl: './hunter-dashboard.component.scss',
})
export class HunterDashboardComponent implements OnInit {
  readonly products = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly lastSubmitted = signal<Product | null>(null);
  readonly criteria = signal<HuntingCriteria>({
    minRoi: 30,
    minProfit: 0,
    minSoldCount: 1,
    feePercent: 21,
    asinRequired: true,
  });
  readonly formVersion = signal(0);

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    status: new FormControl<ProductStatus | ''>('', { nonNullable: true }),
  });

  readonly approvedCount = computed(
    () => this.products().filter((product) => product.status === 'approved' || product.status === 'assigned').length,
  );
  readonly listedCount = computed(() => this.products().filter((product) => product.status === 'listed').length);
  readonly rejectedCount = computed(() => this.products().filter((product) => product.status === 'rejected').length);
  readonly economics = computed(() => {
    this.formVersion();
    const values = this.form.getRawValue();
    const amazonPrice = Number(values.amazonPrice) || 0;
    const ebayPrice = Number(values.ebayPrice) || 0;
    const feePercent = this.criteria().feePercent;
    const fees = Number(((ebayPrice * feePercent) / 100).toFixed(2));
    const profit = Number((ebayPrice - amazonPrice - fees).toFixed(2));
    const roi = amazonPrice > 0 ? Number(((profit / amazonPrice) * 100).toFixed(2)) : 0;
    const targetProfit = Number(((amazonPrice * this.criteria().minRoi) / 100).toFixed(2));

    return { fees, profit, roi, targetProfit };
  });

  readonly form = new FormGroup({
    amazonUrl: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ebayUrl: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', { nonNullable: true }),
    asin: new FormControl('', { nonNullable: true }),
    amazonPrice: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
    ebayPrice: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
    soldCount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
  });

  constructor(
    private readonly productsApi: ProductService,
    private readonly adminApi: AdminService,
  ) {}

  ngOnInit(): void {
    this.form.valueChanges.subscribe(() => this.formVersion.update((value) => value + 1));
    this.loadCriteria();
    this.loadProducts();
  }

  loadCriteria(): void {
    this.adminApi.getCriteria().subscribe({
      next: (criteria) => this.criteria.set(criteria),
    });
  }

  loadProducts(): void {
    this.loading.set(true);
    this.error.set('');

    this.productsApi.listProducts(this.filters.getRawValue()).subscribe({
      next: (products) => this.products.set(products),
      error: (error) => this.error.set(error?.error?.message || 'Could not load products.'),
      complete: () => this.loading.set(false),
    });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.productsApi.createProduct(this.form.getRawValue() as ProductCreatePayload).subscribe({
      next: (product) => {
        this.lastSubmitted.set(product);
        this.form.reset({
          amazonUrl: '',
          ebayUrl: '',
          title: '',
          asin: '',
          amazonPrice: 0,
          ebayPrice: 0,
          soldCount: 0,
        });
        this.loadProducts();
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not submit product.'),
      complete: () => this.saving.set(false),
    });
  }
}
