import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { User, UserRole } from '../../core/models/auth.models';
import { AdminService } from '../../core/services/admin.service';
import { ExportService } from '../../core/services/export.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { GridSortState, paginateRecords, sortRecords } from '../../shared/grid/grid.utils';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-admin-users',
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
    MatTooltipModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersComponent implements OnInit {
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

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly roleFilterControl = new FormControl<UserRole | 'all'>('all', { nonNullable: true });
  readonly statusFilterControl = new FormControl<'all' | 'active' | 'disabled'>('all', { nonNullable: true });

  readonly adminCount = computed(() => this.users().filter((user) => user.role === 'admin').length);
  readonly hunterCount = computed(() => this.users().filter((user) => user.role === 'hunter').length);
  readonly listerCount = computed(() => this.users().filter((user) => user.role === 'lister').length);
  readonly activeCount = computed(() => this.users().filter((user) => user.isActive).length);
  readonly disabledCount = computed(() => this.users().filter((user) => !user.isActive).length);
  readonly availableRoles = computed<UserRole[]>(() =>
    this.auth.currentUser()?.role === 'super_admin' ? ['hunter', 'lister', 'admin'] : ['hunter', 'lister'],
  );
  readonly isEditing = computed(() => Boolean(this.editingUser()));
  readonly filteredUsers = computed(() => {
    const term = this.searchTerm();
    const role = this.roleFilter();
    const status = this.statusFilter();
    const filtered = this.users().filter((user) => {
      const matchesRole = role === 'all' ? true : user.role === role;
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
        user.role,
        user.isActive ? 'enabled' : 'disabled',
        ].some((value) => value.toLowerCase().includes(term))
      );
    });

    return sortRecords(filtered, this.sortState(), (user, key) => {
      switch (key) {
        case 'email':
          return user.email.toLowerCase();
        case 'role':
          return user.role;
        case 'status':
          return user.isActive ? 'enabled' : 'disabled';
        case 'name':
        default:
          return user.name.toLowerCase();
      }
    });
  });
  readonly pagedUsers = computed(() => paginateRecords(this.filteredUsers(), this.pageIndex(), this.pageSize()));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredUsers().length / this.pageSize())));
  readonly pageLabel = computed(() => {
    const total = this.filteredUsers().length;

    if (!total) {
      return 'No users to show';
    }

    const start = this.pageIndex() * this.pageSize() + 1;
    const end = Math.min(total, start + this.pageSize() - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  readonly userForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.minLength(8)],
    }),
    role: new FormControl<UserRole>('hunter', { nonNullable: true, validators: [Validators.required] }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private usersSubscribed = false;

  constructor(
    private readonly adminApi: AdminService,
    private readonly exportService: ExportService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.searchTerm.set(value.trim().toLowerCase());
        this.pageIndex.set(0);
      });

    this.roleFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.roleFilter.set(value);
      this.pageIndex.set(0);
    });

    this.statusFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.statusFilter.set(value);
      this.pageIndex.set(0);
    });
  }

  ngOnInit(): void {
    this.loadUsers();
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
    this.userForm.reset({
      name: '',
      email: '',
      password: '',
      role: 'hunter',
      isActive: true,
    });
    this.userForm.controls.password.setValidators([Validators.required, Validators.minLength(8)]);
    this.userForm.controls.password.updateValueAndValidity({ emitEvent: false });
    this.userModalOpen.set(true);
  }

  openEditModal(user: User): void {
    this.editingUser.set(user);
    this.userForm.reset({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      isActive: user.isActive,
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
    this.userForm.reset({
      name: '',
      email: '',
      password: '',
      role: 'hunter',
      isActive: true,
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
      this.adminApi.createUser({
        ...raw,
        password: raw.password || 'Password123!',
      }).pipe(
        finalize(() => this.saving.set(false)),
      ).subscribe({
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
      role: raw.role,
      isActive: raw.isActive,
    };

    if (raw.password.trim()) {
      payload.password = raw.password.trim();
    }

    this.adminApi.updateUser(editingUser.id, payload).pipe(
      finalize(() => this.saving.set(false)),
    ).subscribe({
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

  async toggleUser(user: User): Promise<void> {
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

  async resetPassword(user: User): Promise<void> {
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

  userStatus(user: User): 'active' | 'disabled' {
    return user.isActive ? 'active' : 'disabled';
  }

  canEditUser(user: User): boolean {
    return user.role !== 'admin' || this.auth.currentUser()?.role === 'super_admin';
  }

  exportUsers(): void {
    const dateStamp = new Date().toISOString().slice(0, 10);

    this.exportService.exportAsExcelTable({
      filename: `admin-users-${dateStamp}.xlsx`,
      sheetName: 'Users',
      rows: this.filteredUsers(),
      columns: [
        { header: 'Name', value: (user) => user.name },
        { header: 'Email', value: (user) => user.email },
        { header: 'Role', value: (user) => user.role },
        { header: 'Status', value: (user) => (user.isActive ? 'Enabled' : 'Disabled') },
      ],
    });
    this.toast.success('User list exported.');
  }

  resetFilters(): void {
    this.searchControl.setValue('', { emitEvent: true });
    this.roleFilterControl.setValue('all');
    this.statusFilterControl.setValue('all');
  }

  toggleSort(active: GridSortState['active']): void {
    const current = this.sortState();

    this.sortState.set({
      active,
      direction: current.active === active && current.direction === 'asc' ? 'desc' : 'asc',
    });
    this.pageIndex.set(0);
  }

  isSortedBy(active: GridSortState['active']): boolean {
    return this.sortState().active === active;
  }

  sortIcon(active: GridSortState['active']): string {
    const current = this.sortState();

    if (current.active !== active) {
      return 'unfold_more';
    }

    return current.direction === 'asc' ? 'north' : 'south';
  }

  setPageSize(value: string): void {
    this.pageSize.set(Number(value));
    this.pageIndex.set(0);
  }

  previousPage(): void {
    this.pageIndex.update((pageIndex) => Math.max(pageIndex - 1, 0));
  }

  nextPage(): void {
    this.pageIndex.update((pageIndex) => Math.min(pageIndex + 1, this.pageCount() - 1));
  }

  fieldError(name: 'name' | 'email' | 'password'): string {
    const control = this.userForm.controls[name];

    if (!control.touched && !control.dirty) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required.';
    }

    if (control.hasError('email')) {
      return 'Enter a valid email address.';
    }

    if (control.hasError('minlength')) {
      return 'Password must be at least 8 characters.';
    }

    return '';
  }
}
