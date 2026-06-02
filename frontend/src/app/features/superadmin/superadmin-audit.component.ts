import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Subject, catchError, debounceTime, distinctUntilChanged, finalize, of, switchMap } from 'rxjs';

import { AdminService, AuditLogEntry } from '../../core/services/admin.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-superadmin-audit',
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
  templateUrl: './superadmin-audit.component.html',
  styleUrl: './superadmin-audit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminAuditComponent implements OnInit {
  readonly logs = signal<AuditLogEntry[]>([]);
  readonly auditRows = signal<Array<AuditLogEntry & { detailsSummary: string }>>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadLogs$ = new Subject<void>();

  readonly filtersForm = new FormGroup({
    action: new FormControl('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  readonly actions = [
    'auth.login',
    'auth.impersonate',
    'user.create',
    'user.update',
    'user.role.change',
    'user.enable',
    'user.disable',
    'user.delete',
    'user.restore',
    'user.password.reset',
    'user.unlock',
    'assignment.update',
    'assignment.clear',
  ];

  constructor(private readonly adminApi: AdminService) {}

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadLogs());

    this.reloadLogs$
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.error.set('');

          return this.adminApi
            .listAuditLogs({
              search: this.searchControl.value.trim(),
              action: this.filtersForm.controls.action.value || undefined,
              from: this.filtersForm.controls.from.value || undefined,
              to: this.filtersForm.controls.to.value || undefined,
            })
            .pipe(
              catchError((error) => {
                this.error.set(error?.error?.message || 'Could not load audit logs.');
                return of<AuditLogEntry[]>([]);
              }),
              finalize(() => this.loading.set(false)),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((logs) => {
        this.logs.set(logs);
        this.auditRows.set(
          logs.map((log) => ({
            ...log,
            detailsSummary: !log.details
              ? 'No additional details.'
              : Object.entries(log.details)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(' | '),
          })),
        );
      });

    this.loadLogs();
  }

  loadLogs(): void {
    this.reloadLogs$.next();
  }
}
