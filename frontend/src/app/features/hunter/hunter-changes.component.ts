import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ChangeRequestApiService } from '../../core/api/change-request-api.service';
import { ChangeRequest, ChangeRequestSummary } from '../../core/models/product.models';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ToastService } from '../../core/ui/toast.service';

type ChangeRequestStatusFilter = '' | 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'REJECTED' | 'CLOSED';

@Component({
  selector: 'app-hunter-changes',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './hunter-changes.component.html',
  styleUrl: './hunter-changes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterChangesComponent {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly summary = signal<ChangeRequestSummary>({
    total: 0,
    pending: 0,
    completed: 0,
    open: 0,
    inProgress: 0,
    fixed: 0,
    rejected: 0,
    closed: 0,
    fixedToday: 0,
  });
  readonly requests = signal<ChangeRequest[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = 10;

  readonly filtersForm = new FormGroup({
    status: new FormControl<ChangeRequestStatusFilter>('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    issueType: new FormControl('', { nonNullable: true }),
  });

  readonly createForm = new FormGroup({
    asin: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    requestedChanges: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(5)],
    }),
  });

  readonly statusOptions: Array<{ value: ChangeRequestStatusFilter; label: string }> = [
    { value: '', label: 'All statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'FIXED', label: 'Fixed' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  readonly openCount = computed(() => this.summary().open || 0);
  readonly inProgressCount = computed(() => this.summary().inProgress || 0);
  readonly fixedCount = computed(() => this.summary().fixed || 0);

  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceSync = inject(WorkspaceSyncService);

  constructor(
    private readonly changeRequestApi: ChangeRequestApiService,
    private readonly toast: ToastService,
  ) {
    effect(() => {
      const version = this.workspaceSync.changeRequestsVersion();

      if (version > 0) {
        this.load();
      }
    });

    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.changeRequestApi
      .getSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => this.summary.set(summary),
      });

    this.changeRequestApi
      .listChangeRequests({
        status: this.filtersForm.controls.status.value,
        search: this.filtersForm.controls.search.value.trim(),
        issueType: this.filtersForm.controls.issueType.value || undefined,
        page: this.pageIndex() + 1,
        limit: this.pageSize,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.requests.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load product change requests.');
          this.loading.set(false);
        },
      });
  }

  createRequest(): void {
    if (this.createForm.invalid || this.saving()) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.changeRequestApi.createChangeRequest(this.createForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success('Change request sent to the assigned lister.');
        this.createForm.reset({ asin: '', requestedChanges: '' });
        this.workspaceSync.notifyChangeRequestsChanged();
        this.saving.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not create change request.');
        this.saving.set(false);
      },
    });
  }

  applyFilters(): void {
    this.pageIndex.set(0);
    this.load();
  }

  nextPage(): void {
    this.pageIndex.update((value) => value + 1);
    this.load();
  }

  previousPage(): void {
    this.pageIndex.update((value) => Math.max(0, value - 1));
    this.load();
  }

  statusTone(status: ChangeRequest['status']): string {
    switch (status) {
      case 'FIXED':
      case 'CLOSED':
        return 'status-badge--success';
      case 'IN_PROGRESS':
        return 'status-badge--listed';
      case 'REJECTED':
        return 'status-badge--danger';
      case 'OPEN':
      default:
        return 'status-badge--warning';
    }
  }
}
