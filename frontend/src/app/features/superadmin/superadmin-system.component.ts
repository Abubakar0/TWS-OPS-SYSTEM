import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { HuntingCriteria } from '../../core/models/product.models';
import { AdminService, SuperAdminStats } from '../../core/services/admin.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';

@Component({
  selector: 'app-superadmin-system',
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './superadmin-system.component.html',
  styleUrl: './superadmin-system.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminSystemComponent implements OnInit {
  readonly stats = signal<SuperAdminStats | null>(null);
  readonly criteria = signal<HuntingCriteria | null>(null);
  readonly accountCount = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly destroyRef = inject(DestroyRef);

  readonly securityItems = [
    'JWT role validation is enforced on protected API routes.',
    'Invalid or expired sessions are cleared and redirected to login.',
    'Super Admin actions are separated from Admin actions by route and backend role checks.',
    'Soft-deleted users remain recoverable through the Super Admin control panel.',
  ];

  readonly defaultValueRows = computed(() => {
    const criteria = this.criteria();

    if (!criteria) {
      return [];
    }

    return [
      { label: 'Minimum ROI', value: `${criteria.minRoi}%` },
      { label: 'Minimum profit', value: String(criteria.minProfit) },
      { label: 'Minimum stock count', value: String(criteria.minStockCount) },
      { label: 'Minimum sold count', value: String(criteria.minSoldCount) },
      { label: 'ASIN required', value: criteria.asinRequired ? 'Yes' : 'No' },
    ];
  });

  constructor(
    private readonly adminApi: AdminService,
    private readonly referenceData: ReferenceDataService,
  ) {}

  ngOnInit(): void {
    this.loadSystemState();
  }

  loadSystemState(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.getSuperAdminStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load system overview.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });

    this.referenceData
      .getCriteria()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (criteria) => this.criteria.set(criteria),
        error: (error) => this.error.set(error?.error?.message || 'Could not load criteria defaults.'),
      });

    this.referenceData
      .getAccounts(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (accounts) => this.accountCount.set(accounts.length),
        error: (error) => this.error.set(error?.error?.message || 'Could not load account totals.'),
      });
  }
}
