import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { HrApiService } from '../../core/api/hr-api.service';
import { EmployeeProfile, PayrollRecord } from '../../core/models/hr.models';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

const toLocalDateInput = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Component({
  selector: 'app-hr-payroll',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './hr-payroll.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrPayrollComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly rows = signal<PayrollRecord[]>([]);
  readonly employees = signal<EmployeeProfile[]>([]);
  readonly selectedRow = signal<PayrollRecord | null>(null);
  readonly page = signal(1);
  readonly limit = signal(30);
  readonly total = signal(0);

  readonly employeeFilter = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl('', { nonNullable: true });
  readonly payrollMonthFilter = new FormControl('', { nonNullable: true });

  readonly payrollForm = new FormGroup({
    employeeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    payrollMonth: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    basicSalary: new FormControl(0, { nonNullable: true }),
    allowances: new FormControl(0, { nonNullable: true }),
    bonuses: new FormControl(0, { nonNullable: true }),
    deductions: new FormControl(0, { nonNullable: true }),
    advances: new FormControl(0, { nonNullable: true }),
    unpaidLeaveDeduction: new FormControl(0, { nonNullable: true }),
    lateDeduction: new FormControl(0, { nonNullable: true }),
  });

  readonly pageLabel = computed(() => {
    const total = this.total();
    if (!total) {
      return 'No payroll rows to show';
    }
    const start = (this.page() - 1) * this.limit() + 1;
    const end = Math.min(total, start + this.rows().length - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  ngOnInit(): void {
    this.loadEmployees();
    this.payrollMonthFilter.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadPayroll(1));
    this.loadPayroll();
  }

  loadEmployees(): void {
    this.hrApi.listEmployees({ limit: 100, activeOnly: true, excludeSuperAdmin: true }).subscribe({
      next: (result) => this.employees.set(result.items),
      error: () => undefined,
    });
  }

  loadPayroll(page = this.page()): void {
    this.loading.set(true);
    this.error.set('');
    this.hrApi
      .listPayroll({
        page,
        limit: this.limit(),
        employeeId: this.employeeFilter.value,
        status: this.statusFilter.value,
        payrollMonth: this.payrollMonthFilter.value,
      })
      .subscribe({
        next: (result) => {
          this.rows.set(result.items);
          this.page.set(result.page);
          this.limit.set(result.limit);
          this.total.set(result.total);
          if (this.selectedRow()) {
            const match = result.items.find((item) => item.id === this.selectedRow()?.id);
            this.selectedRow.set(match || null);
          }
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load payroll.');
          this.loading.set(false);
        },
      });
  }

  selectRow(row: PayrollRecord): void {
    this.selectedRow.set(row);
    this.payrollForm.reset({
      employeeId: row.employeeId,
      payrollMonth: row.payrollMonth.slice(0, 10),
      basicSalary: row.basicSalary,
      allowances: row.allowances,
      bonuses: row.bonuses,
      deductions: row.deductions,
      advances: row.advances,
      unpaidLeaveDeduction: row.unpaidLeaveDeduction,
      lateDeduction: row.lateDeduction,
    });
  }

  resetForm(): void {
    this.selectedRow.set(null);
    this.payrollForm.reset({
      employeeId: '',
      payrollMonth: '',
      basicSalary: 0,
      allowances: 0,
      bonuses: 0,
      deductions: 0,
      advances: 0,
      unpaidLeaveDeduction: 0,
      lateDeduction: 0,
    });
  }

  applyDatePreset(preset: 'today' | 'yesterday'): void {
    const target = new Date();

    if (preset === 'yesterday') {
      target.setDate(target.getDate() - 1);
    }

    this.payrollMonthFilter.setValue(toLocalDateInput(target));
    this.loadPayroll(1);
  }

  savePayroll(): void {
    if (this.payrollForm.invalid || this.saving()) {
      this.payrollForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const payload = this.payrollForm.getRawValue();
    const request$ = this.selectedRow()
      ? this.hrApi.updatePayroll(this.selectedRow()!.id, payload)
      : this.hrApi.generatePayroll(payload);

    request$.subscribe({
      next: () => {
        this.toast.success(this.selectedRow() ? 'Payroll updated.' : 'Payroll generated.');
        this.saving.set(false);
        this.loadPayroll(this.page());
        if (!this.selectedRow()) {
          this.resetForm();
        }
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not save payroll.');
        this.saving.set(false);
      },
    });
  }

  approveSelected(): void {
    if (!this.selectedRow()) {
      return;
    }
    this.hrApi.approvePayroll(this.selectedRow()!.id).subscribe({
      next: () => {
        this.toast.success('Payroll approved.');
        this.loadPayroll(this.page());
      },
      error: (error) => this.toast.error(error?.error?.message || 'Could not approve payroll.'),
    });
  }

  markPaidSelected(): void {
    if (!this.selectedRow()) {
      return;
    }
    this.hrApi.markPayrollPaid(this.selectedRow()!.id).subscribe({
      next: () => {
        this.toast.success('Payroll marked as paid.');
        this.loadPayroll(this.page());
      },
      error: (error) => this.toast.error(error?.error?.message || 'Could not mark payroll paid.'),
    });
  }

  previousPage(): void {
    this.loadPayroll(Math.max(this.page() - 1, 1));
  }

  nextPage(): void {
    this.loadPayroll(this.page() + 1);
  }
}
