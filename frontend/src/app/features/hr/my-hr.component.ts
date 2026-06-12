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
  readonly savingProfile = signal(false);
  readonly error = signal('');
  readonly profile = signal<MyHrProfile | null>(null);
  readonly profileForm = new FormGroup({
    phone: new FormControl('', { nonNullable: true }),
    dateOfBirth: new FormControl('', { nonNullable: true }),
    nationalId: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true }),
    emergencyContact: new FormControl('', { nonNullable: true }),
    paymentMethod: new FormControl('', { nonNullable: true }),
    bankName: new FormControl('', { nonNullable: true }),
    bankAccount: new FormControl('', { nonNullable: true }),
  });

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
        this.profileForm.patchValue(
          {
            phone: profile.employee.phone || '',
            dateOfBirth: profile.employee.dateOfBirth ? profile.employee.dateOfBirth.slice(0, 10) : '',
            nationalId: profile.employee.nationalId || '',
            address: profile.employee.address || '',
            emergencyContact: profile.employee.emergencyContact || '',
            paymentMethod: profile.employee.paymentMethod || '',
            bankName: String(profile.employee.bankDetails?.['bankName'] || ''),
            bankAccount: String(profile.employee.bankDetails?.['accountNumber'] || ''),
          },
          { emitEvent: false },
        );
        this.loading.set(false);
      },
      error: (error) => {
        if (error?.status === 404) {
          this.profile.set(null);
          this.error.set('');
          this.loading.set(false);
          return;
        }

        this.error.set(error?.error?.message || 'Could not load your HR profile.');
        this.loading.set(false);
      },
    });
  }

  saveProfile(): void {
    const profile = this.profile();

    if (!profile || this.savingProfile()) {
      return;
    }

    this.savingProfile.set(true);
    this.hrApi
      .updateMyProfile({
        phone: this.profileForm.controls.phone.value,
        dateOfBirth: this.profileForm.controls.dateOfBirth.value || null,
        nationalId: this.profileForm.controls.nationalId.value,
        address: this.profileForm.controls.address.value,
        emergencyContact: this.profileForm.controls.emergencyContact.value,
        paymentMethod: this.profileForm.controls.paymentMethod.value,
        bankDetails: {
          bankName: this.profileForm.controls.bankName.value,
          accountNumber: this.profileForm.controls.bankAccount.value,
        },
      })
      .subscribe({
        next: (nextProfile) => {
          this.profile.set(nextProfile);
          this.toast.success('Profile update submitted for HR review.');
          this.savingProfile.set(false);
        },
        error: (error) => {
          this.toast.error(error?.error?.message || 'Could not update your profile.');
          this.savingProfile.set(false);
        },
      });
  }

  dismissBirthdayModal(): void {
    if (this.savingProfile()) {
      return;
    }

    this.savingProfile.set(true);
    this.hrApi.markBirthdayPopupShown().subscribe({
      next: (nextProfile) => {
        this.profile.set(nextProfile);
        this.savingProfile.set(false);
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not update birthday acknowledgment.');
        this.savingProfile.set(false);
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

  canEditProfile(): boolean {
    const profile = this.profile();
    return Boolean(
      profile &&
        profile.allowEmployeeProfileEditing &&
        !profile.employee.profileLocked &&
        !this.savingProfile(),
    );
  }
}
