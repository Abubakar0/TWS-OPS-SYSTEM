import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize, firstValueFrom } from 'rxjs';

import { AdminApiService } from '../api/admin-api.service';
import { AuthService } from '../auth/auth.service';
import { ADMIN_MANAGED_ROLES, SUPER_ADMIN_MANAGED_ROLES } from '../config/roles';
import { SEARCH_DEBOUNCE_MS } from '../config/validation';
import {
  User,
  UserPermissions,
  UserRole,
  userHasRole,
  userHasAnyRole,
} from '../models/auth.models';
import { ExportService } from '../services/export.service';
import { mapUserRow } from '../mappers/user-row.mapper';
import { ReferenceDataService } from '../state/reference-data.service';
import { WorkspaceSyncService } from '../state/workspace-sync.service';
import { ConfirmService } from '../ui/confirm.service';
import { ToastService } from '../ui/toast.service';
import { ValidationMessageService } from '../ui/validation-message.service';
import { createUserForm } from '../../shared/forms/user.form';
import { GridSortState, paginateRecords, sortRecords } from '../../shared/grid/grid.utils';

const buildPermissions = (overrides: Partial<UserPermissions> = {}): UserPermissions => ({
  canManageAdmins: Boolean(overrides.canManageAdmins),
  canManageUsers: Boolean(overrides.canManageUsers),
  canViewReports: Boolean(overrides.canViewReports),
  canExportReports: Boolean(overrides.canExportReports),
  canManageSettings: Boolean(overrides.canManageSettings),
  canManageHr: Boolean(overrides.canManageHr),
  canViewPayroll: Boolean(overrides.canViewPayroll),
  canProcessOrders: Boolean(overrides.canProcessOrders),
  canViewAllOrders: Boolean(overrides.canViewAllOrders),
  canViewLogs: Boolean(overrides.canViewLogs),
  canImpersonate: Boolean(overrides.canImpersonate),
  canDeleteUsers: Boolean(overrides.canDeleteUsers),
  canRestoreRecords: Boolean(overrides.canRestoreRecords),
});

@Injectable()
export class AdminFacade {
  readonly pageSizeOptions = [8, 16, 32];
  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly searchTerm = signal('');
  readonly roleFilter = signal<UserRole | 'all'>('all');
  readonly statusFilter = signal<'all' | 'active' | 'disabled'>('all');
  readonly sortState = signal<GridSortState>({ active: 'name', direction: 'asc' });
  readonly pageIndex = signal(0);
  readonly pageSize = signal(this.pageSizeOptions[0]);
  readonly userModalOpen = signal(false);
  readonly editingUser = signal<User | null>(null);
  readonly passwordHidden = signal(true);
  readonly importingUsers = signal(false);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly userForm = createUserForm();
  readonly roleFilterControl = new FormControl<UserRole | 'all'>('all', { nonNullable: true });
  readonly statusFilterControl = new FormControl<'all' | 'active' | 'disabled'>('all', {
    nonNullable: true,
  });

