import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin } from 'rxjs';

import { AdminService, AdminStats, AuditLogEntry } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-dashboard',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit {
  readonly stats = signal<AdminStats | null>(null);
  readonly activityLogs = signal<AuditLogEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly filtersForm = new FormGroup({
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  readonly totalUsers = computed(() => (this.stats()?.byHunter.length || 0) + (this.stats()?.byLister.length || 0) + 1);
  readonly topHunters = computed(() => this.stats()?.byHunter.slice(0, 5) ?? []);
  readonly topListers = computed(() => this.stats()?.byLister.slice(0, 5) ?? []);
  readonly topAccounts = computed(() => this.stats()?.byAccount.slice(0, 5) ?? []);
  readonly recentDays = computed(() => this.stats()?.daily.slice(0, 10) ?? []);
  readonly previewLogs = computed(() => this.activityLogs().slice(0, 6));
  readonly selectedRangeLabel = computed(() => {
    const { from, to } = this.filtersForm.getRawValue();

    if (!from || !to) {
      return 'All dates';
    }

    return from === to ? from : `${from} to ${to}`;
  });

  constructor(private readonly adminApi: AdminService) {}

  ngOnInit(): void {
    this.resetToday();
  }

  applyFilters(): void {
    this.loadDashboard();
  }

  resetToday(): void {
    const today = this.toDateInput(new Date());
    this.filtersForm.patchValue({ from: today, to: today }, { emitEvent: false });
    this.loadDashboard();
  }

  actionLabel(action: string): string {
    return action
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  targetSummary(log: AuditLogEntry): string {
    if (log.productTitle || log.productAsin) {
      return log.productTitle || log.productAsin || 'Product';
    }

    if (log.accountName) {
      return log.accountName;
    }

    return log.targetName || log.targetEmail || 'System item';
  }

  metaSummary(log: AuditLogEntry): string {
    const actor = log.actorName || log.actorEmail || 'System';
    const role = log.actorRole ? ` • ${log.actorRole.replace('_', ' ')}` : '';
    return `${actor}${role}`;
  }

  loadDashboard(): void {
    this.loading.set(true);
    this.error.set('');

    const { from, to } = this.filtersForm.getRawValue();
    const filters = {
      from: from || undefined,
      to: to || undefined,
    };

    forkJoin({
      stats: this.adminApi.getAdminStats(filters),
      logs: this.adminApi.listAuditLogs(filters),
    }).subscribe({
      next: ({ stats, logs }) => {
        this.stats.set(stats);
        this.activityLogs.set(logs);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load dashboard overview.');
        this.loading.set(false);
      },
    });
  }

  private toDateInput(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
