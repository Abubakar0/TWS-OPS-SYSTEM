import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { AuthApiService } from '../../core/api/auth-api.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <section class="page-shell">
      <article class="surface-card password-card">
        <div class="surface-card__header">
          <div>
            <h1>Change Password</h1>
            <p>Update your workspace password without affecting the rest of your profile.</p>
          </div>
        </div>

        <form class="form-grid" [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline" class="field-span-2">
            <mat-label>Current password</mat-label>
            <input
              matInput
              [type]="currentPasswordHidden() ? 'password' : 'text'"
              formControlName="currentPassword"
              autocomplete="current-password"
            />
            <button
              mat-icon-button
              matSuffix
              type="button"
              (click)="currentPasswordHidden.set(!currentPasswordHidden())"
              [attr.aria-label]="currentPasswordHidden() ? 'Show current password' : 'Hide current password'"
            >
              <mat-icon>{{ currentPasswordHidden() ? 'visibility' : 'visibility_off' }}</mat-icon>
            </button>
            @if (form.controls.currentPassword.touched && form.controls.currentPassword.hasError('required')) {
              <mat-error>Current password is required.</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>New password</mat-label>
            <input
              matInput
              [type]="newPasswordHidden() ? 'password' : 'text'"
              formControlName="newPassword"
              autocomplete="new-password"
            />
            <button
              mat-icon-button
              matSuffix
              type="button"
              (click)="newPasswordHidden.set(!newPasswordHidden())"
              [attr.aria-label]="newPasswordHidden() ? 'Show new password' : 'Hide new password'"
            >
              <mat-icon>{{ newPasswordHidden() ? 'visibility' : 'visibility_off' }}</mat-icon>
            </button>
            <mat-hint>Minimum 8 characters.</mat-hint>
            @if (form.controls.newPassword.touched && form.controls.newPassword.hasError('required')) {
              <mat-error>New password is required.</mat-error>
            } @else if (form.controls.newPassword.touched && form.controls.newPassword.hasError('minlength')) {
              <mat-error>New password must be at least 8 characters.</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Confirm new password</mat-label>
            <input
              matInput
              [type]="confirmPasswordHidden() ? 'password' : 'text'"
              formControlName="confirmPassword"
              autocomplete="new-password"
            />
            <button
              mat-icon-button
              matSuffix
              type="button"
              (click)="confirmPasswordHidden.set(!confirmPasswordHidden())"
              [attr.aria-label]="confirmPasswordHidden() ? 'Show confirm password' : 'Hide confirm password'"
            >
              <mat-icon>{{ confirmPasswordHidden() ? 'visibility' : 'visibility_off' }}</mat-icon>
            </button>
            @if (form.controls.confirmPassword.touched && form.controls.confirmPassword.hasError('required')) {
              <mat-error>Confirm your new password.</mat-error>
            } @else if (form.touched && form.hasError('passwordMismatch')) {
              <mat-error>Confirm password must match the new password.</mat-error>
            }
          </mat-form-field>

          <div class="field-span-2 modal-actions">
            <button mat-stroked-button type="button" (click)="reset()">Reset</button>
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
              <mat-icon>{{ saving() ? 'hourglass_top' : 'lock_reset' }}</mat-icon>
              <span>{{ saving() ? 'Saving' : 'Change Password' }}</span>
            </button>
          </div>
        </form>
      </article>
    </section>
  `,
  styles: `
    .password-card {
      max-width: 760px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly currentPasswordHidden = signal(true);
  readonly newPasswordHidden = signal(true);
  readonly confirmPasswordHidden = signal(true);
  readonly form = new FormGroup(
    {
      currentPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      newPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    {
      validators: (group) =>
        group.get('newPassword')?.value === group.get('confirmPassword')?.value
          ? null
          : { passwordMismatch: true },
    },
  );

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    this.saving.set(true);

    this.authApi
      .changePassword(raw.currentPassword, raw.newPassword)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.toast.success('Password updated.');
          this.reset();
        },
        error: (error) => {
          this.toast.error(error?.error?.message || 'Could not change password.');
        },
      });
  }

  reset(): void {
    this.form.reset(
      {
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      },
      { emitEvent: false },
    );
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}
