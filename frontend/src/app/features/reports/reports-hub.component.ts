import { CommonModule, CurrencyPipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin } from 'rxjs';

import { ReportApiService } from '../../core/api/report-api.service';
import { TeamApiService } from '../../core/api/team-api.service';
import { UserRole } from '../../core/models/auth.models';
import { ExecutiveReport, ReportFilters, ReportScope, ReportSection, ReportSummary } from '../../core/models/report.models';
import { ProductCategory } from '../../core/models/product.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { ToastService } from '../../core/ui/toast.service';
import { ExportService } from '../../core/services/export.service';
import { FilterPanelComponent } from '../../shared/ui/filter-panel.component';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/ui/searchable-select.component';

type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

interface KpiCard {
  label: string;
  value: string;
  hint: string;
  section: ReportSection;
  queryParams?: Record<string, string>;
}

interface ReportHubLink {
  title: string;
  description: string;
  section: ReportSection;
  icon: string;
}

const toLocalDateInput = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Component({
  selector: 'app-reports-hub',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CurrencyPipe,
    TitleCasePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    FilterPanelComponent,
    SearchableSelectComponent,
  ],
  templateUrl: './reports-hub.component.html',
  styleUrl: './reports-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsHubComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reportApi = inject(ReportApiService);
  private readonly referenceData = inject(ReferenceDataService);
  private readonly teamApi = inject(TeamApiService);
  private readonly exportService = inject(ExportService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scope = signal<ReportScope>('admin');
  readonly summary = signal<ReportSummary | null>(null);
  readonly executive = signal<ExecutiveReport | null>(null);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly accounts = signal<Array<{ id: string; name: string; marketplace: string; country?: string | null }>>([]);
  readonly users = signal<Array<{ id: string; name: string; email: string; roles: string[] }>>([]);
  readonly categories = signal<ProductCategory[]>([]);
  readonly teams = signal<Array<{ id: string; name: string }>>([]);
  readonly selectedPreset = signal<DatePreset>('thisMonth');

  readonly filtersForm = new FormGroup({
    role: new FormControl('', { nonNullable: true }),
    teamId: new FormControl('', { nonNullable: true }),
    userId: new FormControl('', { nonNullable: true }),
    accountId: new FormControl('', { nonNullable: true }),
    marketplace: new FormControl('', { nonNullable: true }),
    country: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  readonly roleOptions = computed<readonly SearchableSelectOption<string>[]>(() => {
    const shared: SearchableSelectOption<string>[] = [
      { value: '', label: 'All roles', description: 'Do not narrow this report to a single role.' },
      { value: 'hunter', label: 'Hunters' },
      { value: 'lister', label: 'Listers' },
      { value: 'order_processor', label: 'Order Processors' },
      { value: 'hr', label: 'HR' },
      { value: 'admin', label: 'Admins' },
    ];

    if (this.scope() === 'superadmin') {
      shared.push({ value: 'super_admin', label: 'Super Admins' });
    }

    return shared;
  });

  readonly teamOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All teams', description: 'Keep every team in scope.' },
    ...this.teams().map((team) => ({ value: team.id, label: team.name })),
  ]);

  readonly userOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All users', description: 'Do not limit the reporting view to one operator.' },
    ...this.users().map((user) => ({
      value: user.id,
      label: user.name,
      description: user.roles.join(', '),
    })),
  ]);

  readonly accountOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All accounts', description: 'Include every listing account.' },
    ...this.accounts().map((account) => ({
      value: account.id,
      label: account.name,
      description: account.marketplace,
    })),
  ]);

  readonly marketplaceOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All marketplaces', description: 'Blend every marketplace into the same report.' },
    ...[...new Set(this.accounts().map((account) => account.marketplace).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right))
      .map((marketplace) => ({ value: marketplace, label: marketplace })),
  ]);

  readonly countryOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All countries', description: 'Keep the report global.' },
    ...[...new Set(this.accounts().map((account) => account.country).filter(Boolean) as string[])]
      .sort((left, right) => left.localeCompare(right))
      .map((country) => ({ value: country, label: country })),
  ]);

  readonly categoryOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All categories', description: 'Include every product category.' },
    ...this.categories().map((category) => ({ value: category.name, label: category.name })),
  ]);

  readonly quickRanges: Array<{ key: DatePreset; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'thisWeek', label: 'This Week' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'lastMonth', label: 'Last Month' },
    { key: 'thisYear', label: 'This Year' },
  ];

  readonly reportLinks = computed<ReportHubLink[]>(() => {
    const links: ReportHubLink[] = [
      { title: 'Executive Dashboard', description: 'Top-line view of revenue, share, and operating risk.', section: 'executive', icon: 'monitoring' },
      { title: 'Users', description: 'Compare user performance across every active role.', section: 'users', icon: 'group' },
      { title: 'Hunters', description: 'Research volume, listed output, and quality outcomes.', section: 'hunters', icon: 'travel_explore' },
      { title: 'Listers', description: 'Listing throughput and change-request pressure.', section: 'listers', icon: 'fact_check' },
      { title: 'Order Processors', description: 'Placement, shipping, and issue handling output.', section: 'order-processors', icon: 'local_shipping' },
      {
        title: 'Orders By Account',
        description: 'Account-level order volume, revenue, profit, and operational load.',
        section: 'accounts',
        icon: 'storefront',
      },
      { title: 'Products', description: 'Category, profit, ROI, and order generation by product.', section: 'products', icon: 'inventory_2' },
      { title: 'Orders', description: 'Revenue, delivery, refund, and issue performance.', section: 'orders', icon: 'receipt_long' },
      { title: 'Teams', description: 'Team coverage, contribution mix, and profit impact.', section: 'teams', icon: 'groups' },
      { title: 'Categories', description: 'Which categories drive output, profit, and issues.', section: 'categories', icon: 'category' },
      { title: 'Marketplaces', description: 'Marketplace and country distribution at a glance.', section: 'marketplaces', icon: 'public' },
      { title: 'Activity', description: 'Report usage and auditable operational activity.', section: 'activity', icon: 'history' },
    ];

    if (this.scope() !== 'hr') {
      links.splice(8, 0, {
        title: 'HR Analytics',
        description: 'Employees, attendance, payroll, leaves, and expenses.',
        section: 'hr',
        icon: 'badge',
      });
    } else {
      links.unshift({
        title: 'HR Analytics',
        description: 'Employees, attendance, payroll, leaves, and expenses.',
        section: 'hr',
        icon: 'badge',
      });
    }

    return links;
  });

  readonly kpiCards = computed<KpiCard[]>(() => {
    const summary = this.summary();

    if (!summary) {
      return [];
    }

    return [
      { label: 'Total Revenue', value: this.formatMoney(summary.totalRevenue), hint: 'Gross order revenue in the active range.', section: 'orders' },
      { label: 'Total Profit', value: this.formatMoney(summary.totalProfit), hint: 'Captured order profit after costs.', section: 'orders' },
      { label: 'Company Share', value: this.formatMoney(summary.companyShare), hint: 'Company profit share based on account rules.', section: 'accounts' },
      { label: 'Client Share', value: this.formatMoney(summary.clientShare), hint: 'Client-side share from the same order pool.', section: 'accounts' },
      { label: 'Total Orders', value: this.formatInteger(summary.totalOrders), hint: 'All orders in the current filter.', section: 'orders' },
      { label: 'Delivered Orders', value: this.formatInteger(summary.deliveredOrders), hint: 'Delivered outcomes.', section: 'orders', queryParams: { status: 'DELIVERED' } },
      { label: 'Cancelled Orders', value: this.formatInteger(summary.cancelledOrders), hint: 'Cancelled orders.', section: 'orders', queryParams: { status: 'CANCELLED' } },
      { label: 'Refunded Orders', value: this.formatInteger(summary.refundedOrders), hint: 'Refunded orders.', section: 'orders', queryParams: { status: 'REFUNDED' } },
      { label: 'Hunted Products', value: this.formatInteger(summary.huntedProducts), hint: 'Products submitted in the active window.', section: 'products' },
      { label: 'Listed Products', value: this.formatInteger(summary.listedProducts), hint: 'Products that made it live.', section: 'products', queryParams: { status: 'listed' } },
      { label: 'Rejected Products', value: this.formatInteger(summary.rejectedProducts), hint: 'Rejected submissions.', section: 'products', queryParams: { status: 'rejected' } },
      { label: 'Average ROI', value: `${summary.averageRoi.toFixed(2)}%`, hint: 'Average ROI across orders in scope.', section: 'products' },
      { label: 'Open Issues', value: this.formatInteger(summary.openIssues), hint: 'Orders currently blocked or in issue review.', section: 'orders', queryParams: { status: 'ISSUE' } },
      { label: 'Pending Change Requests', value: this.formatInteger(summary.pendingChangeRequests), hint: 'Open or in-progress product fixes.', section: 'listers' },
    ];
  });

  ngOnInit(): void {
    this.scope.set((this.route.snapshot.data['reportScope'] as ReportScope) || 'admin');

    this.referenceData.getUsers().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (users) =>
        this.users.set(
          users.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            roles: user.roles?.length ? user.roles : [user.role],
          })),
        ),
    });

    this.referenceData.getAccounts(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (accounts) =>
        this.accounts.set(
          accounts.map((account) => ({
            id: account.id,
            name: account.name,
            marketplace: account.marketplace,
            country: account.country || null,
          })),
        ),
    });

    this.referenceData.getProductCategories(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (categories) => this.categories.set(categories),
    });

    this.teamApi.listTeams().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (teams) => this.teams.set(teams.map((team) => ({ id: team.id, name: team.name }))),
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (!params.keys.length) {
        this.applyPreset('thisMonth', false);
        return;
      }

      const patch = {
        role: params.get('role') || '',
        teamId: params.get('teamId') || '',
        userId: params.get('userId') || '',
        accountId: params.get('accountId') || '',
        marketplace: params.get('marketplace') || '',
        country: params.get('country') || '',
        category: params.get('category') || '',
        dateFrom: params.get('dateFrom') || '',
        dateTo: params.get('dateTo') || '',
      };

      this.filtersForm.patchValue(patch, { emitEvent: false });
      this.selectedPreset.set((params.get('preset') as DatePreset) || 'custom');
      this.loadReports(this.buildFiltersFromForm());
    });
  }

  applyPreset(preset: DatePreset, navigate = true): void {
    this.selectedPreset.set(preset);
    const range = this.resolvePresetDates(preset);
    this.filtersForm.patchValue(range, { emitEvent: false });

    if (navigate) {
      this.applyFilters();
    }
  }

  applyFilters(): void {
    const filters = this.buildFiltersFromForm();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        ...filters,
        preset: this.selectedPreset(),
      },
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  resetFilters(): void {
    this.filtersForm.reset(
      {
        role: '',
        teamId: '',
        userId: '',
        accountId: '',
        marketplace: '',
        country: '',
        category: '',
        dateFrom: '',
        dateTo: '',
      },
      { emitEvent: false },
    );
    this.applyPreset('thisMonth');
  }

  openSection(section: ReportSection, queryParams: Record<string, string> = {}): void {
    this.reportApi
      .trackEvent({
        kind: 'DRILLDOWN',
        section,
        meta: { scope: this.scope() },
      })
      .subscribe({ error: () => undefined });

    this.router.navigate([section], {
      relativeTo: this.route,
      queryParams: {
        ...this.buildFiltersFromForm(),
        ...queryParams,
      },
    });
  }

  exportSummary(): void {
    const summary = this.summary();
    const executive = this.executive();

    if (!summary || !executive) {
      return;
    }

    this.exporting.set(true);
    const rows = this.kpiCards().map((card) => ({
      Metric: card.label,
      Value: card.value,
      Notes: card.hint,
    }));

    rows.push(
      ...executive.topHunters.map((row) => ({
        Metric: `Top Hunter: ${row.name}`,
        Value: row.metrics.profit ? this.formatMoney(row.metrics.profit) : this.formatInteger(row.metrics.primary),
        Notes: `${row.metrics.primaryLabel}: ${row.metrics.primary} | ${row.metrics.secondaryLabel}: ${row.metrics.secondary}`,
      })),
    );

    this.exportService.downloadWorkbook({
      filename: `reports-hub-${this.scope()}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Reports Hub',
      rows,
    });

    this.reportApi
      .trackEvent({
        kind: 'EXPORT',
        section: 'hub',
        meta: { scope: this.scope() },
      })
      .subscribe({ error: () => undefined });

    this.exporting.set(false);
    this.toast.success('Reports hub exported to Excel.');
  }

  private loadReports(filters: ReportFilters): void {
    this.loading.set(true);
    this.error.set('');

    forkJoin({
      summary: this.reportApi.getSummary(filters),
      executive: this.reportApi.getExecutive(filters),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ summary, executive }) => {
          this.summary.set(summary);
          this.executive.set(executive);
          this.loading.set(false);
          this.reportApi
            .trackEvent({
              kind: 'VIEW',
              section: 'hub',
              meta: { scope: this.scope(), filters },
            })
            .subscribe({ error: () => undefined });
        },
        error: (error) => {
          this.loading.set(false);
          this.error.set(error?.error?.message || 'Could not load the reports hub.');
        },
      });
  }

  private buildFiltersFromForm(): ReportFilters {
    const raw = this.filtersForm.getRawValue();
    return Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value),
    ) as ReportFilters;
  }

  private resolvePresetDates(preset: DatePreset): Pick<ReportFilters, 'dateFrom' | 'dateTo'> {
    const now = new Date();
    const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const format = (date: Date) => toLocalDateInput(date);
    const addDays = (date: Date, amount: number) => {
      const next = new Date(date);
      next.setDate(next.getDate() + amount);
      return next;
    };

    switch (preset) {
      case 'today':
        return { dateFrom: format(current), dateTo: format(current) };
      case 'yesterday': {
        const yesterday = addDays(current, -1);
        return { dateFrom: format(yesterday), dateTo: format(yesterday) };
      }
      case 'thisWeek': {
        const weekday = current.getDay();
        const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
        return { dateFrom: format(addDays(current, mondayOffset)), dateTo: format(current) };
      }
      case 'lastMonth': {
        const firstDay = new Date(current.getFullYear(), current.getMonth() - 1, 1);
        const lastDay = new Date(current.getFullYear(), current.getMonth(), 0);
        return { dateFrom: format(firstDay), dateTo: format(lastDay) };
      }
      case 'thisYear':
        return {
          dateFrom: format(new Date(current.getFullYear(), 0, 1)),
          dateTo: format(current),
        };
      case 'custom':
        return {
          dateFrom: this.filtersForm.controls.dateFrom.value,
          dateTo: this.filtersForm.controls.dateTo.value,
        };
      case 'thisMonth':
      default:
        return {
          dateFrom: format(new Date(current.getFullYear(), current.getMonth(), 1)),
          dateTo: format(current),
        };
    }
  }

  private formatMoney(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }

  private formatInteger(value: number): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
  }
}
