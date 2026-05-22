import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup } from '@angular/forms';

import { AdminApiService } from '../api/admin-api.service';
import { AuthService } from '../auth/auth.service';
import { mapAuditLogRow } from '../mappers/audit-log.mapper';
import { User } from '../models/auth.models';
import { ReferenceDataService } from '../state/reference-data.service';

@Injectable()
export class AdminActivityFacade {
  readonly logs = signal<ReturnType<typeof mapAuditLogRow>[]>([]);
  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    actorUserId: new FormControl('', { nonNullable: true }),
    actorRole: new FormControl('', { nonNullable: true }),
    action: new FormControl('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  readonly filterUsers = computed(() => {
    const currentUser = this.auth.currentUser();
    const base = this.users();

    if (!currentUser) {
      return base;
    }

    return base.some((user) => user.id === currentUser.id) ? base : [currentUser, ...base];
  });

  readonly actionOptions = [
    { value: '', label: 'All actions' },
    { value: 'user.create', label: 'User Created' },
    { value: 'user.update', label: 'User Updated' },
    { value: 'user.enable', label: 'User Enabled' },
    { value: 'user.disable', label: 'User Disabled' },
    { value: 'assignment.update', label: 'Assignment Updated' },
    { value: 'account.assignment.update', label: 'Account Assignment Updated' },
    { value: 'product.approved', label: 'Product Approved' },
    { value: 'product.rejected', label: 'Product Rejected' },
    { value: 'listing.complete', label: 'Listing Completed' },
  ] as const;

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly auth: AuthService,
    private readonly adminApi: AdminApiService,
    private readonly referenceData: ReferenceDataService,
  ) {
    this.initialize();
  }

  loadLogs(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.listAuditLogs(this.buildFilters()).subscribe({
      next: (logs) => {
        this.logs.set(logs.map(mapAuditLogRow));
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load activity feed.');
        this.loading.set(false);
      },
    });
  }

  resetFilters(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.filters.reset(
      {
        search: '',
        actorUserId: '',
        actorRole: '',
        action: '',
        from: today,
        to: today,
      },
      { emitEvent: false },
    );
    this.loadLogs();
  }

  private initialize(): void {
    this.referenceData
      .getUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => this.users.set(users),
      });

    const today = new Date().toISOString().slice(0, 10);
    this.filters.patchValue({ from: today, to: today }, { emitEvent: false });
    this.loadLogs();
  }

  private buildFilters() {
    const raw = this.filters.getRawValue();
    return {
      search: raw.search.trim() || undefined,
      actorUserId: raw.actorUserId || undefined,
      actorRole: raw.actorRole || undefined,
      action: raw.action || undefined,
      from: raw.from || undefined,
      to: raw.to || undefined,
    };
  }
}
