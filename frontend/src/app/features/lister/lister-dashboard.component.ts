import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { DashboardService, HunterDashboardFilters, ListerDashboardStats } from '../../core/services/dashboard.service';

type RangePreset = 'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

const customDateRangeValidator: ValidatorFn = (control): ValidationErrors | null => {
  const from = control.get('from')?.value as string;
  const to = control.get('to')?.value as string;

  if (!from && !to) {
    return null;
  }

  if (!from || !to) {
    return { incompleteRange: true };
  }

  if (from > to) {
    return { invalidRange: true };
  }

  return null;
};

@Component({
  selector: 'app-lister-dashboard',
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
  templateUrl: './lister-dashboard.component.html',
  styleUrl: './lister-dashboard.component.scss',
})
export class ListerDashboardComponent implements OnInit {
  readonly stats = signal<ListerDashboardStats | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedRange = signal<RangePreset>('thisMonth');
  readonly activeFilters = signal<HunterDashboardFilters>({});

  readonly customRangeForm = new FormGroup(
    {
      from: new FormControl('', { nonNullable: true }),
      to: new FormControl('', { nonNullable: true }),
    },
    { validators: [customDateRangeValidator] },
  );

  readonly rangeButtons: Array<{ key: RangePreset; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'lastMonth', label: 'Last Month' },
    { key: 'thisYear', label: 'This Year' },
    { key: 'custom', label: 'Custom Range' },
  ];

  readonly totalListed = computed(() => this.stats()?.totalListed ?? 0);
  readonly rejectedCount = computed(() => this.stats()?.rejected ?? 0);
  readonly hunterBreakdown = computed(() => this.stats()?.byHunter ?? []);
  readonly accountBreakdown = computed(() => this.stats()?.byAccount ?? []);
  readonly hunterCount = computed(() => this.hunterBreakdown().length);
  readonly accountCount = computed(() => this.accountBreakdown().length);

  constructor(private readonly dashboardApi: DashboardService) {}

  ngOnInit(): void {
    this.applyPreset('thisMonth');
  }

  applyPreset(range: RangePreset): void {
    this.selectedRange.set(range);

    if (range === 'custom') {
      return;
    }

    const filters = this.getPresetFilters(range);
    this.activeFilters.set(filters);
    this.loadStats(filters);
  }

  applyCustomRange(): void {
    if (this.customRangeForm.invalid) {
      this.customRangeForm.markAllAsTouched();
      return;
    }

    const filters = this.customRangeForm.getRawValue();
    this.selectedRange.set('custom');
    this.activeFilters.set(filters);
    this.loadStats(filters);
  }

  refresh(): void {
    this.loadStats(this.activeFilters());
  }

  customRangeError(): string {
    const group = this.customRangeForm;

    if (!group.touched && !group.dirty) {
      return '';
    }

    if (group.hasError('incompleteRange')) {
      return 'Enter both start and end dates for a custom range.';
    }

    if (group.hasError('invalidRange')) {
      return 'The end date must be on or after the start date.';
    }

    return '';
  }

  private loadStats(filters: HunterDashboardFilters): void {
    this.loading.set(true);
    this.error.set('');

    this.dashboardApi.getListerStats(filters).subscribe({
      next: (stats) => this.stats.set(stats),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load dashboard data.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  private getPresetFilters(range: Exclude<RangePreset, 'custom'>): HunterDashboardFilters {
    const today = new Date();

    switch (range) {
      case 'today':
        return { from: this.toDateInput(today), to: this.toDateInput(today) };
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        return { from: this.toDateInput(yesterday), to: this.toDateInput(yesterday) };
      }
      case 'thisMonth': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: this.toDateInput(start), to: this.toDateInput(today) };
      }
      case 'lastMonth': {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { from: this.toDateInput(start), to: this.toDateInput(end) };
      }
      case 'thisYear': {
        const start = new Date(today.getFullYear(), 0, 1);
        return { from: this.toDateInput(start), to: this.toDateInput(today) };
      }
    }
  }

  private toDateInput(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
