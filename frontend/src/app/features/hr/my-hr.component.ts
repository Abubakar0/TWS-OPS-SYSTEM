import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { HrApiService } from '../../core/api/hr-api.service';
import { MyHrProfile } from '../../core/models/hr.models';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-my-hr',
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
  templateUrl: './my-hr.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyHrComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly savingLeave = signal(false);
  readonly savingExpense = signal(false);
  readonly error = signal('');
  readonly profile = signal<MyHrProfile | null>(null);

  readonly leaveForm = new FormGroup({
    leaveType: new FormControl('ANNUAL', { nonNullable: true, validators: [Validators.required] }),
    startDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    endDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl('', { nonNullable: true }),
  });

  readonly expenseForm = new FormGroup({
    category: new FormControl('SOFTWARE', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    expenseDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    receiptUrl: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.hrApi.getMyHr().subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load your HR profile.');
        this.loading.set(false);
      },
    });
  }

  submitLeave(): void {
    if (this.leaveForm.invalid || this.savingLeave()) {
      this.leaveForm.markAllAsTouched();
      return;
    }
    this.savingLeave.set(true);
    this.hrApi.createLeave(this.leaveForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success('Leave request submitted.');
        this.savingLeave.set(false);
        this.leaveForm.reset({
          leaveType: 'ANNUAL',
          startDate: '',
          endDate: '',
          reason: '',
        });
        this.load();
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not submit leave request.');
        this.savingLeave.set(false);
      },
    });
  }

  submitExpense(): void {
    if (this.expenseForm.invalid || this.savingExpense()) {
      this.expenseForm.markAllAsTouched();
      return;
    }
    this.savingExpense.set(true);
    this.hrApi.createExpense(this.expenseForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success('Expense submitted.');
        this.savingExpense.set(false);
        this.expenseForm.reset({
          category: 'SOFTWARE',
          title: '',
          amount: 0,
          expenseDate: '',
          description: '',
          receiptUrl: '',
        });
        this.load();
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not submit expense.');
        this.savingExpense.set(false);
      },
    });
  }
}
