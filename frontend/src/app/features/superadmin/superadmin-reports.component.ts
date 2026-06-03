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

type ReportRangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

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
  selector: 'app-superadmin-reports',
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
  ],
  templateUrl: './superadmin-reports.component.html',
  styleUrl: './superadmin-reports.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminReportsComponent implements OnInit {
  readonly users = signal<User[]>([]);
  readonly categories = signal<ProductCategory[]>([]);
  readonly stats = signal<AdminStats | null>(null);
  readonly orderReports = signal<OrderStats | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedRange = signal<ReportRangePreset>('month');
  readonly activeDateFilters = signal<{ from?: string; to?: string }>({});
  private readonly destroyRef = inject(DestroyRef);

  readonly reportUsers = computed(() => this.users().filter((user) => !userHasRole(user, 'super_admin')));

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
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
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

    this.applyPreset('month');
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

    this.applyPreset(this.selectedRange() === 'custom' ? 'month' : this.selectedRange());
  }

  exportExcel(): void {
    const stats = this.stats();

    if (!stats) {
      return;
    }

    const rows = this.buildExportRows(stats);
    const dateStamp = new Date().toISOString().slice(0, 10);

    this.exportService.exportAsExcelTable({
      filename: `superadmin-reports-${dateStamp}.xlsx`,
      sheetName: 'Super Admin Reports',
      rows,
      columns: [
        { header: 'Section', value: (row) => row.section },
        { header: 'Name', value: (row) => row.name },
        { header: 'Metric A', value: (row) => row.metricA },
        { header: 'Metric B', value: (row) => row.metricB },
        { header: 'Notes', value: (row) => row.notes },
      ],
    });
    this.toast.success('Report exported to Excel.');
  }

  exportCsv(): void {
    const stats = this.stats();

    if (!stats) {
      return;
    }

    const rows = this.buildExportRows(stats);
    const dateStamp = new Date().toISOString().slice(0, 10);

    this.exportService.exportAsCsv({
      filename: `superadmin-reports-${dateStamp}.csv`,
      rows,
      columns: [
        { header: 'Section', value: (row) => row.section },
        { header: 'Name', value: (row) => row.name },
        { header: 'Metric A', value: (row) => row.metricA },
        { header: 'Metric B', value: (row) => row.metricB },
        { header: 'Notes', value: (row) => row.notes },
      ],
    });
    this.toast.success('Report exported to CSV.');
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
        this.error.set(error?.error?.message || 'Could not load Super Admin reports.');
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

  private buildExportRows(stats: AdminStats) {
    return [
      { section: 'Summary', name: 'Hunted', metricA: stats.hunted, metricB: '', notes: '' },
      { section: 'Summary', name: 'Ready', metricA: stats.ready, metricB: '', notes: '' },
      { section: 'Summary', name: 'Rejected', metricA: stats.rejected, metricB: '', notes: '' },
      { section: 'Summary', name: 'Listed', metricA: stats.listed, metricB: '', notes: '' },
      { section: 'Summary', name: 'Hunters', metricA: stats.byHunter.length, metricB: '', notes: '' },
      { section: 'Summary', name: 'Accounts Used', metricA: stats.byAccount.length, metricB: '', notes: '' },
      { section: 'Orders', name: 'Total Orders', metricA: this.orderReports()?.totalOrders ?? 0, metricB: '', notes: '' },
      { section: 'Orders', name: 'Revenue', metricA: this.orderReports()?.totalRevenue ?? 0, metricB: '', notes: '' },
      { section: 'Orders', name: 'Profit', metricA: this.orderReports()?.totalProfit ?? 0, metricB: '', notes: '' },
      { section: 'Orders', name: 'Average ROI', metricA: this.orderReports()?.averageRoi ?? 0, metricB: '', notes: '' },
      ...stats.byHunter.map((row) => ({
        section: 'Hunter',
        name: row.name,
        metricA: row.hunted,
        metricB: row.listed,
        notes: '',
      })),
      ...stats.byLister.map((row) => ({
        section: 'Lister',
        name: row.name,
        metricA: row.assignedHunters,
        metricB: row.listed,
        notes: `Rejected ${row.rejected ?? 0}`,
      })),
      ...stats.byAccount.map((row) => ({
        section: 'Account',
        name: row.name,
        metricA: '',
        metricB: row.listed,
        notes: '',
      })),
      ...stats.byHunterAccount.map((row) => ({
        section: 'Hunter Account',
        name: `${row.hunterName} -> ${row.accountName}`,
        metricA: '',
        metricB: row.listedCount,
        notes: '',
      })),
    ];
  }

  private toDateInput(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
