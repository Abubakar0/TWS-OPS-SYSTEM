import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { forkJoin } from 'rxjs';

import { User, userHasRole } from '../../core/models/auth.models';
import { OrderStats } from '../../core/models/order.models';
import { ProductCategory } from '../../core/models/product.models';
import { OrderApiService } from '../../core/api/order-api.service';
import { AdminService, AdminStats } from '../../core/services/admin.service';
import { ExportService } from '../../core/services/export.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { ToastService } from '../../core/ui/toast.service';
import { FilterPanelComponent } from '../../shared/ui/filter-panel.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../shared/ui/searchable-select.component';

type ReportRangePreset = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
type AdminReportSection =
  | 'daily'
  | 'account'
  | 'hunter'
  | 'lister'
  | 'order-hunter'
  | 'hunter-account'
  | 'order-account';

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
  selector: 'app-admin-reports',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    FilterPanelComponent,
    SearchableSelectComponent,
  ],
  templateUrl: './admin-reports.component.html',
  styleUrl: './admin-reports.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsComponent implements OnInit {
  readonly users = signal<User[]>([]);
  readonly categories = signal<ProductCategory[]>([]);
  readonly stats = signal<AdminStats | null>(null);
  readonly orderReports = signal<OrderStats | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedRange = signal<ReportRangePreset>('monthly');
  readonly activeSection = signal<AdminReportSection>('daily');
  readonly activeDateFilters = signal<{ from?: string; to?: string }>({});
  private readonly destroyRef = inject(DestroyRef);

  readonly reportUsers = computed(() => this.users().filter((user) => !userHasRole(user, 'admin')));
  readonly userOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All hunters and listers', description: 'Show every report operator in this view.' },
    ...this.reportUsers().map((user) => ({
      value: user.id,
      label: user.name,
      description: user.roles.join(', '),
    })),
  ]);
  readonly categoryOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All categories', description: 'Keep every product category in scope.' },
    ...this.categories().map((category) => ({
      value: category.name,
      label: category.name,
    })),
  ]);
  readonly sectionOptions: Array<{ id: AdminReportSection; label: string; hint: string }> = [
    { id: 'daily', label: 'Daily summary', hint: 'Daily hunted, listed, and rejected output.' },
    { id: 'account', label: 'Products by account', hint: 'Listing distribution by account.' },
    { id: 'hunter', label: 'By hunter', hint: 'Hunter hunted versus listed output.' },
    { id: 'lister', label: 'By lister', hint: 'Lister coverage and listing volume.' },
    { id: 'order-hunter', label: 'Orders by hunter', hint: 'Order volume, revenue, and profit by hunter.' },
    { id: 'hunter-account', label: 'Hunter listings by account', hint: 'Where hunter products are landing.' },
    { id: 'order-account', label: 'Orders by account', hint: 'Revenue and profit split by account.' },
  ];
  readonly activeSectionMeta = computed(() => {
    const section = this.sectionOptions.find((option) => option.id === this.activeSection()) || this.sectionOptions[0];
    return {
      ...section,
      count: this.sectionCount(section.id),
    };
  });

  readonly filtersForm = new FormGroup({
    userId: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
  });

  readonly customRangeForm = new FormGroup(
    {
      from: new FormControl('', { nonNullable: true }),
      to: new FormControl('', { nonNullable: true }),
    },
    { validators: [customDateRangeValidator] },
  );

  readonly rangeButtons: Array<{ key: ReportRangePreset; label: string }> = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
    { key: 'custom', label: 'Custom Range' },
  ];

  constructor(
    private readonly adminApi: AdminService,
    private readonly orderApi: OrderApiService,
    private readonly exportService: ExportService,
    private readonly referenceData: ReferenceDataService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.referenceData
      .getUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => this.users.set(users),
        error: (error) => this.error.set(error?.error?.message || 'Could not load users.'),
      });

    this.referenceData
      .getProductCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (categories) => this.categories.set(categories),
      });

    this.applyPreset('monthly');
  }

  applyPreset(range: ReportRangePreset): void {
    this.selectedRange.set(range);

    if (range === 'custom') {
      return;
    }

    const dateFilters = this.getPresetFilters(range);
    this.activeDateFilters.set(dateFilters);
    this.loadStats(dateFilters);
  }

  applyCustomRange(): void {
    if (this.customRangeForm.invalid) {
      this.customRangeForm.markAllAsTouched();
      return;
    }

    const dateFilters = this.customRangeForm.getRawValue();
    this.selectedRange.set('custom');
    this.activeDateFilters.set(dateFilters);
    this.loadStats(dateFilters);
  }

  applyUserFilter(): void {
    this.loadStats(this.activeDateFilters());
  }

  resetFilters(): void {
    this.filtersForm.reset(
      {
        userId: '',
        category: '',
      },
      { emitEvent: false },
    );

    if (this.selectedRange() === 'custom') {
      this.customRangeForm.reset(
        {
          from: '',
          to: '',
        },
        { emitEvent: false },
      );
    }

    this.applyPreset(this.selectedRange() === 'custom' ? 'monthly' : this.selectedRange());
  }

  exportReport(): void {
    const stats = this.stats();

    if (!stats) {
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const rows = [
      { section: 'Summary', name: 'Hunted', hunted: stats.hunted, listed: '', extra: '' },
      { section: 'Summary', name: 'Ready', hunted: stats.ready, listed: '', extra: '' },
      { section: 'Summary', name: 'Rejected', hunted: stats.rejected, listed: '', extra: '' },
      { section: 'Summary', name: 'Listed', hunted: stats.listed, listed: '', extra: '' },
      { section: 'Summary', name: 'Hunters', hunted: stats.byHunter.length, listed: '', extra: '' },
      { section: 'Summary', name: 'Accounts Used', hunted: stats.byAccount.length, listed: '', extra: '' },
      { section: 'Orders', name: 'Total Orders', hunted: this.orderReports()?.totalOrders ?? 0, listed: '', extra: '' },
      { section: 'Orders', name: 'Revenue', hunted: this.orderReports()?.totalRevenue ?? 0, listed: '', extra: '' },
      { section: 'Orders', name: 'Profit', hunted: this.orderReports()?.totalProfit ?? 0, listed: '', extra: '' },
      { section: 'Orders', name: 'Average ROI', hunted: this.orderReports()?.averageRoi ?? 0, listed: '', extra: '' },
      ...stats.byHunter.map((row) => ({
        section: 'Hunter',
        name: row.name,
        hunted: row.hunted,
        listed: row.listed,
        extra: '',
      })),
      ...stats.byLister.map((row) => ({
        section: 'Lister',
        name: row.name,
        hunted: row.assignedHunters,
        listed: row.listed,
        extra: `Rejected ${row.rejected}`,
      })),
      ...stats.byAccount.map((row) => ({
        section: 'Account',
        name: row.name,
        hunted: '',
        listed: row.listed,
        extra: '',
      })),
      ...stats.byHunterAccount.map((row) => ({
        section: 'Hunter Account',
        name: `${row.hunterName} -> ${row.accountName}`,
        hunted: '',
        listed: row.listedCount,
        extra: '',
      })),
    ];

    this.exportService.exportAsExcelTable({
      filename: `admin-reports-${dateStamp}.xlsx`,
      sheetName: 'Admin Reports',
      rows,
      columns: [
        { header: 'Section', value: (row) => row.section },
        { header: 'Name', value: (row) => row.name },
        { header: 'Metric A', value: (row) => row.hunted },
        { header: 'Metric B', value: (row) => row.listed },
        { header: 'Notes', value: (row) => row.extra },
      ],
    });
    this.toast.success('Report exported.');
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

  focusSection(section: AdminReportSection): void {
    this.activeSection.set(section);
    queueMicrotask(() => {
      document.getElementById(this.sectionDomId(section))?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  isSectionFocused(section: AdminReportSection): boolean {
    return this.activeSection() === section;
  }

  private loadStats(dateFilters: { from?: string; to?: string }): void {
    this.loading.set(true);
    this.error.set('');
    const filters = this.buildApiFilters(dateFilters);

    forkJoin({
      stats: this.adminApi.getAdminStats(filters),
      orderReports: this.orderApi.getReports(filters),
    }).subscribe({
      next: ({ stats, orderReports }) => {
        this.stats.set(stats);
        this.orderReports.set(orderReports);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load reports.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  private buildApiFilters(dateFilters: { from?: string; to?: string }) {
    const selectedUser = this.reportUsers().find((user) => user.id === this.filtersForm.controls.userId.value);
    return {
      from: dateFilters.from,
      to: dateFilters.to,
      hunterId: selectedUser && userHasRole(selectedUser, 'hunter') ? selectedUser.id : undefined,
      listerId: selectedUser && userHasRole(selectedUser, 'lister') ? selectedUser.id : undefined,
      category: this.filtersForm.controls.category.value || undefined,
    };
  }

  private getPresetFilters(range: Exclude<ReportRangePreset, 'custom'>): { from: string; to: string } {
    const today = new Date();

    switch (range) {
      case 'daily':
        return { from: this.toDateInput(today), to: this.toDateInput(today) };
      case 'weekly': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 6);
        return { from: this.toDateInput(weekStart), to: this.toDateInput(today) };
      }
      case 'monthly': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: this.toDateInput(start), to: this.toDateInput(today) };
      }
      case 'yearly': {
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

  private sectionDomId(section: AdminReportSection): string {
    return `admin-report-${section}`;
  }

  private sectionCount(section: AdminReportSection): number {
    switch (section) {
      case 'daily':
        return this.stats()?.daily?.length || 0;
      case 'account':
        return this.stats()?.byAccount?.length || 0;
      case 'hunter':
        return this.stats()?.byHunter?.length || 0;
      case 'lister':
        return this.stats()?.byLister?.length || 0;
      case 'order-hunter':
        return this.orderReports()?.byHunter?.length || 0;
      case 'hunter-account':
        return this.stats()?.byHunterAccount?.length || 0;
      case 'order-account':
        return this.orderReports()?.byAccount?.length || 0;
    }
  }
}
