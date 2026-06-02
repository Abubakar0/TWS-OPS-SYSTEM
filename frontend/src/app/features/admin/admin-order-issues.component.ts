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

import { OrderIssueApiService } from '../../core/api/order-issue-api.service';
import { OrderIssue, OrderIssueStatus, OrderIssueType } from '../../core/models/order.models';
import { ExportService } from '../../core/services/export.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { FilterPanelComponent } from '../../shared/ui/filter-panel.component';

type IssueStatusFilter = '' | 'OPEN' | 'IN_REVIEW' | 'FIXED' | 'REJECTED' | 'CLOSED';
type IssueTypeFilter = '' | OrderIssueType;

@Component({
  selector: 'app-admin-order-issues',
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
  templateUrl: './admin-order-issues.component.html',
  styleUrl: './admin-order-issues.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrderIssuesComponent {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly issues = signal<OrderIssue[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = 30;
  readonly selectedIssueId = signal('');
  readonly hunters = signal<Array<{ id: string; name: string }>>([]);
  readonly listers = signal<Array<{ id: string; name: string }>>([]);
  readonly accounts = signal<Array<{ id: string; name: string }>>([]);

  readonly filtersForm = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    issueType: new FormControl<IssueTypeFilter>('', { nonNullable: true }),
    status: new FormControl<IssueStatusFilter>('OPEN', { nonNullable: true }),
    hunterId: new FormControl('', { nonNullable: true }),
    listerId: new FormControl('', { nonNullable: true }),
    accountId: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });
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
  readonly issueStatusOptions: Array<{ value: IssueStatusFilter; label: string }> = [
    { value: '', label: 'All statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_REVIEW', label: 'In Review' },
    { value: 'FIXED', label: 'Fixed' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  readonly selectedIssue = computed(
    () => this.issues().find((issue) => issue.id === this.selectedIssueId()) || null,
  );
  readonly pageLabel = computed(() => {
    if (!this.total()) {
      return 'No issues found';
    }
    const start = this.pageIndex() * this.pageSize + 1;
    const end = start + this.issues().length - 1;
    return `Showing ${start}-${end} of ${this.total()}`;
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceSync = inject(WorkspaceSyncService);

  constructor(
    private readonly orderIssueApi: OrderIssueApiService,
    private readonly referenceData: ReferenceDataService,
    private readonly exportService: ExportService,
    private readonly toast: ToastService,
  ) {
    this.referenceData.getUsers('hunter').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (users) => this.hunters.set(users.map((user) => ({ id: user.id, name: user.name }))),
    });
    this.referenceData.getUsers('lister').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (users) => this.listers.set(users.map((user) => ({ id: user.id, name: user.name }))),
    });
    this.referenceData.getAccounts(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (accounts) => this.accounts.set(accounts.map((account) => ({ id: account.id, name: account.name }))),
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

    this.orderIssueApi
      .listOrderIssues({
        search: this.filtersForm.controls.search.value.trim() || undefined,
        issueType: this.filtersForm.controls.issueType.value || undefined,
        status: this.filtersForm.controls.status.value || undefined,
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
          this.issues.set(page.items);
          this.total.set(page.total);
          this.syncSelectedIssue(page.items);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load order issues.');
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
        issueType: '',
        status: 'OPEN',
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

  selectIssue(id: string): void {
    this.selectedIssueId.set(id);
  }

  closeSelectedIssue(): void {
    const issue = this.selectedIssue();

    if (!issue) {
      return;
    }

    this.saving.set(true);
    this.orderIssueApi.closeOrderIssue(issue.id).subscribe({
      next: () => {
        this.toast.success('Order issue closed.');
        this.workspaceSync.notifyOrdersChanged();
        this.workspaceSync.notifyChangeRequestsChanged();
        this.saving.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not close this issue.');
        this.saving.set(false);
      },
    });
  }

  reopenSelectedIssue(): void {
    const issue = this.selectedIssue();

    if (!issue) {
      return;
    }

    this.saving.set(true);
    this.orderIssueApi
      .updateOrderIssue(issue.id, {
        issueStatus: 'OPEN',
      })
      .subscribe({
        next: () => {
          this.toast.success('Order issue reopened.');
          this.workspaceSync.notifyOrdersChanged();
          this.workspaceSync.notifyChangeRequestsChanged();
          this.saving.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not reopen this issue.');
          this.saving.set(false);
        },
      });
  }

  exportIssues(): void {
    this.exporting.set(true);
    const baseFilters = {
      search: this.filtersForm.controls.search.value.trim() || undefined,
      issueType: this.filtersForm.controls.issueType.value || undefined,
      status: this.filtersForm.controls.status.value || undefined,
      hunterId: this.filtersForm.controls.hunterId.value || undefined,
      listerId: this.filtersForm.controls.listerId.value || undefined,
      accountId: this.filtersForm.controls.accountId.value || undefined,
      dateFrom: this.filtersForm.controls.dateFrom.value || undefined,
      dateTo: this.filtersForm.controls.dateTo.value || undefined,
      page: 1,
      limit: 100,
    };

    this.orderIssueApi.listOrderIssues(baseFilters).subscribe({
      next: async (firstPage) => {
        const rows = [...firstPage.items];
        const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.limit));

        for (let page = 2; page <= totalPages; page += 1) {
          const nextPage = await new Promise<typeof firstPage>((resolve, reject) => {
            this.orderIssueApi.listOrderIssues({ ...baseFilters, page }).subscribe({
              next: resolve,
              error: reject,
            });
          });
          rows.push(...nextPage.items);
        }

        this.exportService.exportAsExcelTable({
          filename: `order-issues-${new Date().toISOString().slice(0, 10)}.xlsx`,
          sheetName: 'Order Issues',
          rows,
          columns: [
            { header: 'Order ID', value: (row) => row.orderCode || row.ebayOrderId },
            { header: 'ASIN', value: (row) => row.asin || '' },
            { header: 'Product', value: (row) => row.productTitle || '' },
            { header: 'Hunter', value: (row) => row.hunterName || '' },
            { header: 'Lister', value: (row) => row.listerName || '' },
            { header: 'Account', value: (row) => row.accountName || '' },
            { header: 'Issue Type', value: (row) => row.issueType || '' },
            { header: 'Issue Status', value: (row) => row.issueStatus || '' },
            { header: 'Issue Reason', value: (row) => row.issueReason || '' },
            { header: 'Profit', value: (row) => row.profit },
            { header: 'ROI', value: (row) => row.roi },
            { header: 'Order Date', value: (row) => row.orderDate },
          ],
        });
        this.toast.success('Order issues exported.');
        this.exporting.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not export order issues.');
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

  private syncSelectedIssue(issues: OrderIssue[]): void {
    if (!issues.length) {
      this.selectedIssueId.set('');
      return;
    }

    if (!issues.some((issue) => issue.id === this.selectedIssueId())) {
      this.selectedIssueId.set(issues[0].id);
    }
  }
}
