import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { HrApiService } from '../../core/api/hr-api.service';
import { EmployeeProfile } from '../../core/models/hr.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-hr-employees',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './hr-employees.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrEmployeesComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);
  private readonly referenceData = inject(ReferenceDataService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly employees = signal<EmployeeProfile[]>([]);
  readonly selectedEmployee = signal<EmployeeProfile | null>(null);
  readonly page = signal(1);
  readonly limit = signal(30);
  readonly total = signal(0);
  readonly search = new FormControl('', { nonNullable: true });
  readonly department = new FormControl('', { nonNullable: true });
  readonly status = new FormControl('', { nonNullable: true });
  readonly users = signal<{ id: string; name: string; email: string }[]>([]);
  readonly availableUsers = computed(() => {
    const linkedUserIds = new Set(this.employees().map((employee) => employee.userId));
    const selectedUserId = this.selectedEmployee()?.userId;

    return this.users().filter((user) => user.id === selectedUserId || !linkedUserIds.has(user.id));
  });
  readonly employeeForm = new FormGroup({
    userId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    employeeCode: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true }),
    nationalId: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true }),
    emergencyContact: new FormControl('', { nonNullable: true }),
    department: new FormControl('', { nonNullable: true }),
    designation: new FormControl('', { nonNullable: true }),
    managerUserId: new FormControl('', { nonNullable: true }),
    joiningDate: new FormControl('', { nonNullable: true }),
    employmentType: new FormControl('FULL_TIME', { nonNullable: true }),
    employmentStatus: new FormControl('ACTIVE', { nonNullable: true }),
    basicSalary: new FormControl(0, { nonNullable: true }),
    allowances: new FormControl(0, { nonNullable: true }),
    defaultDeductions: new FormControl(0, { nonNullable: true }),
    paymentMethod: new FormControl('', { nonNullable: true }),
    bankName: new FormControl('', { nonNullable: true }),
    bankAccount: new FormControl('', { nonNullable: true }),
  });

  readonly pageLabel = computed(() => {
    const total = this.total();

    if (!total) {
      return 'No employees to show';
    }

    const start = (this.page() - 1) * this.limit() + 1;
    const end = Math.min(total, start + this.employees().length - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  ngOnInit(): void {
    this.referenceData
      .getUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) => {
        this.users.set(users.map((user) => ({ id: user.id, name: user.name, email: user.email })));
      });

    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadEmployees(1));

    this.department.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadEmployees(1));
    this.status.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadEmployees(1));

    this.loadEmployees();
  }

  loadEmployees(page = this.page()): void {
    this.loading.set(true);
    this.error.set('');
    this.hrApi
      .listEmployees({
        page,
        limit: this.limit(),
        search: this.search.value,
        department: this.department.value,
        status: this.status.value,
      })
      .subscribe({
        next: (result) => {
          this.employees.set(result.items);
          this.page.set(result.page);
          this.limit.set(result.limit);
          this.total.set(result.total);
          if (result.items.length && !this.selectedEmployee()) {
            this.selectedEmployee.set(result.items[0]);
          }
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load employees.');
          this.loading.set(false);
        },
      });
  }

  selectEmployee(employee: EmployeeProfile): void {
    this.selectedEmployee.set(employee);
    this.employeeForm.reset({
      userId: employee.userId,
      employeeCode: employee.employeeCode || '',
      phone: employee.phone || '',
      nationalId: employee.nationalId || '',
      address: employee.address || '',
      emergencyContact: employee.emergencyContact || '',
      department: employee.department || '',
      designation: employee.designation || '',
      managerUserId: employee.managerUserId || '',
      joiningDate: employee.joiningDate ? employee.joiningDate.slice(0, 10) : '',
      employmentType: employee.employmentType || 'FULL_TIME',
      employmentStatus: employee.employmentStatus || 'ACTIVE',
      basicSalary: employee.basicSalary || 0,
      allowances: employee.allowances || 0,
      defaultDeductions: employee.defaultDeductions || 0,
      paymentMethod: employee.paymentMethod || '',
      bankName: String(employee.bankDetails?.['bankName'] || ''),
      bankAccount: String(employee.bankDetails?.['accountNumber'] || ''),
    });
  }

  resetForm(): void {
    this.selectedEmployee.set(null);
    this.employeeForm.reset({
      userId: '',
      employeeCode: '',
      phone: '',
      nationalId: '',
      address: '',
      emergencyContact: '',
      department: '',
      designation: '',
      managerUserId: '',
      joiningDate: '',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      basicSalary: 0,
      allowances: 0,
      defaultDeductions: 0,
      paymentMethod: '',
      bankName: '',
      bankAccount: '',
    });
  }

  saveEmployee(): void {
    if (this.employeeForm.invalid || this.saving()) {
      this.employeeForm.markAllAsTouched();
      return;
    }

    const raw = this.employeeForm.getRawValue();
    const payload = {
      ...raw,
      managerUserId: raw.managerUserId || null,
      bankDetails: {
        bankName: raw.bankName || null,
        accountNumber: raw.bankAccount || null,
      },
    };

    this.saving.set(true);
    const request$ = this.selectedEmployee()
      ? this.hrApi.updateEmployee(this.selectedEmployee()!.id, payload)
      : this.hrApi.createEmployee(payload);

    request$.subscribe({
      next: (employee) => {
        this.toast.success(this.selectedEmployee() ? 'Employee updated.' : 'Employee created.');
        this.saving.set(false);
        this.loadEmployees(this.page());
        if (employee) {
          this.selectEmployee(employee);
        } else {
          this.resetForm();
        }
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not save employee profile.');
        this.saving.set(false);
      },
    });
  }

  previousPage(): void {
    this.loadEmployees(Math.max(this.page() - 1, 1));
  }

  nextPage(): void {
    this.loadEmployees(this.page() + 1);
  }
}
