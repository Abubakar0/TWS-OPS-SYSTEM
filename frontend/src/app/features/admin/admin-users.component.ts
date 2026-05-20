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
import { debounceTime, distinctUntilChanged } from 'rxjs';

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
  readonly sortState = signal<GridSortState>({ active: 'name', direction: 'asc' });
  readonly pageIndex = signal(0);
  readonly pageSize = signal(this.pageSizeOptions[0]);

  readonly searchControl = new FormControl('', { nonNullable: true });

  readonly adminCount = computed(() => this.users().filter((user) => user.role === 'admin').length);
  readonly hunterCount = computed(() => this.users().filter((user) => user.role === 'hunter').length);
  readonly listerCount = computed(() => this.users().filter((user) => user.role === 'lister').length);
  readonly availableRoles = computed<UserRole[]>(() =>
    this.auth.currentUser()?.role === 'super_admin' ? ['hunter', 'lister', 'admin'] : ['hunter', 'lister'],
  );
  readonly filteredUsers = computed(() => {
    const term = this.searchTerm();
    const filtered = this.users().filter((user) => {
      if (!term) {
        return true;
      }

      return [
        user.name,
        user.email,
        user.role,
        user.isActive ? 'enabled' : 'disabled',
      ].some((value) => value.toLowerCase().includes(term));
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
    password: new FormControl('Password123!', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
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

  createUser(): void {
    if (this.userForm.invalid || this.saving()) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.adminApi.createUser(this.userForm.getRawValue()).subscribe({
      next: () => {
        this.userForm.reset({
          name: '',
          email: '',
          password: 'Password123!',
          role: 'hunter',
          isActive: true,
        });
        this.referenceData.refreshUsers();
        this.workspaceSync.notifyUsersChanged();
        this.toast.success('User created.');
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not create user.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
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

  exportUsers(): void {
    const dateStamp = new Date().toISOString().slice(0, 10);

    this.exportService.exportAsExcelTable({
      filename: `admin-users-${dateStamp}.xls`,
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
