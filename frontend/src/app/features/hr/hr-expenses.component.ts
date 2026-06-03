import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { HrApiService } from '../../core/api/hr-api.service';
import { EmployeeProfile, ExpenseRecord } from '../../core/models/hr.models';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-hr-expenses',
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
  templateUrl: './hr-expenses.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrExpensesComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly rows = signal<ExpenseRecord[]>([]);
  readonly employees = signal<EmployeeProfile[]>([]);
  readonly selectedRow = signal<ExpenseRecord | null>(null);
  readonly page = signal(1);
  readonly limit = signal(30);
  readonly total = signal(0);

  readonly employeeFilter = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl('', { nonNullable: true });
  readonly categoryFilter = new FormControl('', { nonNullable: true });

  readonly expenseForm = new FormGroup({
    employeeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl('SOFTWARE', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    amount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    expenseDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    receiptUrl: new FormControl('', { nonNullable: true }),
  });

  readonly pageLabel = computed(() => {
    const total = this.total();
    if (!total) {
      return 'No expenses to show';
    }
    const start = (this.page() - 1) * this.limit() + 1;
    const end = Math.min(total, start + this.rows().length - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  ngOnInit(): void {
    this.loadEmployees();
    this.loadExpenses();
  }

  loadEmployees(): void {
    this.hrApi.listEmployees({ limit: 100 }).subscribe({
      next: (result) => this.employees.set(result.items),
      error: () => undefined,
    });
  }

  loadExpenses(page = this.page()): void {
    this.loading.set(true);
    this.error.set('');
    this.hrApi
      .listExpenses({
        page,
        limit: this.limit(),
        employeeId: this.employeeFilter.value,
        status: this.statusFilter.value,
        category: this.categoryFilter.value,
      })
      .subscribe({
        next: (result) => {
          this.rows.set(result.items);
          this.page.set(result.page);
          this.limit.set(result.limit);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load expenses.');
          this.loading.set(false);
        },
      });
  }

  selectRow(row: ExpenseRecord): void {
    this.selectedRow.set(row);
  }

  resetForm(): void {
    this.selectedRow.set(null);
    this.expenseForm.reset({
      employeeId: '',
      category: 'SOFTWARE',
      title: '',
      description: '',
      amount: 0,
      expenseDate: '',
      receiptUrl: '',
    });
  }

  createExpense(): void {
    if (this.expenseForm.invalid || this.saving()) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.hrApi.createExpense(this.expenseForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success('Expense submitted.');
        this.saving.set(false);
        this.resetForm();
        this.loadExpenses(1);
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not submit expense.');
        this.saving.set(false);
      },
    });
  }

  approveSelected(): void {
    if (!this.selectedRow()) {
      return;
    }
    this.hrApi.approveExpense(this.selectedRow()!.id).subscribe({
      next: () => {
        this.toast.success('Expense approved.');
        this.loadExpenses(this.page());
      },
      error: (error) => this.toast.error(error?.error?.message || 'Could not approve expense.'),
    });
  }

  rejectSelected(): void {
    if (!this.selectedRow()) {
      return;
    }
    this.hrApi.rejectExpense(this.selectedRow()!.id).subscribe({
      next: () => {
        this.toast.success('Expense rejected.');
        this.loadExpenses(this.page());
      },
      error: (error) => this.toast.error(error?.error?.message || 'Could not reject expense.'),
    });
  }

  markPaidSelected(): void {
    if (!this.selectedRow()) {
      return;
    }
    this.hrApi.markExpensePaid(this.selectedRow()!.id).subscribe({
      next: () => {
        this.toast.success('Expense marked as paid.');
        this.loadExpenses(this.page());
      },
      error: (error) => this.toast.error(error?.error?.message || 'Could not mark expense paid.'),
    });
  }

  previousPage(): void {
    this.loadExpenses(Math.max(this.page() - 1, 1));
  }

  nextPage(): void {
    this.loadExpenses(this.page() + 1);
  }
}
