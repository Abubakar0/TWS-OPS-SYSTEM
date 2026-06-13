import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin } from 'rxjs';

import { HrApiService } from '../../core/api/hr-api.service';
import { HrDashboardStats } from '../../core/models/hr.models';
import { AdminService, SuperAdminStats } from '../../core/services/admin.service';

type DashboardRangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

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
  selector: 'app-superadmin-dashboard',
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
  templateUrl: './superadmin-dashboard.component.html',
  styleUrl: './superadmin-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminDashboardComponent implements OnInit {
  readonly stats = signal<SuperAdminStats | null>(null);
  readonly hrStats = signal<HrDashboardStats | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedRange = signal<DashboardRangePreset>('month');
  readonly rangeButtons: Array<{ key: DashboardRangePreset; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'custom', label: 'Custom Range' },
  ];

  readonly customRangeForm = new FormGroup(
    {
      from: new FormControl('', { nonNullable: true }),
      to: new FormControl('', { nonNullable: true }),
    },
    { validators: [customDateRangeValidator] },
  );

  readonly topHunters = computed(() => this.stats()?.byHunter.slice(0, 6) ?? []);
  readonly topListers = computed(() => this.stats()?.byLister.slice(0, 6) ?? []);
  readonly topAccounts = computed(() => this.stats()?.byAccount.slice(0, 6) ?? []);
  readonly orderStats = computed(() => this.stats()?.orderStats ?? null);
  readonly controlCenterCards = computed(() => {
    const stats = this.stats();
    const hr = this.hrStats();

    return [
      {
        group: 'Users',
        route: '/superadmin/users',
        icon: 'group',
        metrics: [
          ['Total', stats?.totalUsers ?? 0],
          ['Active', stats?.activeUsers ?? 0],
          ['Disabled', stats?.disabledUsers ?? 0],
          ['Admins', stats?.totalAdmins ?? 0],
          ['Hunters', stats?.totalHunters ?? 0],
          ['Training Hunters', stats?.trainingHunters ?? 0],
          ['Listers', stats?.totalListers ?? 0],
          ['Order Processors', stats?.totalOrderProcessors ?? 0],
          ['HR Users', stats?.totalHrUsers ?? 0],
        ],
      },
      {
        group: 'Products',
        route: '/superadmin/products',
        icon: 'inventory_2',
        metrics: [
          ['Total', stats?.totalProducts ?? 0],
          ['Approved', stats?.approvedProducts ?? 0],
          ['Rejected', stats?.rejectedProducts ?? 0],
          ['Listed', stats?.listedProducts ?? 0],
          ['Needs Review', stats?.listedNeedsReview ?? 0],
          ['Best', stats?.excellentProducts ?? 0],
          ['Good', stats?.goodProducts ?? 0],
          ['Average', stats?.averageProducts ?? 0],
          ['Transferred', stats?.transferredProducts ?? 0],
        ],
      },
      {
        group: 'Orders',
        route: '/superadmin/orders',
        icon: 'receipt_long',
        metrics: [
          ['Total', this.orderStats()?.totalOrders ?? 0],
          ['Delivered', this.orderStats()?.deliveredOrders ?? 0],
          ['Issues', this.orderStats()?.issueOrders ?? 0],
          ['Revenue', `$${(this.orderStats()?.totalRevenue ?? 0).toFixed(2)}`],
          ['Profit', `$${(this.orderStats()?.totalProfit ?? 0).toFixed(2)}`],
          ['Average ROI', `${(this.orderStats()?.averageRoi ?? 0).toFixed(2)}%`],
        ],
      },
      {
        group: 'Accounts',
        route: '/superadmin/reports/accounts',
        icon: 'storefront',
        metrics: [
          ['Total', stats?.accountStats?.totalAccounts ?? 0],
          ['Active', stats?.accountStats?.activeAccounts ?? 0],
          ['Disabled', stats?.accountStats?.disabledAccounts ?? 0],
          ['Marketplaces', Object.keys(stats?.accountStats?.accountsByMarketplace || {}).length],
          ['Countries', Object.keys(stats?.accountStats?.accountsByCountry || {}).length],
        ],
      },
      {
        group: 'Listers',
        route: '/superadmin/listing-reviews',
        icon: 'fact_check',
        metrics: [
          ['Total Listings', stats?.listerStats?.totalListings ?? 0],
          ['Pending Reviews', stats?.listerStats?.pendingListingReviews ?? 0],
          ['Approved Reviews', stats?.listerStats?.approvedListingReviews ?? 0],
          ['Rejected Reviews', stats?.listerStats?.rejectedListingReviews ?? 0],
          ['Open Change Requests', stats?.listerStats?.openChangeRequests ?? 0],
        ],
      },
      {
        group: 'Training',
        route: '/superadmin/reports/hunters',
        icon: 'school',
        metrics: [
          ['Training Hunters', stats?.trainingStats?.trainingHunters ?? 0],
          ['Activated', stats?.trainingStats?.activatedHunters ?? 0],
          ['Rejected', stats?.trainingStats?.rejectedTrainingHunters ?? 0],
          ['Mentors', stats?.trainingStats?.mentorAssignments ?? 0],
          ['Approval Rate', `${(stats?.trainingStats?.trainingApprovalRate ?? 0).toFixed(2)}%`],
        ],
      },
      {
        group: 'HR',
        route: '/hr/dashboard',
        icon: 'badge',
        metrics: [
          ['Employees', hr?.totalEmployees ?? 0],
          ['Active', hr?.activeEmployees ?? 0],
          ['Present Today', hr?.presentToday ?? 0],
          ['Absent Today', hr?.absentToday ?? 0],
          ['On Leave', hr?.onLeave ?? 0],
          ['Pending Leaves', hr?.pendingLeaves ?? 0],
          ['Monthly Payroll', `$${(hr?.monthlySalaryCost ?? 0).toFixed(2)}`],
          ['Pending Expenses', hr?.pendingExpenses ?? 0],
          ['Birthdays Today', hr?.todaysBirthdays?.length ?? 0],
        ],
      },
      {
        group: 'Activity',
        route: '/superadmin/audit',
        icon: 'history',
        metrics: [
          ['Recent Events', stats?.systemActivity ?? 0],
          ['Latest Actions', stats?.recentActivity?.length ?? 0],
        ],
      },
    ];
  });
  readonly orderHighlights = computed(() => [
    {
      label: 'Orders Today',
      value: this.orderStats()?.ordersToday ?? 0,
      detail: 'Fresh order intake today.',
      icon: 'today',
      tone: '',
    },
    {
      label: 'Orders This Month',
      value: this.orderStats()?.ordersThisMonth ?? 0,
      detail: 'Monthly order volume.',
      icon: 'calendar_month',
      tone: '',
    },
    {
      label: 'Pending Placement',
      value: this.orderStats()?.pendingPlacement ?? 0,
      detail: 'Orders still waiting for supplier placement.',
      icon: 'schedule',
      tone: 'stat-card__icon--warning',
    },
    {
      label: 'Delivered Orders',
      value: this.orderStats()?.deliveredOrders ?? 0,
      detail: 'Orders marked delivered.',
      icon: 'inventory',
      tone: 'stat-card__icon--success',
    },
    {
      label: 'Issue Orders',
      value: this.orderStats()?.issueOrders ?? 0,
      detail: 'Orders currently in issue state.',
      icon: 'priority_high',
      tone: 'stat-card__icon--danger',
    },
    {
      label: 'Order Profit',
      value: `$${(this.orderStats()?.totalProfit ?? 0).toFixed(2)}`,
      detail: 'Profit across all linked orders.',
      icon: 'attach_money',
      tone: 'stat-card__icon--success',
    },
    {
      label: 'Average Order ROI',
      value: `${(this.orderStats()?.averageRoi ?? 0).toFixed(2)}%`,
      detail: 'Average ROI from order performance.',
      icon: 'insights',
      tone: '',
    },
  ]);
  readonly hrHighlights = computed(() => [
    {
      label: 'Employees',
      value: this.hrStats()?.totalEmployees ?? 0,
      detail: 'Employee profiles across the workspace.',
      icon: 'badge',
      tone: '',
    },
    {
      label: 'Present Today',
      value: this.hrStats()?.presentToday ?? 0,
      detail: 'Daily attendance already captured.',
      icon: 'event_available',
      tone: 'stat-card__icon--success',
    },
    {
      label: 'Pending Leaves',
      value: this.hrStats()?.pendingLeaves ?? 0,
      detail: 'Leave approvals still waiting.',
      icon: 'event_busy',
      tone: 'stat-card__icon--warning',
    },
    {
      label: 'Monthly Salary Cost',
      value: `$${(this.hrStats()?.monthlySalaryCost ?? 0).toFixed(2)}`,
      detail: 'Current salary obligation for active staff.',
      icon: 'payments',
      tone: 'stat-card__icon--warning',
    },
  ]);

  constructor(
    private readonly adminApi: AdminService,
    private readonly hrApi: HrApiService,
  ) {}

  ngOnInit(): void {
    this.applyPreset('month');
  }

  applyPreset(range: DashboardRangePreset): void {
    this.selectedRange.set(range);

    if (range === 'custom') {
      return;
    }

    this.loadStats(this.getPresetFilters(range));
  }

  applyCustomRange(): void {
    if (this.customRangeForm.invalid) {
      this.customRangeForm.markAllAsTouched();
      return;
    }

    this.selectedRange.set('custom');
    this.loadStats(this.customRangeForm.getRawValue());
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

  private loadStats(filters: { from?: string; to?: string }): void {
    this.loading.set(true);
    this.error.set('');

    forkJoin({
      stats: this.adminApi.getSuperAdminStats(filters),
      hr: this.hrApi.getDashboard(filters),
    }).subscribe({
      next: ({ stats, hr }) => {
        this.stats.set(stats);
        this.hrStats.set(hr);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load Super Admin dashboard stats.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  private getPresetFilters(range: Exclude<DashboardRangePreset, 'custom'>): { from: string; to: string } {
    const today = new Date();

    switch (range) {
      case 'today':
        return { from: this.toDateInput(today), to: this.toDateInput(today) };
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        return { from: this.toDateInput(yesterday), to: this.toDateInput(yesterday) };
      }
      case 'week': {
        const start = new Date(today);
        start.setDate(today.getDate() - 6);
        return { from: this.toDateInput(start), to: this.toDateInput(today) };
      }
      case 'month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: this.toDateInput(start), to: this.toDateInput(today) };
      }
      case 'year': {
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
