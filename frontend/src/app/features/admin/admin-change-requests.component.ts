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
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ChangeRequestApiService } from '../../core/api/change-request-api.service';
import { ChangeRequest } from '../../core/models/product.models';
import { ExportService } from '../../core/services/export.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { FilterPanelComponent } from '../../shared/ui/filter-panel.component';

type ChangeRequestStatusFilter = '' | 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'REJECTED' | 'CLOSED';
type IssueTypeFilter =
  | ''
  | 'PRODUCT_NOT_AVAILABLE'
  | 'PRICE_INCREASED'
  | 'ORDER_IN_LOSS'
  | 'LOW_STOCK'
  | 'WRONG_PRODUCT_LINK'
  | 'AMAZON_LINK_NOT_WORKING'
  | 'SUPPLIER_CANCELLED'
  | 'BUYER_ADDRESS_ISSUE'
  | 'TRACKING_ISSUE'
  | 'OTHER';

@Component({
  selector: 'app-admin-change-requests',
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
  ],
  templateUrl: './admin-change-requests.component.html',
  styleUrl: './admin-change-requests.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminChangeRequestsComponent {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly requests = signal<ChangeRequest[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = 30;
  readonly selectedRequestId = signal('');
  readonly hunters = signal<Array<{ id: string; name: string }>>([]);
  readonly listers = signal<Array<{ id: string; name: string }>>([]);
  readonly accounts = signal<Array<{ id: string; name: string }>>([]);

  readonly statusOptions: Array<{ value: ChangeRequestStatusFilter; label: string }> = [
    { value: '', label: 'All statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'FIXED', label: 'Fixed' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'CLOSED', label: 'Closed' },
  ];
  readonly issueTypeOptions: Array<{ value: IssueTypeFilter; label: string }> = [
    { value: '', label: 'All issue types' },
    { value: 'PRODUCT_NOT_AVAILABLE', label: 'Product Not Available' },
    { value: 'PRICE_INCREASED', label: 'Price Increased' },
    { value: 'ORDER_IN_LOSS', label: 'Order In Loss' },
    { value: 'LOW_STOCK', label: 'Low Stock' },
    { value: 'WRONG_PRODUCT_LINK', label: 'Wrong Product Link' },
    { value: 'AMAZON_LINK_NOT_WORKING', label: 'Amazon Link Not Working' },
    { value: 'SUPPLIER_CANCELLED', label: 'Supplier Cancelled' },
    { value: 'BUYER_ADDRESS_ISSUE', label: 'Buyer Address Issue' },
    { value: 'TRACKING_ISSUE', label: 'Tracking Issue' },
    { value: 'OTHER', label: 'Other' },
  ];

  readonly filtersForm = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    status: new FormControl<ChangeRequestStatusFilter>('OPEN', { nonNullable: true }),
    issueType: new FormControl<IssueTypeFilter>('', { nonNullable: true }),
    hunterId: new FormControl('', { nonNullable: true }),
    listerId: new FormControl('', { nonNullable: true }),
    accountId: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  readonly reassignControl = new FormControl('', { nonNullable: true });
  readonly closeNotesControl = new FormControl('', { nonNullable: true });

  readonly selectedRequest = computed(
    () => this.requests().find((request) => request.id === this.selectedRequestId()) || null,
  );
  readonly pageLabel = computed(() => {
    if (!this.total()) {
      return 'No change requests found';
    }

    const start = this.pageIndex() * this.pageSize + 1;
    const end = start + this.requests().length - 1;
    return `Showing ${start}-${end} of ${this.total()}`;
  });
  readonly canReassign = computed(
    () =>
      Boolean(this.selectedRequest()) &&
      Boolean(this.reassignControl.value) &&
      !this.saving(),
  );
  readonly canClose = computed(
    () =>
      Boolean(this.selectedRequest()) &&
      this.selectedRequest()?.status !== 'CLOSED' &&
      !this.saving(),
  );

  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceSync = inject(WorkspaceSyncService);

  constructor(
    private readonly changeRequestApi: ChangeRequestApiService,
    private readonly referenceData: ReferenceDataService,
    private readonly exportService: ExportService,
    private readonly toast: ToastService,
  ) {
    this.referenceData
      .getUsers('hunter')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => this.hunters.set(users.map((user) => ({ id: user.id, name: user.name }))),
      });
    this.referenceData
      .getUsers('lister')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => this.listers.set(users.map((user) => ({ id: user.id, name: user.name }))),
      });
    this.referenceData
      .getAccounts(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (accounts) =>
          this.accounts.set(accounts.map((account) => ({ id: account.id, name: account.name }))),
      });

    effect(() => {
      const ordersVersion = this.workspaceSync.ordersVersion();
      const requestsVersion = this.workspaceSync.changeRequestsVersion();

      if (ordersVersion > 0 || requestsVersion > 0) {
        this.load();
      }
    });

    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.changeRequestApi
      .listChangeRequests({
        search: this.filtersForm.controls.search.value.trim() || undefined,
        status: this.filtersForm.controls.status.value,
        issueType: this.filtersForm.controls.issueType.value,
        hunterId: this.filtersForm.controls.hunterId.value || undefined,
        listerId: this.filtersForm.controls.listerId.value || undefined,
        accountId: this.filtersForm.controls.accountId.value || undefined,
        dateFrom: this.filtersForm.controls.dateFrom.value || undefined,
        dateTo: this.filtersForm.controls.dateTo.value || undefined,
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
        search: '',
        status: 'OPEN',
        issueType: '',
        hunterId: '',
        listerId: '',
        accountId: '',
        dateFrom: '',
        dateTo: '',
      },
      { emitEvent: false },
    );
    this.pageIndex.set(0);
    this.load();
  }

  selectRequest(id: string): void {
    this.selectedRequestId.set(id);
    const request = this.requests().find((entry) => entry.id === id);
    this.reassignControl.setValue(request?.listerId || '');
    this.closeNotesControl.setValue(request?.notes || '');
  }

  reassignSelected(): void {
    const request = this.selectedRequest();
    const listerId = this.reassignControl.value;

    if (!request || !listerId) {
      return;
    }

    this.saving.set(true);
    this.changeRequestApi.reassignChangeRequest(request.id, listerId).subscribe({
      next: () => {
        this.toast.success('Change request reassigned.');
        this.workspaceSync.notifyChangeRequestsChanged();
        this.saving.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not reassign this change request.');
        this.saving.set(false);
      },
    });
  }

  closeSelected(): void {
    const request = this.selectedRequest();

    if (!request) {
      return;
    }

    this.saving.set(true);
    this.changeRequestApi.closeChangeRequest(
      request.id,
      this.closeNotesControl.value.trim() || undefined,
    ).subscribe({
      next: () => {
        this.toast.success('Change request closed.');
        this.workspaceSync.notifyChangeRequestsChanged();
        this.saving.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not close this change request.');
        this.saving.set(false);
      },
    });
  }

  exportRequests(): void {
    this.exporting.set(true);
    const baseFilters = {
      search: this.filtersForm.controls.search.value.trim() || undefined,
      status: this.filtersForm.controls.status.value,
      issueType: this.filtersForm.controls.issueType.value,
      hunterId: this.filtersForm.controls.hunterId.value || undefined,
      listerId: this.filtersForm.controls.listerId.value || undefined,
      accountId: this.filtersForm.controls.accountId.value || undefined,
      dateFrom: this.filtersForm.controls.dateFrom.value || undefined,
      dateTo: this.filtersForm.controls.dateTo.value || undefined,
      page: 1,
      limit: 100,
    };

    this.changeRequestApi.listChangeRequests(baseFilters).subscribe({
      next: async (firstPage) => {
        const rows = [...firstPage.items];
        const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.limit));

        for (let page = 2; page <= totalPages; page += 1) {
          const nextPage = await new Promise<typeof firstPage>((resolve, reject) => {
            this.changeRequestApi.listChangeRequests({ ...baseFilters, page }).subscribe({
              next: resolve,
              error: reject,
            });
          });
          rows.push(...nextPage.items);
        }

        this.exportService.exportAsExcelTable({
          filename: `product-change-requests-${new Date().toISOString().slice(0, 10)}.xlsx`,
          sheetName: 'Change Requests',
          rows,
          columns: [
            { header: 'Product', value: (row) => row.productTitle || '' },
            { header: 'ASIN', value: (row) => row.asin || '' },
            { header: 'Hunter', value: (row) => row.hunterName || '' },
            { header: 'Lister', value: (row) => row.listerName || '' },
            { header: 'Account', value: (row) => row.accountName || '' },
            { header: 'Issue Type', value: (row) => row.issueType || '' },
            { header: 'Issue Reason', value: (row) => row.issueReason || '' },
            { header: 'Status', value: (row) => row.status },
            { header: 'Created At', value: (row) => row.createdAt },
          ],
        });
        this.toast.success('Change requests exported.');
        this.exporting.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not export change requests.');
        this.exporting.set(false);
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

  private syncSelectedRequest(requests: ChangeRequest[]): void {
    if (!requests.length) {
      this.selectedRequestId.set('');
      this.reassignControl.setValue('');
      this.closeNotesControl.setValue('');
      return;
    }

    if (!requests.some((request) => request.id === this.selectedRequestId())) {
      this.selectedRequestId.set(requests[0].id);
      this.reassignControl.setValue(requests[0].listerId || '');
      this.closeNotesControl.setValue(requests[0].notes || '');
    }
  }
}
