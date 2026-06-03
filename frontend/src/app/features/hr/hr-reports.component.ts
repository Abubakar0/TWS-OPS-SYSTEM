import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { HrApiService } from '../../core/api/hr-api.service';
import { AttendanceEntry, EmployeeProfile, ExpenseRecord, HrPerformanceRow, HrReport, PayrollRecord } from '../../core/models/hr.models';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-hr-reports',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './hr-reports.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrReportsComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly employees = signal<EmployeeProfile[]>([]);
  readonly attendanceReport = signal<HrReport<AttendanceEntry> | null>(null);
  readonly payrollReport = signal<HrReport<PayrollRecord> | null>(null);
  readonly expenseReport = signal<HrReport<ExpenseRecord> | null>(null);
  readonly performanceRows = signal<HrPerformanceRow[]>([]);

  readonly employeeId = new FormControl('', { nonNullable: true });
  readonly dateFrom = new FormControl('', { nonNullable: true });
  readonly dateTo = new FormControl('', { nonNullable: true });

  ngOnInit(): void {
    this.hrApi.listEmployees({ limit: 100 }).subscribe({
      next: (result) => this.employees.set(result.items),
      error: () => undefined,
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const filters = {
      employeeId: this.employeeId.value,
      dateFrom: this.dateFrom.value,
      dateTo: this.dateTo.value,
    };

    forkJoin({
      attendance: this.hrApi.getAttendanceReport(filters),
      payroll: this.hrApi.getPayrollReport(filters),
      expenses: this.hrApi.getExpenseReport(filters),
      performance: this.hrApi.getPerformanceReport(),
    }).subscribe({
      next: (result) => {
        this.attendanceReport.set(result.attendance);
        this.payrollReport.set(result.payroll);
        this.expenseReport.set(result.expenses);
        this.performanceRows.set(result.performance);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load HR reports.');
        this.loading.set(false);
      },
    });
  }

  asNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value || 0);
  }
}
