import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Product } from '../../core/models/product.models';
import { ProductService } from '../../core/services/product.service';
import { ProductsTableComponent } from '../../shared/products-table/products-table.component';

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, ProductsTableComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  readonly products = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly huntedToday = computed(() =>
    this.products().filter((product) => this.isToday(product.createdAt)).length,
  );
  readonly approvedQueue = computed(() =>
    this.products().filter((product) => product.status === 'approved').length,
  );
  readonly rejectedToday = computed(() =>
    this.products().filter((product) => product.status === 'rejected' && this.isToday(product.createdAt)).length,
  );
  readonly listedToday = computed(() =>
    this.products().filter((product) => product.status === 'listed' && product.listedAt && this.isToday(product.listedAt))
      .length,
  );

  constructor(private readonly productsApi: ProductService) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.loading.set(true);
    this.error.set('');

    this.productsApi.listProducts().subscribe({
      next: (products) => this.products.set(products),
      error: (error) => this.error.set(error?.error?.message || 'Could not load dashboard data.'),
      complete: () => this.loading.set(false),
    });
  }

  private isToday(value: string): boolean {
    const date = new Date(value);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }
}
