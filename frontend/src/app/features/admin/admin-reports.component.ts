import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { User } from '../../core/models/auth.models';
import { AdminService, AdminStats } from '../../core/services/admin.service';
import { ExportService } from '../../core/services/export.service';

type ReportRangePreset = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

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
  ],
  templateUrl: './admin-reports.component.html',
  styleUrl: './admin-reports.component.scss',
})
export class AdminReportsComponent implements OnInit {
  readonly users = signal<User[]>([]);
  readonly stats = signal<AdminStats | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedRange = signal<ReportRangePreset>('monthly');
  readonly activeDateFilters = signal<{ from?: string; to?: string }>({});

  readonly reportUsers = computed(() => this.users().filter((user) => user.role !== 'admin'));

  readonly filtersForm = new FormGroup({
    userId: new FormControl('', { nonNullable: true }),
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
    private readonly exportService: ExportService,
  ) {}

  ngOnInit(): void {
    this.adminApi.listUsers().subscribe({
      next: (users) => this.users.set(users),
      error: (error) => this.error.set(error?.error?.message || 'Could not load users.'),
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
      { section: 'Summary', name: 'Average ROI', hunted: stats.averageRoi, listed: '', extra: '%' },
      { section: 'Summary', name: 'Total Profit', hunted: stats.totalProfit, listed: '', extra: '' },
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
        extra: 'Assigned Hunters',
      })),
      ...stats.byAccount.map((row) => ({
        section: 'Account',
        name: row.name,
        hunted: '',
        listed: row.listed,
        extra: '',
      })),
    ];

    this.exportService.exportAsExcelTable({
      filename: `admin-reports-${dateStamp}.xls`,
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

    this.adminApi.getAdminStats(this.buildApiFilters(dateFilters)).subscribe({
      next: (stats) => this.stats.set(stats),
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
      hunterId: selectedUser?.role === 'hunter' ? selectedUser.id : undefined,
      listerId: selectedUser?.role === 'lister' ? selectedUser.id : undefined,
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
}
