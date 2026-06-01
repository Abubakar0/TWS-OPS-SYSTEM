import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ChangeRequestApiService } from '../../core/api/change-request-api.service';
import { WeeklyReviewApiService } from '../../core/api/weekly-review-api.service';
import {
  DashboardService,
  HunterDashboardFilters,
  HunterDashboardStats,
} from '../../core/services/dashboard.service';
import {
  ChangeRequestSummary,
  HuntingCriteria,
  WeeklyReviewStatus,
} from '../../core/models/product.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { SessionCacheService } from '../../core/state/session-cache.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';

type RangePreset = 'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

const customDateRangeValidator: ValidatorFn = (control): ValidationErrors | null => {
  const from = control.get('from')?.value as string;
  const to = control.get('to')?.value as string;

  if (!from && !to) {
    return null;
  }

  if (!from || !to) {
    return { incompleteRange: true };
  }

  if (from > to) {
    return { invalidRange: true };
  }

  return null;
};

@Component({
  selector: 'app-hunter-dashboard',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './hunter-dashboard.component.html',
  styleUrl: './hunter-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterDashboardComponent implements OnInit {
  readonly stats = signal<HunterDashboardStats | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly criteria = signal<HuntingCriteria>({
    minRoi: 30,
    minProfit: 0,
    minSoldCount: 1,
    feePercent: 21,
    asinRequired: true,
    minStockCount: 8,
    minAlternateStockCount: 8,
    minRating: 0,
    customLabelRequired: false,
    watchersRequired: false,
    minWatcherCount: 0,
    minSalesLastTwoMonths: 0,
    basketCountRequired: false,
    deliveryDaysRequired: false,
    maxDeliveryDays: 7,
    monthlyGraphRequired: false,
  });
  readonly weeklyReviewStatus = signal<WeeklyReviewStatus | null>(null);
  readonly changeRequestSummary = signal<ChangeRequestSummary>({
    total: 0,
    pending: 0,
    completed: 0,
    open: 0,
    inProgress: 0,
    fixed: 0,
    rejected: 0,
    closed: 0,
    fixedToday: 0,
  });
  readonly selectedRange = signal<RangePreset>('thisMonth');
  readonly activeFilters = signal<HunterDashboardFilters>({});

  readonly customRangeForm = new FormGroup(
    {
      from: new FormControl('', { nonNullable: true }),
      to: new FormControl('', { nonNullable: true }),
    },
    { validators: [customDateRangeValidator] },
  );

  readonly rangeButtons: Array<{ key: RangePreset; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'lastMonth', label: 'Last Month' },
    { key: 'thisYear', label: 'This Year' },
    { key: 'custom', label: 'Custom Range' },
  ];

  readonly totalCount = computed(() => this.stats()?.totalHunted ?? 0);
  readonly approvedCount = computed(() => this.stats()?.approved ?? 0);
  readonly pendingCount = computed(() => this.stats()?.pending ?? 0);
  readonly rejectedCount = computed(() => this.stats()?.rejected ?? 0);
  readonly listedCount = computed(() => this.stats()?.listed ?? 0);
  readonly excellentCount = computed(() => this.stats()?.excellent ?? 0);
  readonly goodCount = computed(() => this.stats()?.good ?? 0);
  readonly averageCount = computed(() => this.stats()?.average ?? 0);
  readonly accountStats = computed(() => this.stats()?.byAccount ?? []);
  readonly listerStats = computed(() => this.stats()?.byLister ?? []);
  readonly orderStats = computed(() => this.stats()?.orderStats ?? null);
  readonly orderHighlights = computed(() => [
    {
      label: 'Products Needing Fix',
      value: this.changeRequestSummary().pending || 0,
      detail: 'Linked products with open listing fixes.',
      icon: 'build_circle',
      tone: 'stat-card__icon--warning',
    },
    {
      label: 'My Orders',
      value: this.orderStats()?.totalOrders ?? 0,
      detail: 'Orders connected to your hunted products.',
      icon: 'receipt_long',
      tone: '',
    },
    {
      label: 'Order Profit',
      value: `$${(this.orderStats()?.totalProfit ?? 0).toFixed(2)}`,
      detail: 'Profit captured from linked orders.',
      icon: 'attach_money',
      tone: 'stat-card__icon--success',
    },
    {
      label: 'Pending Orders',
      value: this.orderStats()?.pendingPlacement ?? 0,
      detail: 'Orders still waiting on placement.',
      icon: 'schedule',
      tone: 'stat-card__icon--warning',
    },
    {
      label: 'Delivered Orders',
      value: this.orderStats()?.deliveredOrders ?? 0,
      detail: 'Orders delivered to the buyer.',
      icon: 'inventory',
      tone: 'stat-card__icon--success',
    },
    {
      label: 'Issue Orders',
      value: this.orderStats()?.issueOrders ?? 0,
      detail: 'Orders currently flagged for follow-up.',
      icon: 'priority_high',
      tone: 'stat-card__icon--danger',
    },
    {
      label: 'Loss Orders',
      value: this.orderStats()?.lossOrders ?? 0,
      detail: 'Linked orders currently running below break-even.',
      icon: 'trending_down',
      tone: 'stat-card__icon--danger',
    },
    {
      label: 'Unavailable Issues',
      value: this.orderStats()?.unavailableIssues ?? 0,
      detail: 'Matched orders where the product could not be sourced.',
      icon: 'remove_shopping_cart',
      tone: 'stat-card__icon--warning',
    },
  ]);
  readonly showReviewBanner = computed(() => this.weeklyReviewStatus()?.required === true);
  readonly showChangeBanner = computed(() => (this.changeRequestSummary().pending || 0) > 0);

  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionCache = inject(SessionCacheService);
  private readonly workspaceSync = inject(WorkspaceSyncService);
  private readonly injector = inject(Injector);

  constructor(
    private readonly dashboardApi: DashboardService,
    private readonly referenceData: ReferenceDataService,
    private readonly changeRequestApi: ChangeRequestApiService,
    private readonly weeklyReviewApi: WeeklyReviewApiService,
  ) {}

  ngOnInit(): void {
    const cachedCriteria = this.sessionCache.criteria();

    if (cachedCriteria) {
      this.criteria.set(cachedCriteria);
    }

    this.referenceData
      .getCriteria()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (criteria) => this.criteria.set(criteria),
      });

    const savedRange = this.sessionCache.getDashboardPreference('hunter-dashboard-range') as
      | RangePreset
      | null;
    const initialRange =
      savedRange && this.rangeButtons.some((option) => option.key === savedRange)
        ? savedRange
        : 'thisMonth';

    this.applyPreset(initialRange);
    this.loadDashboardSignals();

    effect(
      () => {
        const version = this.workspaceSync.productsVersion();

        if (version > 0) {
          this.loadStats(this.activeFilters());
        }
      },
      { allowSignalWrites: true, injector: this.injector },
    );

    effect(
      () => {
        const version = this.workspaceSync.settingsVersion();

        if (version > 0) {
          this.referenceData.refreshCriteria();
        }
      },
      { allowSignalWrites: true, injector: this.injector },
    );
  }

  applyPreset(range: RangePreset): void {
    this.selectedRange.set(range);
    this.sessionCache.setDashboardPreference('hunter-dashboard-range', range);

    if (range === 'custom') {
      return;
    }

    const filters = this.getPresetFilters(range);
    this.activeFilters.set(filters);
    this.loadStats(filters);
  }

  applyCustomRange(): void {
    if (this.customRangeForm.invalid) {
      this.customRangeForm.markAllAsTouched();
      return;
    }

    const filters = this.customRangeForm.getRawValue();
    this.selectedRange.set('custom');
    this.sessionCache.setDashboardPreference('hunter-dashboard-range', 'custom');
    this.activeFilters.set(filters);
    this.loadStats(filters);
  }

  refresh(): void {
    this.loadStats(this.activeFilters());
  }

  customRangeError(): string {
    const group = this.customRangeForm;

    if (!group.touched && !group.dirty) {
      return '';
    }

    if (group.hasError('incompleteRange')) {
      return 'Enter both start and end dates for a custom range.';
    }

    if (group.hasError('invalidRange')) {
      return 'The end date must be on or after the start date.';
    }

    return '';
  }

  private loadStats(filters: HunterDashboardFilters): void {
    this.loading.set(true);
    this.error.set('');

    this.dashboardApi.getHunterStats(filters).subscribe({
      next: (stats) => this.stats.set(stats),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load dashboard data.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  private loadDashboardSignals(): void {
    this.changeRequestApi
      .getSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => this.changeRequestSummary.set(summary),
      });

    this.weeklyReviewApi
      .getStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => this.weeklyReviewStatus.set(status),
      });
  }

  private getPresetFilters(range: Exclude<RangePreset, 'custom'>): HunterDashboardFilters {
    const today = new Date();

    switch (range) {
      case 'today':
        return { from: this.toDateInput(today), to: this.toDateInput(today) };
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        return { from: this.toDateInput(yesterday), to: this.toDateInput(yesterday) };
      }
      case 'thisMonth': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: this.toDateInput(start), to: this.toDateInput(today) };
      }
      case 'lastMonth': {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { from: this.toDateInput(start), to: this.toDateInput(end) };
      }
      case 'thisYear': {
        const start = new Date(today.getFullYear(), 0, 1);
        return { from: this.toDateInput(start), to: this.toDateInput(today) };
      }
    }
  }

  private toDateInput(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
