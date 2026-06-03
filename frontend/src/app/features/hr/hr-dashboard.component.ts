import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { HrApiService } from '../../core/api/hr-api.service';
import { HrDashboardStats } from '../../core/models/hr.models';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-hr-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './hr-dashboard.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrDashboardComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly stats = signal<HrDashboardStats | null>(null);
  readonly dateFrom = new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true });
  readonly dateTo = new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.hrApi
      .getDashboard({
        dateFrom: this.dateFrom.value,
        dateTo: this.dateTo.value,
      })
      .subscribe({
        next: (stats) => {
          this.stats.set(stats);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load HR dashboard.');
          this.loading.set(false);
        },
      });
  }

  applyPreset(range: 'today' | 'week' | 'month'): void {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    let from = to;

    if (range === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      from = start.toISOString().slice(0, 10);
    } else if (range === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      from = start.toISOString().slice(0, 10);
    }

    this.dateFrom.setValue(from);
    this.dateTo.setValue(to);
    this.load();
  }

  refresh(): void {
    this.load();
    this.toast.success('HR dashboard refreshed.');
  }
}
