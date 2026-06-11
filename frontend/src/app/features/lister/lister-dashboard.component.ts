import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ChangeRequestApiService } from '../../core/api/change-request-api.service';
import { HrApiService } from '../../core/api/hr-api.service';
import { DashboardService, HunterDashboardFilters, ListerDashboardStats } from '../../core/services/dashboard.service';
import { MyHrProfile } from '../../core/models/hr.models';
import { ChangeRequestSummary } from '../../core/models/product.models';
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
  selector: 'app-lister-dashboard',
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
  templateUrl: './lister-dashboard.component.html',
  styleUrl: './lister-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListerDashboardComponent implements OnInit {
  readonly stats = signal<ListerDashboardStats | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly myHrProfile = signal<MyHrProfile | null>(null);
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

  readonly totalListed = computed(() => this.stats()?.totalListed ?? 0);
  readonly rejectedCount = computed(() => this.stats()?.rejected ?? 0);
  readonly hunterBreakdown = computed(() => this.stats()?.byHunter ?? []);
  readonly accountBreakdown = computed(() => this.stats()?.byAccount ?? []);
  readonly hunterCount = computed(() => this.hunterBreakdown().length);
  readonly accountCount = computed(() => this.accountBreakdown().length);
  readonly showChangeBanner = computed(() => (this.changeRequestSummary().pending || 0) > 0);
  readonly hrSummaryCards = computed(() => {
    const profile = this.myHrProfile();

    if (!profile) {
      return [];
    }

    const latestAttendance = profile.attendance[0];
    const pendingLeaves = profile.leaves.filter((leave) => leave.status === 'PENDING').length;
    const pendingPayroll = profile.payroll.filter((entry) => entry.status !== 'PAID').length;

    return [
      {
        label: 'Attendance Summary',
        value: latestAttendance?.status || 'No Record',
        detail: latestAttendance?.date ? `Latest entry ${latestAttendance.date}` : 'No attendance has been logged yet.',
        icon: 'calendar_month',
        tone: '',
      },
      {
        label: 'Pending Leave Requests',
        value: pendingLeaves,
        detail: 'Leave requests still waiting for HR review.',
        icon: 'event_busy',
        tone: pendingLeaves ? 'stat-card__icon--warning' : '',
      },
      {
        label: 'Upcoming Payroll',
        value: pendingPayroll,
        detail: 'Payroll entries that have not been paid yet.',
        icon: 'payments',
        tone: pendingPayroll ? 'stat-card__icon--warning' : 'stat-card__icon--success',
      },
      {
        label: 'Warnings',
        value: profile.warnings.length,
        detail: 'Warnings visible on your employee record.',
        icon: 'gpp_maybe',
        tone: profile.warnings.length ? 'stat-card__icon--danger' : 'stat-card__icon--success',
      },
    ];
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionCache = inject(SessionCacheService);
  private readonly workspaceSync = inject(WorkspaceSyncService);
  private readonly injector = inject(Injector);

  constructor(
    private readonly dashboardApi: DashboardService,
    private readonly changeRequestApi: ChangeRequestApiService,
    private readonly hrApi: HrApiService,
  ) {}

  ngOnInit(): void {
    const savedRange = this.sessionCache.getDashboardPreference('lister-dashboard-range') as
      | RangePreset
      | null;
    const initialRange =
      savedRange && this.rangeButtons.some((option) => option.key === savedRange)
        ? savedRange
        : 'thisMonth';

    this.applyPreset(initialRange);
    void this.loadMyHrSummary();
    this.changeRequestApi
      .getSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => this.changeRequestSummary.set(summary),
      });

    effect(
      () => {
        const version = this.workspaceSync.productsVersion();

        if (version > 0) {
          this.loadStats(this.activeFilters());
        }
      },
      { allowSignalWrites: true, injector: this.injector },
    );
  }

  applyPreset(range: RangePreset): void {
    this.selectedRange.set(range);
    this.sessionCache.setDashboardPreference('lister-dashboard-range', range);

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
    this.sessionCache.setDashboardPreference('lister-dashboard-range', 'custom');
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

    this.dashboardApi.getListerStats(filters).subscribe({
      next: (stats) => this.stats.set(stats),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load dashboard data.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
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

  private async loadMyHrSummary(): Promise<void> {
    try {
      const profile = await firstValueFrom(this.hrApi.getMyHr());
      this.myHrProfile.set(profile);
    } catch {
      this.myHrProfile.set(null);
    }
  }

  private toDateInput(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
