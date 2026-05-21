import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/auth.models';
import { AdminService, AuditLogEntry } from '../../core/services/admin.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-admin-activity',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './admin-activity.component.html',
  styleUrl: './admin-activity.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminActivityComponent implements OnInit {
  readonly logs = signal<AuditLogEntry[]>([]);
  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

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
  ];

  constructor(
    private readonly adminApi: AdminService,
    private readonly referenceData: ReferenceDataService,
  ) {}

  ngOnInit(): void {
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

  loadLogs(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.listAuditLogs(this.buildFilters()).subscribe({
      next: (logs) => {
        this.logs.set(logs);
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

  actionLabel(action: string): string {
    return action
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  targetSummary(log: AuditLogEntry): string {
    if (log.targetType === 'product') {
      return log.productTitle || log.productAsin || 'Product';
    }

    if (log.targetType === 'account') {
      return log.accountName || 'Account';
    }

    return log.targetName || log.targetEmail || 'Not set';
  }

  detailsLabel(log: AuditLogEntry): string {
    if (!log.details) {
      return 'No extra details';
    }

    if (log.action === 'account.assignment.update') {
      const count = Array.isArray(log.details['listerIds']) ? log.details['listerIds'].length : null;
      return count ? `${count} lister assignment${count === 1 ? '' : 's'} updated.` : 'Lister access updated for this account.';
    }

    if (log.action === 'auth.login') {
      return 'Successful sign-in.';
    }

    const entries = Object.entries(log.details).filter(([, value]) => value !== null && value !== undefined && value !== '');

    if (!entries.length) {
      return 'No extra details';
    }

    return entries
      .slice(0, 3)
      .map(([key, value]) => `${this.humanizeKey(key)}: ${this.formatDetailValue(key, value)}`)
      .join(' | ');
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

  private humanizeKey(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\bid\b/gi, 'ID')
      .replace(/\bids\b/gi, 'IDs')
      .replace(/^./, (char) => char.toUpperCase());
  }

  private formatDetailValue(key: string, value: unknown): string {
    if (Array.isArray(value)) {
      return `${value.length} selected`;
    }

    const text = String(value);

    if (/(^|[._])(?:id|ids)$/i.test(key) && text.length > 20) {
      return 'updated';
    }

    return text;
  }
}
