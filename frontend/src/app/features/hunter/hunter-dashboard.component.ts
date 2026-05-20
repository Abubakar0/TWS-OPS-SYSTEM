import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Product } from '../../core/models/product.models';
import { ProductService } from '../../core/services/product.service';

@Component({
  selector: 'app-hunter-dashboard',
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './hunter-dashboard.component.html',
  styleUrl: './hunter-dashboard.component.scss',
})
export class HunterDashboardComponent implements OnInit {
  readonly products = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly readyCount = computed(
    () => this.products().filter((product) => product.status === 'approved' || product.status === 'assigned').length,
  );
  readonly listedCount = computed(() => this.products().filter((product) => product.status === 'listed').length);
  readonly rejectedCount = computed(() => this.products().filter((product) => product.status === 'rejected').length);

  constructor(private readonly productsApi: ProductService) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.loading.set(true);
    this.error.set('');

    this.productsApi.listProducts().subscribe({
      next: (products) => this.products.set(products),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load dashboard data.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
