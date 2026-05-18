import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Product, ProductCreatePayload } from '../../core/models/product.models';
import { ProductService } from '../../core/services/product.service';
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

  readonly approvedCount = computed(() => this.products().filter((product) => product.status === 'approved').length);
  readonly rejectedCount = computed(() => this.products().filter((product) => product.status === 'rejected').length);

  readonly form = new FormGroup({
    amazonUrl: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ebayUrl: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', { nonNullable: true }),
    asin: new FormControl('', { nonNullable: true }),
    amazonPrice: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
    ebayPrice: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
    fees: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    stockQuantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    deliveryDays: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
  });

  constructor(private readonly productsApi: ProductService) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.loading.set(true);
    this.error.set('');

    this.productsApi.listProducts().subscribe({
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
          fees: 0,
          stockQuantity: 1,
          deliveryDays: 1,
        });
        this.loadProducts();
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not submit product.'),
      complete: () => this.saving.set(false),
    });
  }
}
