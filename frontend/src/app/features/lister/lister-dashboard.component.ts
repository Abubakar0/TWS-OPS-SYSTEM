import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Product } from '../../core/models/product.models';
import { ProductService } from '../../core/services/product.service';
import { ProductsTableComponent } from '../../shared/products-table/products-table.component';

@Component({
  selector: 'app-lister-dashboard',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, ProductsTableComponent],
  templateUrl: './lister-dashboard.component.html',
  styleUrl: './lister-dashboard.component.scss',
})
export class ListerDashboardComponent implements OnInit {
  readonly products = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor(private readonly productsApi: ProductService) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.loading.set(true);
    this.error.set('');

    this.productsApi.listProducts().subscribe({
      next: (products) => this.products.set(products),
      error: (error) => this.error.set(error?.error?.message || 'Could not load approved products.'),
      complete: () => this.loading.set(false),
    });
  }
}
