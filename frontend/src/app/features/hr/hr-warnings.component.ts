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
import { EmployeeProfile, WarningRecord } from '../../core/models/hr.models';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-hr-warnings',
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
  templateUrl: './hr-warnings.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrWarningsComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly rows = signal<WarningRecord[]>([]);
  readonly employees = signal<EmployeeProfile[]>([]);
  readonly page = signal(1);
  readonly limit = signal(30);
  readonly total = signal(0);

  readonly employeeFilter = new FormControl('', { nonNullable: true });
  readonly warningTypeFilter = new FormControl('', { nonNullable: true });

  readonly warningForm = new FormGroup({
    employeeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    warningType: new FormControl('VERBAL', { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    details: new FormControl('', { nonNullable: true }),
    employeeResponse: new FormControl('', { nonNullable: true }),
    attachmentUrl: new FormControl('', { nonNullable: true }),
  });

  readonly pageLabel = computed(() => {
    const total = this.total();
    if (!total) {
      return 'No warnings to show';
    }
    const start = (this.page() - 1) * this.limit() + 1;
    const end = Math.min(total, start + this.rows().length - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  ngOnInit(): void {
    this.loadEmployees();
    this.loadWarnings();
  }

  loadEmployees(): void {
    this.hrApi.listEmployees({ limit: 100 }).subscribe({
      next: (result) => this.employees.set(result.items),
      error: () => undefined,
    });
  }

  loadWarnings(page = this.page()): void {
    this.loading.set(true);
    this.error.set('');
    this.hrApi
      .listWarnings({
        page,
        limit: this.limit(),
        employeeId: this.employeeFilter.value,
        warningType: this.warningTypeFilter.value,
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
          this.error.set(error?.error?.message || 'Could not load warnings.');
          this.loading.set(false);
        },
      });
  }

  resetForm(): void {
    this.warningForm.reset({
      employeeId: '',
      warningType: 'VERBAL',
      reason: '',
      details: '',
      employeeResponse: '',
      attachmentUrl: '',
    });
  }

  createWarning(): void {
    if (this.warningForm.invalid || this.saving()) {
      this.warningForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.hrApi.createWarning(this.warningForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success('Warning issued.');
        this.saving.set(false);
        this.resetForm();
        this.loadWarnings(1);
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not issue warning.');
        this.saving.set(false);
      },
    });
  }

  previousPage(): void {
    this.loadWarnings(Math.max(this.page() - 1, 1));
  }

  nextPage(): void {
    this.loadWarnings(this.page() + 1);
  }
}
