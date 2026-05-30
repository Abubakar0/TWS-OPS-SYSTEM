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
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { OrderIssueApiService } from '../../core/api/order-issue-api.service';
import { OrderIssue } from '../../core/models/order.models';
import { OrderIssueStatus, OrderIssueType } from '../../core/models/order.models';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { FilterPanelComponent } from '../../shared/ui/filter-panel.component';

type IssueTypeFilter = '' | OrderIssueType;
type IssueStatusFilter = '' | OrderIssueStatus;

@Component({
  selector: 'app-hunter-order-issues',
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
    FilterPanelComponent,
  ],
  templateUrl: './hunter-order-issues.component.html',
  styleUrl: './hunter-order-issues.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterOrderIssuesComponent {
  readonly loading = signal(true);
  readonly error = signal('');
  readonly issues = signal<OrderIssue[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = 10;
  readonly selectedIssueId = signal('');

  readonly filtersForm = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    issueType: new FormControl<IssueTypeFilter>('', { nonNullable: true }),
    status: new FormControl<IssueStatusFilter>('OPEN', { nonNullable: true }),
    accountId: new FormControl('', { nonNullable: true }),
    listerId: new FormControl('', { nonNullable: true }),
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
  readonly listerOptions = computed(() => {
    const map = new Map<string, string>();
    for (const issue of this.issues()) {
      if (issue.listerId && issue.listerName) {
        map.set(issue.listerId, issue.listerName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  });
  readonly accountOptions = computed(() => {
    const map = new Map<string, string>();
    for (const issue of this.issues()) {
      if (issue.accountId && issue.accountName) {
        map.set(issue.accountId, issue.accountName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceSync = inject(WorkspaceSyncService);

  constructor(private readonly orderIssueApi: OrderIssueApiService) {
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
        accountId: this.filtersForm.controls.accountId.value || undefined,
        listerId: this.filtersForm.controls.listerId.value || undefined,
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
        accountId: '',
        listerId: '',
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