  readonly adminCount = computed(
    () => this.users().filter((user) => userHasRole(user, 'admin')).length,
  );
  readonly hrCount = computed(() => this.users().filter((user) => userHasRole(user, 'hr')).length);
  readonly hunterCount = computed(
    () => this.users().filter((user) => userHasRole(user, 'hunter')).length,
  );
  readonly listerCount = computed(
    () => this.users().filter((user) => userHasRole(user, 'lister')).length,
  );
  readonly orderProcessorCount = computed(
    () => this.users().filter((user) => userHasRole(user, 'order_processor')).length,
  );
  readonly activeCount = computed(() => this.users().filter((user) => user.isActive).length);
  readonly disabledCount = computed(() => this.users().filter((user) => !user.isActive).length);
  readonly availableRoles = computed<UserRole[]>(() =>
    userHasRole(this.auth.currentUser(), 'super_admin')
      ? [...SUPER_ADMIN_MANAGED_ROLES]
      : [...ADMIN_MANAGED_ROLES],
  );
  readonly isEditing = computed(() => Boolean(this.editingUser()));
  readonly filteredUsers = computed(() => {
    const term = this.searchTerm();
    const role = this.roleFilter();
    const status = this.statusFilter();
    const filtered = this.users().filter((user) => {
      const matchesRole = role === 'all' ? true : userHasRole(user, role);
      const matchesStatus =
        status === 'all' ? true : status === 'active' ? user.isActive : !user.isActive;

      if (!term) {
        return matchesRole && matchesStatus;
      }

      return (
        matchesRole &&
        matchesStatus &&
        [
          user.name,
          user.email,
          ...(user.roles || [user.role]),
          user.isActive ? 'enabled' : 'disabled',
        ].some((value) => value.toLowerCase().includes(term))
      );
    });

    return sortRecords(filtered, this.sortState(), (user, key) => {
      switch (key) {
        case 'email':
          return user.email.toLowerCase();
        case 'role':
          return (user.roles || [user.role]).join(', ');
        case 'status':
          return user.isActive ? 'enabled' : 'disabled';
        case 'name':
        default:
          return user.name.toLowerCase();
      }
    });
  });
  readonly userRows = computed(() =>
    this.filteredUsers().map((user) => mapUserRow(user, this.auth.currentUser()?.role)),
  );
  readonly pagedUserRows = computed(() =>
    paginateRecords(this.userRows(), this.pageIndex(), this.pageSize()),
  );
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.userRows().length / this.pageSize())),
  );
  readonly pageLabel = computed(() => {
    const total = this.userRows().length;

    if (!total) {
      return 'No users to show';
    }

    const start = this.pageIndex() * this.pageSize() + 1;
    const end = Math.min(total, start + this.pageSize() - 1);
    return `Showing ${start}-${end} of ${total}`;
  });
  readonly formErrors = computed(() => ({
    name: this.messages.userFieldError(
      this.userForm.controls.name,
      this.userForm.controls.name.touched || this.userForm.controls.name.dirty,
    ),
    email: this.messages.userFieldError(
      this.userForm.controls.email,
      this.userForm.controls.email.touched || this.userForm.controls.email.dirty,
    ),
    password: this.messages.userFieldError(
      this.userForm.controls.password,
      this.userForm.controls.password.touched || this.userForm.controls.password.dirty,
    ),
    roles: this.userForm.controls.roles.hasError('required')
      ? 'Select at least one role.'
      : this.userForm.controls.roles.hasError('invalidCombination')
        ? 'Admin and Super Admin cannot be assigned together.'
        : '',
  }));

  private readonly destroyRef = inject(DestroyRef);
  private usersSubscribed = false;

  constructor(
    private readonly adminApi: AdminApiService,
    private readonly auth: AuthService,
    private readonly exportService: ExportService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly messages: ValidationMessageService,
  ) {
    this.initialize();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set('');

    if (!this.usersSubscribed) {
      this.usersSubscribed = true;

      this.referenceData
        .getUsers()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (users) => {
            this.users.set(users);
            this.pageIndex.set(0);
            this.loading.set(false);
          },
          error: (error) => {
            this.error.set(error?.error?.message || 'Could not load users.');
            this.loading.set(false);
          },
        });
      return;
    }

    this.referenceData.refreshUsers();
  }

  openCreateModal(): void {
    this.editingUser.set(null);
    this.passwordHidden.set(true);
    this.userForm.reset({
      name: '',
      email: '',
      password: '',
      roles: ['hunter'],
      isActive: true,
      canProcessOrders: false,
      canViewAllOrders: false,
    });
    this.userForm.controls.password.setValidators([Validators.required, Validators.minLength(8)]);
    this.userForm.controls.password.updateValueAndValidity({ emitEvent: false });
    this.userModalOpen.set(true);
  }

  openEditModal(user: User): void {
    this.editingUser.set(user);
    this.passwordHidden.set(true);
    this.userForm.reset({
      name: user.name,
      email: user.email,
      password: '',
      roles: user.roles?.length ? [...user.roles] : [user.role],
      isActive: user.isActive,
      canProcessOrders: Boolean(user.permissions?.canProcessOrders),
      canViewAllOrders: Boolean(user.permissions?.canViewAllOrders),
    });
    this.userForm.controls.password.setValidators([Validators.minLength(8)]);
    this.userForm.controls.password.updateValueAndValidity({ emitEvent: false });
    this.userModalOpen.set(true);
  }

  closeUserModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.userModalOpen.set(false);
    this.editingUser.set(null);
    this.passwordHidden.set(true);
    this.userForm.reset({
      name: '',
      email: '',
      password: '',
      roles: ['hunter'],
      isActive: true,
      canProcessOrders: false,
      canViewAllOrders: false,
    });
  }

  submitUserForm(): void {
    if (this.userForm.invalid || this.saving()) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const raw = this.userForm.getRawValue();
    const editingUser = this.editingUser();

    if (!editingUser) {
      this.adminApi
        .createUser({
          ...raw,
          password: raw.password || 'Password123!',
          permissions: {
            canProcessOrders: raw.canProcessOrders,
            canViewAllOrders: raw.canViewAllOrders,
          },
        })
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.referenceData.refreshUsers();
            this.workspaceSync.notifyUsersChanged();
            this.toast.success('User created.');
            this.closeUserModal(true);
          },
          error: (error) => {
            this.error.set(error?.error?.message || 'Could not create user.');
          },
        });
      return;
    }

    const payload: Partial<User> & { password?: string } = {
      name: raw.name,
      email: raw.email,
      role: raw.roles[0],
      roles: raw.roles,
      isActive: raw.isActive,
      permissions: buildPermissions({
        ...editingUser.permissions,
        canProcessOrders: raw.canProcessOrders,
        canViewAllOrders: raw.canViewAllOrders,
      }),
    };

    if (raw.password.trim()) {
      payload.password = raw.password.trim();
    }

    this.adminApi
      .updateUser(editingUser.id, payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.referenceData.refreshUsers();
          this.workspaceSync.notifyUsersChanged();
          this.toast.success('User updated.');
          this.closeUserModal(true);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not update user.');
        },
      });
  }

  async toggleUser(row: ReturnType<typeof mapUserRow>): Promise<void> {
    const user = row.user;

    if (user.isActive) {
      const confirmed = await this.confirm.ask({
        title: 'Disable user?',
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
        this.toast.success(user.isActive ? 'User disabled.' : 'User enabled.');
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not update user status.'),
    });
  }

  async resetPassword(row: ReturnType<typeof mapUserRow>): Promise<void> {
    const user = row.user;
    const confirmed = await this.confirm.ask({
      title: 'Reset password?',
      message: `${user.name} will get the temporary default password.`,
      confirmText: 'Reset password',
    });

    if (!confirmed) {
      return;
    }

    this.adminApi.resetUserPassword(user.id).subscribe({
      next: () => this.toast.success('Password reset.'),
      error: (error) => this.error.set(error?.error?.message || 'Could not reset password.'),
    });
  }

  exportUsers(): void {
    const dateStamp = new Date().toLocaleDateString('en-CA');
    this.exportService.exportAsExcelTable({
      filename: `admin-users-${dateStamp}.xlsx`,
      sheetName: 'Users',
      rows: this.filteredUsers(),
      columns: [
        { header: 'Name', value: (user) => user.name },
        { header: 'Email', value: (user) => user.email },
        {
          header: 'Roles',
          value: (user) => (user.roles?.length ? user.roles.join(', ') : user.role),
        },
        { header: 'Status', value: (user) => (user.isActive ? 'Enabled' : 'Disabled') },
      ],
    });
    this.toast.success('User list exported.');
  }

  downloadUserTemplate(): void {
    this.exportService.exportAsExcelTable({
      filename: 'user-import-template.xlsx',
      sheetName: 'Users',
      rows: [{}],
      columns: [
        { header: 'Name', value: () => '' },
        { header: 'Email', value: () => '' },
        { header: 'Password', value: () => '' },
        { header: 'Roles', value: () => '' },
        { header: 'Active', value: () => '' },
        { header: 'Can Process Orders', value: () => '' },
        { header: 'Can View All Orders', value: () => '' },
      ],
    });

    this.toast.success('User import template downloaded.');
  }

  async importUsersFromInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file || this.importingUsers()) {
      if (input) {
        input.value = '';
      }
      return;
    }

    this.importingUsers.set(true);

    try {
      const rows = await this.exportService.parseExcelRows(file);

      if (!rows.length) {
        this.toast.warning('The selected file does not contain any user rows.');
        return;
      }

      const result = await firstValueFrom(this.adminApi.bulkImportUsers(rows));

      this.referenceData.refreshUsers();
      this.workspaceSync.notifyUsersChanged();

      if (result.summary.failed > 0) {
        const preview = result.errors
          .slice(0, 3)
          .map((error) => `Row ${error.row}: ${error.message}`)
          .join(' ');
        this.toast.warning(
          `Imported ${result.summary.created} user(s). ${result.summary.failed} row(s) need attention. ${preview}`,
        );
      } else {
        this.toast.success(`Imported ${result.summary.created} user(s).`);
      }
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'error' in error
          ? ((error as { error?: { message?: string } }).error?.message ??
            'Could not import users.')
          : 'Could not import users.';
      this.toast.error(message);
    } finally {
      this.importingUsers.set(false);
      if (input) {
        input.value = '';
      }
    }
  }

  resetFilters(): void {
    this.searchControl.setValue('', { emitEvent: true });
    this.roleFilterControl.setValue('all');
    this.statusFilterControl.setValue('all');
  }

  previousPage(): void {
    this.pageIndex.update((pageIndex) => Math.max(pageIndex - 1, 0));
  }

  nextPage(): void {
    this.pageIndex.update((pageIndex) => Math.min(pageIndex + 1, this.pageCount() - 1));
  }

  togglePasswordVisibility(): void {
    this.passwordHidden.update((value) => !value);
  }

  toggleRoleSelection(role: UserRole, enabled: boolean): void {
    const current = new Set(this.userForm.controls.roles.value);

    if (enabled) {
      current.add(role);
    } else {
      current.delete(role);
    }

    this.userForm.controls.roles.setValue([...current]);
    this.userForm.controls.roles.markAsTouched();
    this.userForm.controls.roles.updateValueAndValidity();
  }

  private initialize(): void {
    this.loadUsers();

    this.searchControl.valueChanges
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => {
        this.searchTerm.set(value.trim().toLowerCase());
        this.pageIndex.set(0);
      });

    this.roleFilterControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.roleFilter.set(value);
        this.pageIndex.set(0);
      });

    this.statusFilterControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.statusFilter.set(value);
        this.pageIndex.set(0);
      });
  }
}
