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
import { EmployeeProfile, LeaveRequest } from '../../core/models/hr.models';
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
  selector: 'app-hr-leaves',
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
  templateUrl: './hr-leaves.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrLeavesComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly leaves = signal<LeaveRequest[]>([]);
  readonly employees = signal<EmployeeProfile[]>([]);
  readonly selectedLeave = signal<LeaveRequest | null>(null);
  readonly page = signal(1);
  readonly limit = signal(30);
  readonly total = signal(0);

  readonly employeeFilter = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl('', { nonNullable: true });
  readonly leaveTypeFilter = new FormControl('', { nonNullable: true });
  readonly dateFrom = new FormControl('', { nonNullable: true });
  readonly dateTo = new FormControl('', { nonNullable: true });
  readonly reviewNotes = new FormControl('', { nonNullable: true });

  readonly leaveForm = new FormGroup({
    employeeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    leaveType: new FormControl('ANNUAL', { nonNullable: true, validators: [Validators.required] }),
    startDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    endDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl('', { nonNullable: true }),
  });

  readonly pageLabel = computed(() => {
    const total = this.total();
    if (!total) {
      return 'No leave requests to show';
    }
    const start = (this.page() - 1) * this.limit() + 1;
    const end = Math.min(total, start + this.leaves().length - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  ngOnInit(): void {
    this.loadEmployees();
    this.statusFilter.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadLeaves(1));
    this.loadLeaves();
  }

  loadEmployees(): void {
    this.hrApi.listEmployees({ limit: 100, activeOnly: true, excludeSuperAdmin: true }).subscribe({
      next: (result) => this.employees.set(result.items),
      error: () => undefined,
    });
  }

  loadLeaves(page = this.page()): void {
    this.loading.set(true);
    this.error.set('');
    this.hrApi
      .listLeaves({
        page,
        limit: this.limit(),
        employeeId: this.employeeFilter.value,
        status: this.statusFilter.value,
        leaveType: this.leaveTypeFilter.value,
        dateFrom: this.dateFrom.value,
        dateTo: this.dateTo.value,
      })
      .subscribe({
        next: (result) => {
          this.leaves.set(result.items);
          this.page.set(result.page);
          this.limit.set(result.limit);
          this.total.set(result.total);
          if (this.selectedLeave()) {
            const match = result.items.find((item) => item.id === this.selectedLeave()?.id);
            this.selectedLeave.set(match || null);
          }
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load leave requests.');
          this.loading.set(false);
        },
      });
  }

  selectLeave(leave: LeaveRequest): void {
    this.selectedLeave.set(leave);
    this.reviewNotes.setValue(leave.reviewNotes || '');
  }

  resetForm(): void {
    this.leaveForm.reset({
      employeeId: '',
      leaveType: 'ANNUAL',
      startDate: '',
      endDate: '',
      reason: '',
    });
    this.selectedLeave.set(null);
    this.reviewNotes.setValue('');
  }

  applyDatePreset(preset: 'today' | 'yesterday'): void {
    const target = new Date();

    if (preset === 'yesterday') {
      target.setDate(target.getDate() - 1);
    }

    const date = toLocalDateInput(target);
    this.dateFrom.setValue(date);
    this.dateTo.setValue(date);
    this.loadLeaves(1);
  }

  createLeave(): void {
    if (this.leaveForm.invalid || this.saving()) {
      this.leaveForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.hrApi.createLeave(this.leaveForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success('Leave request created.');
        this.saving.set(false);
        this.resetForm();
        this.loadLeaves(1);
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not create leave request.');
        this.saving.set(false);
      },
    });
  }

  approveSelected(): void {
    if (!this.selectedLeave()) {
      return;
    }
    this.hrApi.approveLeave(this.selectedLeave()!.id, this.reviewNotes.value).subscribe({
      next: () => {
        this.toast.success('Leave request approved.');
        this.loadLeaves(this.page());
      },
      error: (error) => this.toast.error(error?.error?.message || 'Could not approve leave request.'),
    });
  }

  rejectSelected(): void {
    if (!this.selectedLeave()) {
      return;
    }
    this.hrApi.rejectLeave(this.selectedLeave()!.id, this.reviewNotes.value).subscribe({
      next: () => {
        this.toast.success('Leave request rejected.');
        this.loadLeaves(this.page());
      },
      error: (error) => this.toast.error(error?.error?.message || 'Could not reject leave request.'),
    });
  }

  cancelSelected(): void {
    if (!this.selectedLeave()) {
      return;
    }
    this.hrApi.cancelLeave(this.selectedLeave()!.id).subscribe({
      next: () => {
        this.toast.success('Leave request cancelled.');
        this.loadLeaves(this.page());
      },
      error: (error) => this.toast.error(error?.error?.message || 'Could not cancel leave request.'),
    });
  }

  previousPage(): void {
    this.loadLeaves(Math.max(this.page() - 1, 1));
  }

  nextPage(): void {
    this.loadLeaves(this.page() + 1);
  }
}
