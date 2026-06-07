import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of } from 'rxjs';

import { ChangeRequestApiService } from '../../core/api/change-request-api.service';
import { HrApiService } from '../../core/api/hr-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { userHasRole } from '../../core/models/auth.models';
import { HrDashboardStats } from '../../core/models/hr.models';
import { AdminService, AdminStats, AuditLogEntry } from '../../core/services/admin.service';
import { ChangeRequestSummary } from '../../core/models/product.models';

@Component({
  selector: 'app-admin-dashboard',
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
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit {
  readonly stats = signal<AdminStats | null>(null);
  readonly activityLogs = signal<AuditLogEntry[]>([]);
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
  readonly loading = signal(false);
  readonly error = signal('');
  readonly hrStats = signal<HrDashboardStats | null>(null);
  readonly canOpenHr = computed(
    () =>
      userHasRole(this.auth.currentUser(), 'hr') ||
      userHasRole(this.auth.currentUser(), 'super_admin'),
  );

  readonly filtersForm = new FormGroup({
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  readonly totalUsers = computed(
    () => (this.stats()?.byHunter.length || 0) + (this.stats()?.byLister.length || 0) + 1,
  );
  readonly topHunters = computed(() => this.stats()?.byHunter.slice(0, 5) ?? []);
  readonly topListers = computed(() => this.stats()?.byLister.slice(0, 5) ?? []);
  readonly topAccounts = computed(() => this.stats()?.byAccount.slice(0, 5) ?? []);
  readonly recentDays = computed(() => this.stats()?.daily.slice(0, 10) ?? []);
  readonly previewLogs = computed(() => this.activityLogs().slice(0, 6));
  readonly orderStats = computed(() => this.stats()?.orderStats ?? null);
  readonly orderHighlights = computed(() => [
    {
      label: 'Open Order Issues',
      value: this.orderStats()?.issueOrders ?? 0,
      detail: 'Orders that still need intervention.',
      icon: 'error_outline',
      tone: 'stat-card__icon--danger',
    },
    {
      label: 'Loss Orders',
      value: this.orderStats()?.lossOrders ?? 0,
      detail: 'Orders currently running at a loss.',
      icon: 'trending_down',
      tone: 'stat-card__icon--danger',
    },
    {
      label: 'Unavailable Products',
      value: this.orderStats()?.unavailableIssues ?? 0,
      detail: 'Orders blocked by unavailable products.',
      icon: 'inventory_2',
      tone: 'stat-card__icon--warning',
    },
    {
      label: 'Pending Product Fixes',
      value: this.changeRequestSummary().pending ?? 0,
      detail: 'Change requests still waiting on listers.',
      icon: 'fact_check',
      tone: 'stat-card__icon--warning',
    },
    {
      label: 'Orders Today',
      value: this.orderStats()?.ordersToday ?? 0,
      detail: 'Fresh orders received today.',
      icon: 'today',
      tone: '',
    },
    {
      label: 'Pending Placement',
      value: this.orderStats()?.pendingPlacement ?? 0,
      detail: 'Orders still waiting to be placed.',
      icon: 'schedule',
      tone: 'stat-card__icon--warning',
    },
    {
      label: 'Delivered Orders',
      value: this.orderStats()?.deliveredOrders ?? 0,
      detail: 'Orders already delivered.',
      icon: 'inventory',
      tone: 'stat-card__icon--success',
    },
  ]);
  readonly activityPreviewRows = computed(() =>
    this.previewLogs().map((log) => ({
      ...log,
      actionLabel: log.action
        .split('.')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      actorSummary: `${log.actorName || log.actorEmail || 'System'}${
        log.actorRole ? ` | ${log.actorRole.replace('_', ' ')}` : ''
      }`,
      targetSummary:
        log.productTitle || log.productAsin || log.accountName || log.targetName || log.targetEmail || 'System item',
    })),
  );
  readonly topAccountRows = computed(() => {
    const listedTotal = this.stats()?.listed || 0;

    return this.topAccounts().map((row) => ({
      ...row,
      share: listedTotal ? Math.round((row.listed / listedTotal) * 100) : 0,
    }));
  });
  readonly hrHighlights = computed(() => [
    {
      label: 'Employees',
      value: this.hrStats()?.totalEmployees ?? 0,
      detail: 'Employee profiles visible to HR leadership.',
      icon: 'badge',
      tone: '',
    },
    {
      label: 'Present Today',
      value: this.hrStats()?.presentToday ?? 0,
      detail: 'Attendance rows already marked today.',
      icon: 'event_available',
      tone: 'stat-card__icon--success',
    },
    {
      label: 'Pending Leaves',
      value: this.hrStats()?.pendingLeaves ?? 0,
      detail: 'Leave requests waiting for review.',
      icon: 'event_busy',
      tone: 'stat-card__icon--warning',
    },
    {
      label: 'Pending Expenses',
      value: this.hrStats()?.pendingExpenses ?? 0,
      detail: 'Expense claims still awaiting action.',
      icon: 'receipt',
      tone: 'stat-card__icon--warning',
    },
  ]);
  readonly selectedRangeLabel = computed(() => {
    const { from, to } = this.filtersForm.getRawValue();

    if (!from || !to) {
      return 'All dates';
    }

    return from === to ? from : `${from} to ${to}`;
  });

  constructor(
    private readonly adminApi: AdminService,
    private readonly changeRequestApi: ChangeRequestApiService,
    private readonly hrApi: HrApiService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.resetToday();
  }

  applyFilters(): void {
    this.loadDashboard();
  }

  resetToday(): void {
    const today = this.toDateInput(new Date());
    this.filtersForm.patchValue({ from: today, to: today }, { emitEvent: false });
    this.loadDashboard();
  }

  loadDashboard(): void {
    this.loading.set(true);
    this.error.set('');

    const { from, to } = this.filtersForm.getRawValue();
    const filters = {
      from: from || undefined,
      to: to || undefined,
    };
    forkJoin({
      stats: this.adminApi.getAdminStats(filters),
      logs: this.adminApi.listAuditLogs(filters),
      changeRequests: this.changeRequestApi.getSummary(),
      hr: this.canOpenHr() ? this.hrApi.getDashboard(filters) : of(null),
    }).subscribe({
      next: ({ stats, logs, changeRequests, hr }) => {
        this.stats.set(stats);
        this.activityLogs.set(logs);
        this.changeRequestSummary.set(changeRequests);
        this.hrStats.set(hr);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load dashboard overview.');
        this.loading.set(false);
      },
    });
  }

  private toDateInput(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
