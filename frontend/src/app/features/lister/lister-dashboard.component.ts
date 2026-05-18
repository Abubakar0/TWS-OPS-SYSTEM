import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { Account, AssignedHunter, Product, ProductStatus } from '../../core/models/product.models';
import { ProductService } from '../../core/services/product.service';
import { AdminService } from '../../core/services/admin.service';

@Component({
  selector: 'app-lister-dashboard',
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
  ],
  templateUrl: './lister-dashboard.component.html',
  styleUrl: './lister-dashboard.component.scss',
})
export class ListerDashboardComponent implements OnInit {
  readonly hunters = signal<AssignedHunter[]>([]);
  readonly selectedHunterId = signal('');
  readonly products = signal<Product[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly copied = signal('');

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    status: new FormControl<ProductStatus | ''>('', { nonNullable: true }),
  });

  readonly bulkForm = new FormGroup({
    accountId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly readyCount = computed(
    () => this.products().filter((product) => product.status === 'approved' || product.status === 'assigned').length,
  );
  readonly listedCount = computed(() => this.products().filter((product) => product.status === 'listed').length);
  readonly selectedCount = computed(() => this.selectedIds().size);

  constructor(
    private readonly productsApi: ProductService,
    private readonly adminApi: AdminService,
  ) {}

  ngOnInit(): void {
    this.loadInitial();
  }

  loadInitial(): void {
    this.productsApi.listAssignedHunters().subscribe((hunters) => {
      this.hunters.set(hunters);
      if (!this.selectedHunterId() && hunters[0]) {
        this.selectHunter(hunters[0].id);
      }
    });
    this.adminApi.listAccounts().subscribe((accounts) => this.accounts.set(accounts));
  }

  selectHunter(hunterId: string): void {
    this.selectedHunterId.set(hunterId);
    this.selectedIds.set(new Set());
    this.loadProducts();
  }

  loadProducts(): void {
    if (!this.selectedHunterId()) {
      this.products.set([]);
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.productsApi
      .listProducts({
        ...this.filters.getRawValue(),
        hunterId: this.selectedHunterId(),
      })
      .subscribe({
        next: (products) => this.products.set(products),
        error: (error) => this.error.set(error?.error?.message || 'Could not load products.'),
        complete: () => this.loading.set(false),
      });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelection(id: string, checked: boolean): void {
    const next = new Set(this.selectedIds());
    checked ? next.add(id) : next.delete(id);
    this.selectedIds.set(next);
  }

  toggleAll(checked: boolean): void {
    this.selectedIds.set(checked ? new Set(this.products().map((product) => product.id)) : new Set());
  }

  markSelectedListed(): void {
    if (this.bulkForm.invalid || this.selectedIds().size === 0 || this.saving()) {
      this.bulkForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.productsApi
      .markBulkListed({
        accountId: this.bulkForm.getRawValue().accountId,
        items: [...this.selectedIds()].map((id) => ({ id })),
      })
      .subscribe({
        next: () => {
          this.selectedIds.set(new Set());
          this.loadProducts();
          this.loadInitial();
        },
        error: (error) => this.error.set(error?.error?.message || 'Could not update products.'),
        complete: () => this.saving.set(false),
      });
  }

  copy(value: string | null | undefined, label: string): void {
    if (!value) {
      return;
    }

    navigator.clipboard?.writeText(value);
    this.copied.set(label);
    window.setTimeout(() => this.copied.set(''), 1400);
  }
}
