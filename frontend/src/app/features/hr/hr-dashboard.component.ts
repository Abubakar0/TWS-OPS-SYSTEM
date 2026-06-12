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
  readonly dateFrom = new FormControl(new Date().toLocaleDateString('en-CA'), {
    nonNullable: true,
  });
  readonly dateTo = new FormControl(new Date().toLocaleDateString('en-CA'), { nonNullable: true });

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

  applyPreset(range: 'today' | 'yesterday' | 'week' | 'month'): void {
    const now = new Date();
    const to = now.toLocaleDateString('en-CA');
    let from = to;

    if (range === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      from = yesterday.toLocaleDateString('en-CA');
      this.dateTo.setValue(from);
      this.dateFrom.setValue(from);
      this.load();
      return;
    }

    if (range === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      from = start.toLocaleDateString('en-CA');
    } else if (range === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      from = start.toLocaleDateString('en-CA');
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
