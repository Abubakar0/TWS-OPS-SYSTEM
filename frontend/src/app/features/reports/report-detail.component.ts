import { CommonModule, CurrencyPipe, JsonPipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { combineLatest, firstValueFrom } from 'rxjs';

import { ReportApiService } from '../../core/api/report-api.service';
import { TeamApiService } from '../../core/api/team-api.service';
import { AccountReportDetails, AccountReportRow, ActivityReportRow, ActivityReportSummary, CategoryReportRow, ExecutiveReport, HrReportBundle, MarketplaceReportRow, OrderReportDetails, OrderReportRow, ProductReportDetails, ProductReportRow, ReportFilters, ReportScope, ReportSection, TeamReportRow, UserReportRow } from '../../core/models/report.models';
import { ProductCategory } from '../../core/models/product.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { ToastService } from '../../core/ui/toast.service';
import { ExportService } from '../../core/services/export.service';
import { FilterPanelComponent } from '../../shared/ui/filter-panel.component';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/ui/searchable-select.component';

interface DisplayRow {
  id: string;
  title: string;
  subtitle: string;
  cells: string[];
  badges?: string[];
  raw: unknown;
}

type DateQuickPreset = 'today' | 'yesterday';

const toLocalDateInput = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    CurrencyPipe,
    JsonPipe,
    TitleCasePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    FilterPanelComponent,
    SearchableSelectComponent,
  ],
  templateUrl: './report-detail.component.html',
  styleUrl: './report-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reportApi = inject(ReportApiService);
  private readonly referenceData = inject(ReferenceDataService);
  private readonly teamApi = inject(TeamApiService);
  private readonly exportService = inject(ExportService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scope = signal<ReportScope>('admin');
  readonly section = signal<ReportSection>('users');
  readonly sectionItems = signal<unknown[]>([]);
  readonly executive = signal<ExecutiveReport | null>(null);
  readonly hrBundle = signal<HrReportBundle | null>(null);
  readonly activitySummary = signal<ActivityReportSummary | null>(null);
  readonly selectedDetail = signal<unknown | null>(null);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly page = signal(1);
  readonly limit = signal(30);
  readonly total = signal(0);
  readonly hasMore = signal(false);
  readonly accounts = signal<Array<{ id: string; name: string; marketplace: string; country?: string | null }>>([]);
  readonly users = signal<Array<{ id: string; name: string; roles: string[] }>>([]);
  readonly categories = signal<ProductCategory[]>([]);
  readonly teams = signal<Array<{ id: string; name: string }>>([]);

  readonly filtersForm = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    role: new FormControl('', { nonNullable: true }),
    status: new FormControl('', { nonNullable: true }),
    teamId: new FormControl('', { nonNullable: true }),
    userId: new FormControl('', { nonNullable: true }),
    accountId: new FormControl('', { nonNullable: true }),
    marketplace: new FormControl('', { nonNullable: true }),
    country: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  readonly pageSizes = [30, 50, 100];
  readonly quickRanges: Array<{ key: DateQuickPreset; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
  ];

  readonly roleOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All roles', description: 'Keep every role visible.' },
    { value: 'hunter', label: 'Hunters' },
    { value: 'lister', label: 'Listers' },
    { value: 'order_processor', label: 'Order Processors' },
    { value: 'hr', label: 'HR' },
    { value: 'admin', label: 'Admins' },
    ...(this.scope() === 'superadmin' ? [{ value: 'super_admin', label: 'Super Admins' }] : []),
  ]);

  readonly statusOptions = computed<readonly SearchableSelectOption<string>[]>(() => {
    switch (this.section()) {
      case 'products':
        return [
          { value: '', label: 'All statuses' },
          { value: 'approved', label: 'Approved' },
          { value: 'assigned', label: 'Assigned' },
          { value: 'listed', label: 'Listed' },
          { value: 'rejected', label: 'Rejected' },
        ];
      case 'orders':
        return [
          { value: '', label: 'All statuses' },
          { value: 'PLACED', label: 'Placed' },
          { value: 'SHIPPED', label: 'Shipped' },
          { value: 'DELIVERED', label: 'Delivered' },
          { value: 'RETURNED', label: 'Returned' },
          { value: 'CANCELLED', label: 'Cancelled' },
          { value: 'REFUNDED', label: 'Refunded' },
          { value: 'ON_HOLD', label: 'On Hold' },
          { value: 'ISSUE', label: 'Issue' },
        ];
      case 'accounts':
        return [
          { value: '', label: 'All account states' },
          { value: 'active', label: 'Active' },
          { value: 'disabled', label: 'Disabled' },
        ];
      default:
        return [{ value: '', label: 'All statuses' }];
    }
  });

  readonly teamOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All teams' },
    ...this.teams().map((team) => ({ value: team.id, label: team.name })),
  ]);

  readonly userOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All users' },
    ...this.users().map((user) => ({ value: user.id, label: user.name, description: user.roles.join(', ') })),
  ]);

  readonly accountOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All accounts' },
    ...this.accounts().map((account) => ({ value: account.id, label: account.name, description: account.marketplace })),
  ]);

  readonly marketplaceOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All marketplaces' },
    ...[...new Set(this.accounts().map((account) => account.marketplace).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right))
      .map((marketplace) => ({ value: marketplace, label: marketplace })),
  ]);

  readonly countryOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All countries' },
    ...[...new Set(this.accounts().map((account) => account.country).filter(Boolean) as string[])]
      .sort((left, right) => left.localeCompare(right))
      .map((country) => ({ value: country, label: country })),
  ]);

  readonly categoryOptions = computed<readonly SearchableSelectOption<string>[]>(() => [
    { value: '', label: 'All categories' },
    ...this.categories().map((category) => ({ value: category.name, label: category.name })),
  ]);

  readonly pageTitle = computed(() => this.sectionLabel(this.section()));
  readonly pageDescription = computed(() => this.sectionDescription(this.section()));

  readonly columns = computed(() => {
    switch (this.section()) {
      case 'users':
      case 'hunters':
      case 'listers':
      case 'order-processors':
      case 'admins':
        return ['Team / Roles', 'Primary', 'Secondary', 'Profit / ROI'];
      case 'accounts':
        return ['Market / Country', 'Listings', 'Orders', 'Profit'];
      case 'products':
        return ['Hunter / Lister', 'Status', 'Prices', 'Orders'];
      case 'orders':
        return ['Account', 'Status', 'Financials', 'Dates'];
      case 'teams':
        return ['Members', 'Coverage', 'Orders', 'Profit'];
      case 'categories':
        return ['Products', 'Listed', 'Orders', 'Profit'];
      case 'marketplaces':
        return ['Country', 'Accounts', 'Orders', 'Profit'];
      case 'activity':
        return ['Actor', 'Action', 'Target', 'When'];
      case 'hr':
        return ['Department', 'Status', 'Role', 'Designation'];
      default:
        return [];
    }
  });

  readonly displayRows = computed<DisplayRow[]>(() => {
    const section = this.section();
    const rows = this.sectionItems();

    switch (section) {
      case 'users':
      case 'hunters':
      case 'listers':
      case 'order-processors':
      case 'admins':
        return (rows as UserReportRow[]).map((row) => ({
          id: row.id,
          title: row.name,
          subtitle: row.email,
          cells: [
            `${row.teamName || 'No team'} | ${row.roles.join(', ')}`,
            `${row.metrics.primaryLabel}: ${row.metrics.primary}`,
            `${row.metrics.secondaryLabel}: ${row.metrics.secondary}`,
            `${this.formatMoney(row.metrics.profit)} | ${row.metrics.roi.toFixed(2)}%`,
          ],
          badges: [row.role.replaceAll('_', ' '), row.status],
          raw: row,
        }));
      case 'accounts':
        return (rows as AccountReportRow[]).map((row) => ({
          id: row.id,
          title: row.name,
          subtitle: row.isActive ? 'Active account' : 'Disabled account',
          cells: [
            `${this.titleCase(row.marketplace)}${row.country ? ' | ' + row.country : ''}`,
            `Listed ${row.totalListed} | Pending ${row.pendingListings}`,
            `Orders ${row.totalOrders} | Delivered ${row.deliveredOrders}`,
            `${this.formatMoney(row.totalProfit)} | ${row.openIssues} issues`,
          ],
          badges: [row.currency, row.isActive ? 'Active' : 'Disabled'],
          raw: row,
        }));
      case 'products':
        return (rows as ProductReportRow[]).map((row) => ({
          id: row.id,
          title: row.title || row.asin || 'Untitled product',
          subtitle: row.asin || row.customLabel || 'No ASIN',
          cells: [
            `${row.hunterName || 'No hunter'} | ${row.listerName || 'No lister'}`,
            `${this.titleCase(row.status)}${row.category ? ' | ' + row.category : ''}`,
            `${this.formatMoney(row.amazonPrice || 0)} -> ${this.formatMoney(row.ebayPrice || 0)}`,
            `${row.orderCount} orders | ${row.issueCount} issues`,
          ],
          badges: [row.accountName || 'No account'],
          raw: row,
        }));
      case 'orders':
        return (rows as OrderReportRow[]).map((row) => ({
          id: row.id,
          title: row.orderCode,
          subtitle: row.productTitle || row.asin || row.ebayOrderId,
          cells: [
            `${row.accountName || 'No account'}${row.marketplace ? ' | ' + this.titleCase(row.marketplace) : ''}`,
            `${row.orderStatus} | ${row.placementStatus}${row.issueStatus ? ' | ' + row.issueStatus : ''}`,
            `${this.formatMoney(row.profit)} | ${row.roi.toFixed(2)}% ROI`,
            `${this.formatDate(row.orderDate)}${row.deliveredDate ? ' | ' + this.formatDate(row.deliveredDate) : ''}`,
          ],
          badges: [row.hunterName || 'No hunter', row.listerName || 'No lister'],
          raw: row,
        }));
      case 'teams':
        return (rows as TeamReportRow[]).map((row) => ({
          id: row.id,
          title: row.name,
          subtitle: row.description || 'No description',
          cells: [
            `${row.membersCount} members`,
            `${row.hunters} hunters | ${row.listers} listers`,
            `${row.totalOrders} orders | ${row.listedProducts} listed`,
            this.formatMoney(row.totalProfit),
          ],
          raw: row,
        }));
      case 'categories':
        return (rows as CategoryReportRow[]).map((row) => ({
          id: row.category,
          title: row.category,
          subtitle: `${row.productCount} products in scope`,
          cells: [
            `${row.productCount} total`,
            `${row.listedCount} listed | ${row.rejectedCount} rejected`,
            `${row.orderCount} orders | ${row.openIssues} issues`,
            this.formatMoney(row.profit),
          ],
          raw: row,
        }));
      case 'marketplaces':
        return (rows as MarketplaceReportRow[]).map((row) => ({
          id: `${row.marketplace}-${row.country}`,
          title: this.titleCase(row.marketplace),
          subtitle: row.country,
          cells: [
            row.country,
            `${row.accountsCount} accounts`,
            `${row.orderCount} orders | ${row.listedCount} listed`,
            this.formatMoney(row.profit),
          ],
          raw: row,
        }));
      case 'activity':
        return (rows as ActivityReportRow[]).map((row) => ({
          id: row.id,
          title: row.action,
          subtitle: row.details?.['section'] ? String(row.details?.['section']) : row.targetType || 'Activity',
          cells: [
            `${row.actorName || 'System'}${row.actorRole ? ' | ' + row.actorRole : ''}`,
            row.action,
            row.orderCode || row.productTitle || row.accountName || row.targetName || 'No target',
            this.formatDate(row.createdAt, true),
          ],
          raw: row,
        }));
      case 'hr': {
        const employees = this.hrBundle()?.employees.items || [];
        return employees.map((row: Record<string, unknown>) => ({
          id: String(row['id']),
          title: String(row['fullName'] || row['employeeCode'] || 'Employee'),
          subtitle: String(row['email'] || ''),
          cells: [
            `${String(row['department'] || 'No department')}`,
            `${String(row['employmentStatus'] || 'Unknown')}`,
            `${String(row['role'] || '')}`,
            `${String(row['designation'] || 'No designation')}`,
          ],
          raw: row,
        }));
      }
      default:
        return [];
    }
  });

  readonly facts = computed<Array<{ label: string; value: string }>>(() => {
    const section = this.section();
    const detail = this.selectedDetail();

    if (!detail) {
      return [];
    }

    switch (section) {
      case 'users':
      case 'hunters':
      case 'listers':
      case 'order-processors':
      case 'admins': {
        const row = detail as UserReportRow;
        return [
          { label: 'Team', value: row.teamName || 'Not assigned' },
          { label: 'Roles', value: row.roles.join(', ') },
          { label: row.metrics.primaryLabel, value: String(row.metrics.primary) },
          { label: row.metrics.secondaryLabel, value: String(row.metrics.secondary) },
          { label: row.metrics.tertiaryLabel, value: String(row.metrics.tertiary) },
          { label: 'Profit', value: this.formatMoney(row.metrics.profit) },
          { label: 'Average ROI', value: `${row.metrics.roi.toFixed(2)}%` },
        ];
      }
      case 'accounts': {
        const row = detail as AccountReportDetails;
        return [
          { label: 'Marketplace', value: this.titleCase(row.account.marketplace) },
          { label: 'Country', value: row.account.country || 'Unspecified' },
          { label: 'Assigned Listers', value: String(row.stats.assignedListerCount) },
          { label: 'Total Orders', value: String(row.stats.totalOrders) },
          { label: 'Total Profit', value: this.formatMoney(row.stats.totalProfit) },
          { label: 'Company Share', value: this.formatMoney(row.split.companyShare) },
          { label: 'Client Share', value: this.formatMoney(row.split.clientShare) },
          { label: 'Open Change Requests', value: String(row.stats.openChangeRequests) },
        ];
      }
      case 'products': {
        const row = detail as ProductReportDetails;
        return [
          { label: 'Category', value: row.product.category || 'Uncategorized' },
          { label: 'Status', value: this.titleCase(row.product.status) },
          { label: 'Account', value: row.product.accountName || 'Not assigned' },
          { label: 'Profit', value: this.formatMoney(row.product.profit) },
          { label: 'ROI', value: `${row.product.roi.toFixed(2)}%` },
          { label: 'Orders', value: String(row.metrics.orderCount) },
          { label: 'Open Issues', value: String(row.metrics.issueCount) },
          { label: 'Last Order', value: row.metrics.lastOrderDate ? this.formatDate(row.metrics.lastOrderDate, true) : 'No orders yet' },
        ];
      }
      case 'orders': {
        const row = detail as OrderReportDetails;
        return [
          { label: 'Order Status', value: row.order.orderStatus },
          { label: 'Placement Status', value: row.order.placementStatus },
          { label: 'Profit', value: this.formatMoney(row.order.profit) },
          { label: 'ROI', value: `${row.order.roi.toFixed(2)}%` },
          { label: 'Account', value: row.order.accountName || 'No account' },
          { label: 'Hunter', value: row.order.hunterName || 'No hunter' },
          { label: 'Lister', value: row.order.listerName || 'No lister' },
          { label: 'Issue Status', value: row.order.issueStatus || 'No issue' },
        ];
      }
      case 'teams': {
        const row = detail as TeamReportRow;
        return [
          { label: 'Members', value: String(row.membersCount) },
          { label: 'Hunters', value: String(row.hunters) },
          { label: 'Listers', value: String(row.listers) },
          { label: 'Admins', value: String(row.admins) },
          { label: 'HR', value: String(row.hrs) },
          { label: 'Listed Products', value: String(row.listedProducts) },
          { label: 'Total Orders', value: String(row.totalOrders) },
          { label: 'Total Profit', value: this.formatMoney(row.totalProfit) },
        ];
      }
      case 'categories': {
        const row = detail as CategoryReportRow;
        return [
          { label: 'Products', value: String(row.productCount) },
          { label: 'Listed', value: String(row.listedCount) },
          { label: 'Rejected', value: String(row.rejectedCount) },
          { label: 'Orders', value: String(row.orderCount) },
          { label: 'Revenue', value: this.formatMoney(row.revenue) },
          { label: 'Profit', value: this.formatMoney(row.profit) },
          { label: 'Average ROI', value: `${row.averageRoi.toFixed(2)}%` },
          { label: 'Open Issues', value: String(row.openIssues) },
        ];
      }
      case 'marketplaces': {
        const row = detail as MarketplaceReportRow;
        return [
          { label: 'Marketplace', value: this.titleCase(row.marketplace) },
          { label: 'Country', value: row.country },
          { label: 'Accounts', value: String(row.accountsCount) },
          { label: 'Listed Products', value: String(row.listedCount) },
          { label: 'Orders', value: String(row.orderCount) },
          { label: 'Revenue', value: this.formatMoney(row.revenue) },
          { label: 'Profit', value: this.formatMoney(row.profit) },
          { label: 'Company Share', value: this.formatMoney(row.companyShare) },
        ];
      }
      case 'activity': {
        const row = detail as ActivityReportRow;
        return [
          { label: 'Action', value: row.action },
          { label: 'Actor', value: row.actorName || 'System' },
          { label: 'Role', value: row.actorRole || 'System' },
          { label: 'Target', value: row.orderCode || row.productTitle || row.accountName || row.targetName || 'None' },
          { label: 'Created', value: this.formatDate(row.createdAt, true) },
        ];
      }
      case 'hr': {
        const row = detail as Record<string, unknown>;
        return [
          { label: 'Department', value: String(row['department'] || 'No department') },
          { label: 'Designation', value: String(row['designation'] || 'No designation') },
          { label: 'Status', value: String(row['employmentStatus'] || 'Unknown') },
          { label: 'Joining Date', value: row['joiningDate'] ? this.formatDate(String(row['joiningDate'])) : 'Not set' },
          { label: 'Role', value: String(row['role'] || '') },
          { label: 'Profile Review', value: String(row['profileReviewStatus'] || 'APPROVED') },
        ];
      }
      default:
        return [];
    }
  });

  readonly selectedTitle = computed(() => {
    const detail = this.selectedDetail();
    const section = this.section();

    if (!detail) {
      return '';
    }

    switch (section) {
      case 'users':
      case 'hunters':
      case 'listers':
      case 'order-processors':
      case 'admins':
        return (detail as UserReportRow).name;
      case 'accounts':
        return (detail as AccountReportDetails).account.name;
      case 'products':
        return (detail as ProductReportDetails).product.title || (detail as ProductReportDetails).product.asin || 'Product details';
      case 'orders':
        return (detail as OrderReportDetails).order.orderCode;
      case 'teams':
        return (detail as TeamReportRow).name;
      case 'categories':
        return (detail as CategoryReportRow).category;
      case 'marketplaces': {
        const row = detail as MarketplaceReportRow;
        return `${this.titleCase(row.marketplace)} - ${row.country}`;
      }
      case 'activity':
        return (detail as ActivityReportRow).action;
      case 'hr':
        return String((detail as Record<string, unknown>)['fullName'] || 'Employee details');
      case 'executive':
      default:
        return '';
    }
  });

  readonly selectedSubtitle = computed(() => {
    const detail = this.selectedDetail();
    const section = this.section();

    if (!detail) {
      return '';
    }

    switch (section) {
      case 'users':
      case 'hunters':
      case 'listers':
      case 'order-processors':
      case 'admins':
        return (detail as UserReportRow).email;
      case 'accounts':
        return (detail as AccountReportDetails).account.marketplace;
      case 'products':
        return (detail as ProductReportDetails).product.accountName || 'No account assigned';
      case 'orders':
        return (detail as OrderReportDetails).order.productTitle || (detail as OrderReportDetails).order.asin || 'Order details';
      case 'teams':
        return (detail as TeamReportRow).description || 'Team details';
      case 'categories':
        return 'Category performance';
      case 'marketplaces':
        return 'Marketplace performance';
      case 'activity':
        return (detail as ActivityReportRow).actorName || 'System';
      case 'hr':
        return String((detail as Record<string, unknown>)['email'] || '');
      default:
        return '';
    }
  });

  ngOnInit(): void {
    this.scope.set((this.route.snapshot.data['reportScope'] as ReportScope) || 'admin');

    this.referenceData.getUsers().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (users) =>
        this.users.set(users.map((user) => ({ id: user.id, name: user.name, roles: user.roles?.length ? user.roles : [user.role] }))),
    });
    this.referenceData.getAccounts(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (accounts) => this.accounts.set(accounts.map((account) => ({ id: account.id, name: account.name, marketplace: account.marketplace, country: account.country || null }))),
    });
    this.referenceData.getProductCategories(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (categories) => this.categories.set(categories),
    });
    this.teamApi.listTeams().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (teams) => this.teams.set(teams.map((team) => ({ id: team.id, name: team.name }))),
    });

    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([routeParams, queryParams]) => {
        const nextSection = (routeParams.get('section') as ReportSection) || 'users';
        const sectionChanged = nextSection !== this.section();
        this.section.set(nextSection);

        if (sectionChanged) {
          this.selectedDetail.set(null);
        }

        this.page.set(Number(queryParams.get('page') || 1));
        this.limit.set(Number(queryParams.get('limit') || 30));
        this.filtersForm.patchValue(
          {
            search: queryParams.get('search') || '',
            role: queryParams.get('role') || '',
            status: queryParams.get('status') || '',
            teamId: queryParams.get('teamId') || '',
            userId: queryParams.get('userId') || '',
            accountId: queryParams.get('accountId') || '',
            marketplace: queryParams.get('marketplace') || '',
            country: queryParams.get('country') || '',
            category: queryParams.get('category') || '',
            dateFrom: queryParams.get('dateFrom') || '',
            dateTo: queryParams.get('dateTo') || '',
          },
          { emitEvent: false },
        );
        this.loadCurrentSection();
      });
  }

  applyFilters(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        ...this.buildFilters(),
        page: 1,
        limit: this.limit(),
      },
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  resetFilters(): void {
    this.filtersForm.reset(
      {
        search: '',
        role: '',
        status: '',
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
    this.applyFilters();
  }

  applyDatePreset(preset: DateQuickPreset): void {
    const target = new Date();

    if (preset === 'yesterday') {
      target.setDate(target.getDate() - 1);
    }

    const date = toLocalDateInput(target);
    this.filtersForm.patchValue(
      {
        dateFrom: date,
        dateTo: date,
      },
      { emitEvent: false },
    );
    this.applyFilters();
  }

  openRow(row: DisplayRow): void {
    const section = this.section();
    const raw = row.raw;
    const filters = this.buildFilters();

    this.reportApi
      .trackEvent({ kind: 'DRILLDOWN', section, targetId: row.id, meta: { scope: this.scope() } })
      .subscribe({ error: () => undefined });

    if (section === 'users') {
      this.reportApi.getUser(row.id, filters).subscribe({ next: (detail) => this.selectedDetail.set(detail) });
      return;
    }
    if (section === 'hunters') {
      this.reportApi.getHunter(row.id, filters).subscribe({ next: (detail) => this.selectedDetail.set(detail) });
      return;
    }
    if (section === 'listers') {
      this.reportApi.getLister(row.id, filters).subscribe({ next: (detail) => this.selectedDetail.set(detail) });
      return;
    }
    if (section === 'order-processors') {
      this.reportApi.getOrderProcessor(row.id, filters).subscribe({ next: (detail) => this.selectedDetail.set(detail) });
      return;
    }
    if (section === 'admins') {
      this.reportApi.getAdmin(row.id, filters).subscribe({ next: (detail) => this.selectedDetail.set(detail) });
      return;
    }
    if (section === 'accounts') {
      this.reportApi.getAccount(row.id).subscribe({ next: (detail) => this.selectedDetail.set(detail) });
      return;
    }
    if (section === 'products') {
      this.reportApi.getProduct(row.id).subscribe({ next: (detail) => this.selectedDetail.set(detail) });
      return;
    }
    if (section === 'orders') {
      this.reportApi.getOrder(row.id).subscribe({ next: (detail) => this.selectedDetail.set(detail) });
      return;
    }

    this.selectedDetail.set(raw);
  }

  async exportSection(): Promise<void> {
    this.exporting.set(true);

    try {
      const section = this.section();

      if (section === 'executive' && this.executive()) {
        this.exportExecutive();
      } else if (section === 'hr' && this.hrBundle()) {
        this.exportHr();
      } else {
        const rows = await this.fetchAllRows(section);
        this.exportService.downloadWorkbook({
          filename: `reports-${section}-${new Date().toISOString().slice(0, 10)}.xlsx`,
          sheetName: this.sectionLabel(section),
          rows,
        });
      }

      this.reportApi
        .trackEvent({
          kind: 'EXPORT',
          section,
          meta: { scope: this.scope(), filters: this.buildFilters() },
        })
        .subscribe({ error: () => undefined });

      this.toast.success(`${this.sectionLabel(section)} exported successfully.`);
    } finally {
      this.exporting.set(false);
    }
  }

  previousPage(): void {
    if (this.page() <= 1) {
      return;
    }

    this.changePage(this.page() - 1);
  }

  nextPage(): void {
    if (!this.hasMore()) {
      return;
    }

    this.changePage(this.page() + 1);
  }

  changePage(page: number): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...this.buildFilters(), page, limit: this.limit() },
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  changeLimit(limit: string): void {
    const nextLimit = Number(limit || 30);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...this.buildFilters(), page: 1, limit: nextLimit },
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  private loadCurrentSection(): void {
    const section = this.section();
    const filters = {
      ...this.buildFilters(),
      page: this.page(),
      limit: this.limit(),
    };

    this.loading.set(true);
    this.error.set('');

    const onSuccess = () => {
      this.loading.set(false);
      this.reportApi.trackEvent({ kind: 'VIEW', section, meta: { scope: this.scope(), filters } }).subscribe({ error: () => undefined });
    };

    const onError = (error: unknown) => {
      this.loading.set(false);
      this.error.set((error as { error?: { message?: string } })?.error?.message || 'Could not load this report.');
    };

    switch (section) {
      case 'executive':
        this.reportApi.getExecutive(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (executive) => {
            this.executive.set(executive);
            this.sectionItems.set([]);
            this.total.set(0);
            this.hasMore.set(false);
            onSuccess();
          },
          error: onError,
        });
        return;
      case 'users':
        this.reportApi.listUsers(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'hunters':
        this.reportApi.listHunters(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'listers':
        this.reportApi.listListers(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'order-processors':
        this.reportApi.listOrderProcessors(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'admins':
        this.reportApi.listAdmins(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'accounts':
        this.reportApi.listAccounts(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'products':
        this.reportApi.listProducts(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'orders':
        this.reportApi.listOrders(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'hr':
        this.reportApi.getHr(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (bundle) => {
            this.hrBundle.set(bundle);
            this.sectionItems.set(bundle.employees.items);
            this.total.set(bundle.employees.total);
            this.hasMore.set(bundle.employees.hasMore);
            onSuccess();
          },
          error: onError,
        });
        return;
      case 'teams':
        this.reportApi.listTeams(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'categories':
        this.reportApi.listCategories(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'marketplaces':
        this.reportApi.listMarketplaces(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.assignPage(result, onSuccess), error: onError });
        return;
      case 'activity':
        this.reportApi.listActivity(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (result) => {
            this.activitySummary.set(result.summary);
            this.assignPage(result, onSuccess);
          },
          error: onError,
        });
        return;
      default:
        this.loading.set(false);
    }
  }

  private assignPage(result: { items: unknown[]; page: number; limit: number; total: number; hasMore: boolean }, callback: () => void): void {
    this.executive.set(null);
    this.hrBundle.set(null);
    this.sectionItems.set(result.items);
    this.page.set(result.page);
    this.limit.set(result.limit);
    this.total.set(result.total);
    this.hasMore.set(result.hasMore);
    callback();
  }

  private buildFilters(): ReportFilters {
    return Object.fromEntries(
      Object.entries(this.filtersForm.getRawValue()).filter(([, value]) => value),
    ) as ReportFilters;
  }

  private async fetchAllRows(section: ReportSection): Promise<Array<Record<string, string | number | boolean | null | undefined>>> {
    const filters = this.buildFilters();
    let page = 1;
    let hasMore = true;
    const rows: Array<Record<string, string | number | boolean | null | undefined>> = [];

    while (hasMore) {
      const requestFilters = { ...filters, page, limit: 100 };
      let result:
        | { items: UserReportRow[] | AccountReportRow[] | ProductReportRow[] | OrderReportRow[] | TeamReportRow[] | CategoryReportRow[] | MarketplaceReportRow[] | ActivityReportRow[]; hasMore: boolean }
        | null = null;

      switch (section) {
        case 'users':
          result = await firstValueFrom(this.reportApi.listUsers(requestFilters));
          break;
        case 'hunters':
          result = await firstValueFrom(this.reportApi.listHunters(requestFilters));
          break;
        case 'listers':
          result = await firstValueFrom(this.reportApi.listListers(requestFilters));
          break;
        case 'order-processors':
          result = await firstValueFrom(this.reportApi.listOrderProcessors(requestFilters));
          break;
        case 'admins':
          result = await firstValueFrom(this.reportApi.listAdmins(requestFilters));
          break;
        case 'accounts':
          result = await firstValueFrom(this.reportApi.listAccounts(requestFilters));
          break;
        case 'products':
          result = await firstValueFrom(this.reportApi.listProducts(requestFilters));
          break;
        case 'orders':
          result = await firstValueFrom(this.reportApi.listOrders(requestFilters));
          break;
        case 'teams':
          result = await firstValueFrom(this.reportApi.listTeams(requestFilters));
          break;
        case 'categories':
          result = await firstValueFrom(this.reportApi.listCategories(requestFilters));
          break;
        case 'marketplaces':
          result = await firstValueFrom(this.reportApi.listMarketplaces(requestFilters));
          break;
        case 'activity':
          result = await firstValueFrom(this.reportApi.listActivity(requestFilters));
          break;
        default:
          result = null;
      }

      if (!result) {
        break;
      }

      rows.push(
        ...((result.items as unknown[]) as Array<
          Record<string, string | number | boolean | null | undefined>
        >),
      );
      hasMore = result.hasMore;
      page += 1;
    }

    return rows;
  }

  private exportExecutive(): void {
    const executive = this.executive();

    if (!executive) {
      return;
    }

    this.exportService.downloadWorkbook({
      filename: `report-executive-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Executive',
      rows: [
        ...Object.entries(executive.summary).map(([key, value]) => ({
          Group: 'Summary',
          Item: key,
          Value: typeof value === 'number' ? value : String(value),
        })),
        ...executive.topHunters.map((row) => ({
          Group: 'Top Hunters',
          Item: row.name,
          Value: row.metrics.profit,
        })),
        ...executive.topAccounts.map((row) => ({
          Group: 'Top Accounts',
          Item: row.name,
          Value: row.totalProfit,
        })),
      ],
    });
  }

  private exportHr(): void {
    const hr = this.hrBundle();

    if (!hr) {
      return;
    }

    this.exportService.downloadWorkbook({
      filename: `report-hr-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'HR',
      rows: hr.employees.items as Array<Record<string, string | number | boolean | null | undefined>>,
    });
  }

  private sectionLabel(section: ReportSection): string {
    switch (section) {
      case 'executive':
        return 'Executive Dashboard';
      case 'users':
        return 'Users';
      case 'hunters':
        return 'Hunters';
      case 'listers':
        return 'Listers';
      case 'order-processors':
        return 'Order Processors';
      case 'admins':
        return 'Admins';
      case 'accounts':
        return 'Orders By Account';
      case 'products':
        return 'Products';
      case 'orders':
        return 'Orders';
      case 'hr':
        return 'HR Analytics';
      case 'teams':
        return 'Teams';
      case 'categories':
        return 'Categories';
      case 'marketplaces':
        return 'Marketplaces';
      case 'activity':
        return 'Activity';
      default:
        return 'Report';
    }
  }

  private sectionDescription(section: ReportSection): string {
    switch (section) {
      case 'executive':
        return 'Top-line revenue, profit, share, and risk summaries.';
      case 'users':
        return 'Cross-role performance reporting for the current operating window.';
      case 'hunters':
        return 'Research output, listing conversion, and issue patterns by hunter.';
      case 'listers':
        return 'Listing throughput and change-request pressure by lister.';
      case 'order-processors':
        return 'Order placement, shipping, and issue handling output.';
      case 'admins':
        return 'Admin management, account, and reporting activity.';
      case 'accounts':
        return 'Account-level order volume, delivery outcomes, revenue, profit, and operational load.';
      case 'products':
        return 'Product performance, category mix, and order generation.';
      case 'orders':
        return 'Order status, revenue, profitability, and delivery outcome tracking.';
      case 'hr':
        return 'Employees, attendance, payroll, leaves, expenses, and performance.';
      case 'teams':
        return 'Contribution and profitability grouped by team.';
      case 'categories':
        return 'Category-level product, order, issue, and profit analysis.';
      case 'marketplaces':
        return 'Marketplace and country distribution of account and order performance.';
      case 'activity':
        return 'Auditable report usage and operational activity logs.';
      default:
        return 'Detailed report view.';
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

  private formatDate(value: string, includeTime = false): string {
    const date = new Date(value);
    return includeTime
      ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
      : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
  }

  private titleCase(value: string): string {
    return value
      .replaceAll('_', ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
