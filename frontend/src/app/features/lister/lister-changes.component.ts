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
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ChangeRequestApiService } from '../../core/api/change-request-api.service';
import { ListerApiService } from '../../core/api/lister-api.service';
import { ChangeRequest, ChangeRequestSummary } from '../../core/models/product.models';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { FilterPanelComponent } from '../../shared/ui/filter-panel.component';
import { SearchableSelectComponent } from '../../shared/ui/searchable-select.component';
import { decimalMinValidator, decimalValidator } from '../../shared/validators/price.validator';
import { marketplaceUrlValidator } from '../../shared/validators/listing-link.validator';

type ChangeRequestStatusFilter = '' | 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'REJECTED' | 'CLOSED';

@Component({
  selector: 'app-lister-changes',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    FilterPanelComponent,
    SearchableSelectComponent,
  ],
  templateUrl: './lister-changes.component.html',
  styleUrl: './lister-changes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListerChangesComponent {
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
  readonly selectedRequestId = signal('');
  readonly hunters = signal<Array<{ id: string; name: string }>>([]);

  readonly statusOptions: Array<{ value: ChangeRequestStatusFilter; label: string }> = [
    { value: '', label: 'All statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'FIXED', label: 'Fixed' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'CLOSED', label: 'Closed' },
  ];
  readonly hunterFilterOptions = computed(() => [
    { value: '', label: 'All hunters' },
    ...this.hunters().map((hunter) => ({ value: hunter.id, label: hunter.name })),
  ]);

  readonly filtersForm = new FormGroup({
    status: new FormControl<ChangeRequestStatusFilter>('OPEN', { nonNullable: true }),
    issueType: new FormControl('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    hunterId: new FormControl('', { nonNullable: true }),
  });

  readonly fixForm = new FormGroup({
    newAmazonLink: new FormControl('', {
      nonNullable: true,
      validators: [marketplaceUrlValidator('amazon')],
    }),
    newEbayLink: new FormControl('', {
      nonNullable: true,
      validators: [marketplaceUrlValidator('ebay')],
    }),
    newPrice: new FormControl('', {
      nonNullable: true,
      validators: [decimalValidator, decimalMinValidator(0)],
    }),
    newStockCount: new FormControl('', {
      nonNullable: true,
      validators: [decimalValidator, decimalMinValidator(0)],
    }),
    notes: new FormControl('', { nonNullable: true }),
    rejectedReason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.minLength(3)],
    }),
  });

  readonly selectedRequest = computed(
    () => this.requests().find((request) => request.id === this.selectedRequestId()) || null,
  );
  readonly pageLabel = computed(() => {
    if (!this.total()) {
      return 'No change requests';
    }

    const start = this.pageIndex() * this.pageSize + 1;
    const end = start + this.requests().length - 1;
    return `Showing ${start}-${end} of ${this.total()}`;
  });
  readonly canStartSelected = computed(() => {
    const request = this.selectedRequest();
    return Boolean(request && request.status === 'OPEN' && !this.saving());
  });
  readonly canFixSelected = computed(() => {
    const request = this.selectedRequest();
    return Boolean(
      request &&
        (request.status === 'OPEN' || request.status === 'IN_PROGRESS') &&
        this.fixForm.valid &&
        !this.saving(),
    );
  });
  readonly canRejectSelected = computed(() => {
    const request = this.selectedRequest();
    return Boolean(
      request &&
        (request.status === 'OPEN' || request.status === 'IN_PROGRESS') &&
        this.fixForm.controls.rejectedReason.value.trim().length >= 3 &&
        !this.saving(),
    );
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceSync = inject(WorkspaceSyncService);

  constructor(
    private readonly changeRequestApi: ChangeRequestApiService,
    private readonly listerApi: ListerApiService,
    private readonly toast: ToastService,
  ) {
    this.listerApi
      .listAssignedHunters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hunters) => this.hunters.set(hunters.map((hunter) => ({ id: hunter.id, name: hunter.name }))),
      });

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
        issueType: this.filtersForm.controls.issueType.value || undefined,
        search: this.filtersForm.controls.search.value.trim(),
        hunterId: this.filtersForm.controls.hunterId.value || undefined,
        page: this.pageIndex() + 1,
        limit: this.pageSize,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.requests.set(page.items);
          this.total.set(page.total);
          this.syncSelectedRequest(page.items);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load change requests.');
          this.loading.set(false);
        },
      });
  }

  applyFilters(): void {
    this.pageIndex.set(0);
    this.load();
  }

  resetFilters(): void {
    this.filtersForm.reset(
      {
        status: 'OPEN',
        issueType: '',
        search: '',
        hunterId: '',
      },
      { emitEvent: false },
    );
    this.pageIndex.set(0);
    this.load();
  }

  selectRequest(id: string): void {
    this.selectedRequestId.set(id);
    this.patchFixForm();
  }

  startSelected(): void {
    const request = this.selectedRequest();

    if (!request || !this.canStartSelected()) {
      return;
    }

    this.saving.set(true);
    this.changeRequestApi.startChangeRequest(request.id).subscribe({
      next: () => {
        this.toast.success('Change request started.');
        this.workspaceSync.notifyChangeRequestsChanged();
        this.saving.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not start this change request.');
        this.saving.set(false);
      },
    });
  }

  fixSelected(): void {
    const request = this.selectedRequest();

    if (!request || !this.canFixSelected()) {
      this.fixForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const raw = this.fixForm.getRawValue();
    this.changeRequestApi
      .fixChangeRequest(request.id, {
        newAmazonLink: raw.newAmazonLink.trim() || undefined,
        newEbayLink: raw.newEbayLink.trim() || undefined,
        newPrice: raw.newPrice.trim() || undefined,
        newStockCount: raw.newStockCount.trim() || undefined,
        notes: raw.notes.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.toast.success('Change request fixed.');
          this.workspaceSync.notifyProductsChanged();
          this.workspaceSync.notifyChangeRequestsChanged();
          this.saving.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not save the fix.');
          this.saving.set(false);
        },
      });
  }

  rejectSelected(): void {
    const request = this.selectedRequest();
    const rejectedReason = this.fixForm.controls.rejectedReason.value.trim();

    if (!request || !this.canRejectSelected() || rejectedReason.length < 3) {
      this.fixForm.controls.rejectedReason.markAsTouched();
      return;
    }

    this.saving.set(true);
    this.changeRequestApi.rejectChangeRequest(request.id, { rejectedReason }).subscribe({
      next: () => {
        this.toast.success('Change request rejected.');
        this.workspaceSync.notifyChangeRequestsChanged();
        this.saving.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not reject this change request.');
        this.saving.set(false);
      },
    });
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

  async copyValue(value: string | null | undefined, label: string): Promise<void> {
    if (!value) {
      this.toast.warning(`No ${label.toLowerCase()} available to copy.`);
      return;
    }

    await navigator.clipboard.writeText(value);
    this.toast.success(`${label} copied.`);
  }

  private syncSelectedRequest(requests: ChangeRequest[]): void {
    if (!requests.length) {
      this.selectedRequestId.set('');
      this.fixForm.reset(
        {
          newAmazonLink: '',
          newEbayLink: '',
          newPrice: '',
          newStockCount: '',
          notes: '',
          rejectedReason: '',
        },
        { emitEvent: false },
      );
      return;
    }

    if (!requests.some((request) => request.id === this.selectedRequestId())) {
      this.selectedRequestId.set(requests[0].id);
    }

    this.patchFixForm();
  }

  private patchFixForm(): void {
    const request = this.selectedRequest();

    this.fixForm.reset(
      {
        newAmazonLink: request?.newAmazonLink || '',
        newEbayLink: request?.newEbayLink || '',
        newPrice: request?.newPrice === null || request?.newPrice === undefined ? '' : String(request.newPrice),
        newStockCount:
          request?.newStockCount === null || request?.newStockCount === undefined
            ? ''
            : String(request.newStockCount),
        notes: request?.notes || '',
        rejectedReason: request?.rejectedReason || '',
      },
      { emitEvent: false },
    );
  }
}
