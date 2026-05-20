import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/auth.models';
import { AdminService } from '../../core/services/admin.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-superadmin-admins',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './superadmin-admins.component.html',
  styleUrl: './superadmin-admins.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminAdminsComponent implements OnInit {
  readonly admins = signal<User[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly searchTerm = signal('');
  readonly destroyRef = inject(DestroyRef);

  readonly activeAdmins = computed(() => this.admins().filter((user) => user.isActive).length);
  readonly disabledAdmins = computed(() => this.admins().filter((user) => !user.isActive).length);

  readonly adminForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('Password123!', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  constructor(
    private readonly adminApi: AdminService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.searchTerm.set(value.trim());
        this.loadAdmins();
      });
  }

  ngOnInit(): void {
    this.loadAdmins();
  }

  loadAdmins(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.listUsers('admin', { search: this.searchTerm() }).subscribe({
      next: (users) => this.admins.set(users),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load admin users.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  createAdmin(): void {
    if (this.adminForm.invalid || this.saving()) {
      this.adminForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.adminApi
      .createUser({
        ...this.adminForm.getRawValue(),
        role: 'admin',
      })
      .subscribe({
        next: () => {
          this.adminForm.reset({
            name: '',
            email: '',
            password: 'Password123!',
            isActive: true,
          });
          this.referenceData.refreshUsers();
          this.workspaceSync.notifyUsersChanged();
          this.toast.success('Admin created.');
          this.loadAdmins();
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not create admin.');
          this.saving.set(false);
        },
        complete: () => this.saving.set(false),
      });
  }

  async toggleAdmin(user: User): Promise<void> {
    if (user.isActive) {
      const confirmed = await this.confirm.ask({
        title: 'Disable admin?',
        message: `${user.name} will no longer be able to sign in until re-enabled.`,
        confirmText: 'Disable',
        tone: 'danger',
      });

      if (!confirmed) {
        return;
      }
    }

    this.adminApi.updateUser(user.id, { isActive: !user.isActive }).subscribe({
      next: () => {
        this.referenceData.refreshUsers();
        this.workspaceSync.notifyUsersChanged();
        this.toast.success(user.isActive ? 'Admin disabled.' : 'Admin enabled.');
        this.loadAdmins();
      },
      error: (error) => (this.error.set(error?.error?.message || 'Could not update admin status.')),
    });
  }

  async resetPassword(user: User): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Reset password?',
      message: `${user.name}'s password will be reset to the temporary default password.`,
      confirmText: 'Reset password',
    });

    if (!confirmed) {
      return;
    }

    this.adminApi.resetUserPassword(user.id).subscribe({
      next: () => this.toast.success('Admin password reset.'),
      error: (error) => (this.error.set(error?.error?.message || 'Could not reset password.')),
    });
  }

  async impersonate(user: User): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Impersonate admin?',
      message: `You will temporarily switch into ${user.name}'s admin session.`,
      confirmText: 'Impersonate',
    });

    if (!confirmed) {
      return;
    }

    this.adminApi.impersonateUser(user.id).subscribe({
      next: (session) => {
        this.auth.acceptSession(session);
        this.toast.info('Impersonation is active.');
        void this.router.navigateByUrl('/admin/dashboard');
      },
      error: (error) => (this.error.set(error?.error?.message || 'Could not start impersonation.')),
    });
  }
}
