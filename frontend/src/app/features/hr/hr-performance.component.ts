import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { HrApiService } from '../../core/api/hr-api.service';
import { HrPerformanceRow } from '../../core/models/hr.models';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-hr-performance',
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
  templateUrl: './hr-performance.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrPerformanceComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = signal<HrPerformanceRow[]>([]);
  readonly search = new FormControl('', { nonNullable: true });

  readonly filteredRows = computed(() => {
    const term = this.search.value.trim().toLowerCase();
    if (!term) {
      return this.rows();
    }
    return this.rows().filter((row) =>
      [row.employeeName, row.employeeEmail, row.department || '', row.designation || '', row.roles.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  });

  readonly summary = computed(() => ({
    employees: this.filteredRows().length,
    hunters: this.filteredRows().filter((row) => row.roles.includes('hunter')).length,
    listers: this.filteredRows().filter((row) => row.roles.includes('lister')).length,
    processors: this.filteredRows().filter((row) => row.roles.includes('order_processor')).length,
  }));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.hrApi.getPerformanceReport().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load performance data.');
        this.loading.set(false);
      },
    });
  }
}
