import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { HrApiService } from '../../core/api/hr-api.service';
import { AttendanceEntry, EmployeeProfile } from '../../core/models/hr.models';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-hr-attendance',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './hr-attendance.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrAttendanceComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly rows = signal<AttendanceEntry[]>([]);
  readonly employees = signal<EmployeeProfile[]>([]);
  readonly selectedRow = signal<AttendanceEntry | null>(null);
  readonly bulkSelectedEmployeeIds = signal<string[]>([]);
  readonly page = signal(1);
  readonly limit = signal(30);
  readonly total = signal(0);

  readonly search = new FormControl('', { nonNullable: true });
  readonly employeeId = new FormControl('', { nonNullable: true });
  readonly status = new FormControl('', { nonNullable: true });
  readonly dateFrom = new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true });
  readonly dateTo = new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true });

  readonly attendanceForm = new FormGroup({
    employeeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    date: new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true, validators: [Validators.required] }),
    status: new FormControl('PRESENT', { nonNullable: true, validators: [Validators.required] }),
    checkInTime: new FormControl('', { nonNullable: true }),
    checkOutTime: new FormControl('', { nonNullable: true }),
    lateMinutes: new FormControl(0, { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });
  readonly bulkAttendanceForm = new FormGroup({
    date: new FormControl(new Date().toISOString().slice(0, 10), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    status: new FormControl('PRESENT', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    checkInTime: new FormControl('', { nonNullable: true }),
    checkOutTime: new FormControl('', { nonNullable: true }),
    lateMinutes: new FormControl(0, { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });
  readonly allEmployeesSelected = computed(
    () => this.employees().length > 0 && this.bulkSelectedEmployeeIds().length === this.employees().length,
  );

  readonly pageLabel = computed(() => {
    const total = this.total();
    if (!total) {
      return 'No attendance rows to show';
    }
    const start = (this.page() - 1) * this.limit() + 1;
    const end = Math.min(total, start + this.rows().length - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  ngOnInit(): void {
    this.loadEmployees();
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadAttendance(1));
    this.loadAttendance();
  }

  loadEmployees(): void {
    this.hrApi.listEmployees({ limit: 100 }).subscribe({
      next: (result) => this.employees.set(result.items),
      error: () => undefined,
    });
  }

  loadAttendance(page = this.page()): void {
    this.loading.set(true);
    this.error.set('');
    this.hrApi
      .listAttendance({
        page,
        limit: this.limit(),
        search: this.search.value,
        employeeId: this.employeeId.value,
        status: this.status.value,
        dateFrom: this.dateFrom.value,
        dateTo: this.dateTo.value,
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
          this.error.set(error?.error?.message || 'Could not load attendance.');
          this.loading.set(false);
        },
      });
  }

  selectRow(row: AttendanceEntry): void {
    this.selectedRow.set(row);
    this.attendanceForm.reset({
      employeeId: row.employeeId,
      date: row.date.slice(0, 10),
      status: row.status,
      checkInTime: row.checkInTime || '',
      checkOutTime: row.checkOutTime || '',
      lateMinutes: row.lateMinutes || 0,
      notes: row.notes || '',
    });
  }

  resetForm(): void {
    this.selectedRow.set(null);
    this.attendanceForm.reset({
      employeeId: '',
      date: new Date().toISOString().slice(0, 10),
      status: 'PRESENT',
      checkInTime: '',
      checkOutTime: '',
      lateMinutes: 0,
      notes: '',
    });
  }

  toggleBulkEmployee(employeeId: string, checked: boolean): void {
    const next = new Set(this.bulkSelectedEmployeeIds());

    if (checked) {
      next.add(employeeId);
    } else {
      next.delete(employeeId);
    }

    this.bulkSelectedEmployeeIds.set([...next]);
  }

  toggleAllEmployees(checked: boolean): void {
    this.bulkSelectedEmployeeIds.set(checked ? this.employees().map((employee) => employee.id) : []);
  }

  clearBulkSelection(): void {
    this.bulkSelectedEmployeeIds.set([]);
  }

  saveBulkAttendance(): void {
    if (this.bulkAttendanceForm.invalid || this.saving() || !this.bulkSelectedEmployeeIds().length) {
      this.bulkAttendanceForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);

    const raw = this.bulkAttendanceForm.getRawValue();
    const rows = this.bulkSelectedEmployeeIds().map((employeeId) => ({
      employeeId,
      date: raw.date,
      status: raw.status,
      checkInTime: raw.checkInTime || null,
      checkOutTime: raw.checkOutTime || null,
      lateMinutes: raw.lateMinutes || 0,
      notes: raw.notes || null,
    }));

    this.hrApi.bulkAttendance(rows).subscribe({
      next: (result) => {
        this.toast.success(`Marked attendance for ${result.processed} employee(s).`);
        this.saving.set(false);
        this.loadAttendance(this.page());
        this.clearBulkSelection();
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not bulk mark attendance.');
        this.saving.set(false);
      },
    });
  }

  saveAttendance(): void {
    if (this.attendanceForm.invalid || this.saving()) {
      this.attendanceForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const payload = this.attendanceForm.getRawValue();
    const request$ = this.selectedRow()
      ? this.hrApi.updateAttendance(this.selectedRow()!.id, payload)
      : this.hrApi.markAttendance(payload);

    request$.subscribe({
      next: () => {
        this.toast.success(this.selectedRow() ? 'Attendance updated.' : 'Attendance marked.');
        this.saving.set(false);
        this.loadAttendance(this.page());
        if (!this.selectedRow()) {
          this.resetForm();
        }
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not save attendance.');
        this.saving.set(false);
      },
    });
  }

  previousPage(): void {
    this.loadAttendance(Math.max(this.page() - 1, 1));
  }

  nextPage(): void {
    this.loadAttendance(this.page() + 1);
  }
}
