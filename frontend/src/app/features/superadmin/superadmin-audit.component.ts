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
import { debounceTime, distinctUntilChanged } from 'rxjs';

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
  readonly loading = signal(false);
  readonly error = signal('');
  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly destroyRef = inject(DestroyRef);

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

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadLogs());

    this.loadLogs();
  }

  constructor(private readonly adminApi: AdminService) {}

  loadLogs(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi
      .listAuditLogs({
        search: this.searchControl.value.trim(),
        action: this.filtersForm.controls.action.value || undefined,
        from: this.filtersForm.controls.from.value || undefined,
        to: this.filtersForm.controls.to.value || undefined,
      })
      .subscribe({
        next: (logs) => this.logs.set(logs),
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load audit logs.');
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
  }

  detailSummary(log: AuditLogEntry): string {
    if (!log.details) {
      return 'No additional details.';
    }

    return Object.entries(log.details)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ');
  }
}
