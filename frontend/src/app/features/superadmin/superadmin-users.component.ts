import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';

import { User, userHasRole } from '../../core/models/auth.models';
import { AdminService } from '../../core/services/admin.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-superadmin-users',
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
  templateUrl: './superadmin-users.component.html',
  styleUrl: './superadmin-users.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminUsersComponent implements OnInit {
  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly includeDeleted = signal(true);
  readonly searchTerm = signal('');
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly destroyRef = inject(DestroyRef);

  readonly visibleUsers = computed(() =>
    this.users().filter((user) => userHasRole(user, 'hunter') || userHasRole(user, 'lister')),
  );
  readonly hunterCount = computed(() => this.visibleUsers().filter((user) => userHasRole(user, 'hunter')).length);
  readonly listerCount = computed(() => this.visibleUsers().filter((user) => userHasRole(user, 'lister')).length);
  readonly deletedCount = computed(() => this.visibleUsers().filter((user) => Boolean(user.deletedAt)).length);

  constructor(
    private readonly adminApi: AdminService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.searchTerm.set(value.trim());
        this.loadUsers();
      });
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi
      .listUsers(undefined, {
        search: this.searchTerm(),
        includeDeleted: this.includeDeleted(),
      })
      .subscribe({
        next: (users) => this.users.set(users),
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load users.');
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
  }

  toggleDeletedVisibility(): void {
    this.includeDeleted.update((value) => !value);
    this.loadUsers();
  }

  async toggleUser(user: User): Promise<void> {
    if (user.deletedAt) {
      return;
    }

    if (user.isActive) {
      let warning = `${user.name} will not be able to sign in until unlocked.`;

      if (userHasRole(user, 'hunter')) {
        try {
          const details = await firstValueFrom(this.adminApi.getUserDetails(user.id));
          const ownedProducts = details.stats.hunter?.currentOwnedProducts ?? 0;

          if (ownedProducts > 0) {
            warning = `${user.name} currently owns ${ownedProducts} active product${ownedProducts === 1 ? '' : 's'}. Transfer ownership before disabling this hunter to avoid blocking product workflows.`;
          }
        } catch {
          warning = `${warning} Product ownership details could not be loaded right now.`;
        }
      }

      const confirmed = await this.confirm.ask({
        title: 'Disable user?',
        message: warning,
        confirmText: 'Disable',
        tone: 'danger',
      });

      if (!confirmed) {
        return;
      }
    }

    this.adminApi.updateUser(user.id, { isActive: !user.isActive }).subscribe({
      next: () => {
        this.afterUserMutation(user.isActive ? 'User disabled.' : 'User enabled.');
      },
      error: (error) => (this.error.set(error?.error?.message || 'Could not update user status.')),
    });
  }

  async resetPassword(user: User): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Reset password?',
      message: `${user.name}'s password will be reset to the temporary default password.`,
      confirmText: 'Reset',
    });

    if (!confirmed) {
      return;
    }

    this.adminApi.resetUserPassword(user.id).subscribe({
      next: () => this.toast.success('User password reset.'),
      error: (error) => (this.error.set(error?.error?.message || 'Could not reset password.')),
    });
  }

  async softDelete(user: User): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Soft delete user?',
      message: `${user.name} will be hidden from active workflows until restored.`,
      confirmText: 'Delete',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.adminApi.deleteUser(user.id).subscribe({
      next: () => this.afterUserMutation('User archived.'),
      error: (error) => (this.error.set(error?.error?.message || 'Could not archive user.')),
    });
  }

  restore(user: User): void {
    this.adminApi.restoreUser(user.id).subscribe({
      next: () => this.afterUserMutation('User restored.'),
      error: (error) => (this.error.set(error?.error?.message || 'Could not restore user.')),
    });
  }

  unlock(user: User): void {
    this.adminApi.unlockUser(user.id).subscribe({
      next: () => this.afterUserMutation('User unlocked.'),
      error: (error) => (this.error.set(error?.error?.message || 'Could not unlock user.')),
    });
  }

  private afterUserMutation(message: string): void {
    this.referenceData.refreshUsers();
    this.workspaceSync.notifyUsersChanged();
    this.toast.success(message);
    this.loadUsers();
  }
}
