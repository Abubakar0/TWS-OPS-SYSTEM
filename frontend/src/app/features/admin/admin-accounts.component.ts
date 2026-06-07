import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged, finalize, firstValueFrom } from 'rxjs';

import { AccountInvoice, AccountInvoicePayload, AccountSummary } from '../../core/models/account.models';
import { User } from '../../core/models/auth.models';
import { Account } from '../../core/models/product.models';
import { AccountApiService } from '../../core/api/account-api.service';
import { BRANDING } from '../../core/config/branding';
import { ExportService } from '../../core/services/export.service';
import { InvoicePdfService } from '../../core/services/invoice-pdf.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import {
  AccountInvoiceForm,
  DEFAULT_ALTERNATE_PAYMENT,
  DEFAULT_INVOICE_LINE_ITEMS,
  DEFAULT_PRIMARY_PAYMENT,
  buildInvoiceDateValue,
  buildInvoiceMonthValue,
  createAccountInvoiceForm,
} from '../../shared/forms/account-invoice.form';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { FilterPanelComponent } from '../../shared/ui/filter-panel.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../shared/ui/searchable-select.component';

type AccountStatusFilter = 'all' | 'active' | 'disabled';
type MarketplaceFilter =
  | 'all'
  | 'amazon'
  | 'ebay'
  | 'walmart'
  | 'tiktok_shop'
  | 'noon'
  | 'woocommerce'
  | 'shopify';
type CountryFilter = 'all' | 'USA' | 'UK' | 'Canada' | 'UAE' | 'Pakistan' | 'Other';
type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

interface InvoicePreviewVm {
  accountName: string;
  billToName: string;
  invoiceMonthLabel: string;
  invoiceDateLabel: string;
  currency: string;
  lineItems: Array<{
    title: string;
    description: string;
    amount: number;
    includeInTotal: boolean;
  }>;
  totalNetPayable: number;
  primaryPayment: {
    title: string;
    bankName: string;
    accountNumber: string;
    iban: string;
    branch: string;
  };
  alternatePayment: {
    title: string;
    bankName: string;
    accountNumber: string;
    iban: string;
    branch: string;
  };
  notes: string;
}

@Component({
  selector: 'app-admin-accounts',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    EmptyStateComponent,
    ErrorStateComponent,
    FilterPanelComponent,
    SearchableSelectComponent,
  ],
  templateUrl: './admin-accounts.component.html',
  styleUrl: './admin-accounts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAccountsComponent implements OnInit {
  readonly branding = BRANDING;
  readonly accounts = signal<Account[]>([]);
  readonly listers = signal<User[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  readonly importingAccounts = signal(false);
  readonly importingInvoices = signal(false);
  readonly accountModalOpen = signal(false);
  readonly listerModalOpen = signal(false);
  readonly invoiceModalOpen = signal(false);
  readonly invoiceSaving = signal(false);
  readonly editingAccount = signal<Account | null>(null);
  readonly activeAccount = signal<Account | null>(null);
  readonly activeAccountSummary = signal<AccountSummary | null>(null);
  readonly selectedListerIds = signal<string[]>([]);
  readonly invoicePreview = signal<InvoicePreviewVm | null>(null);
  readonly selectedListerIdSet = computed(() => new Set(this.selectedListerIds()));
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly marketplaceControl = new FormControl<MarketplaceFilter>('all', { nonNullable: true });
  readonly countryControl = new FormControl<CountryFilter>('all', { nonNullable: true });
  readonly assignmentControl = new FormControl<AssignmentFilter>('all', { nonNullable: true });
  readonly statusControl = new FormControl<AccountStatusFilter>('all', { nonNullable: true });
  readonly searchTerm = signal('');
  readonly pageError = computed(() => !this.loading() && this.error());
  readonly detailVm = computed(() => this.activeAccountSummary());
  readonly recentInvoices = computed(() => this.activeAccountSummary()?.invoices || []);
  readonly invoiceForm: AccountInvoiceForm = createAccountInvoiceForm();

  readonly filteredAccounts = computed(() => {
    const term = this.searchTerm();
    const marketplace = this.marketplaceControl.value;
    const country = this.countryControl.value;
    const assignment = this.assignmentControl.value;
    const status = this.statusControl.value;

    return this.accounts().filter((account) => {
      const matchesMarketplace = marketplace === 'all' ? true : account.marketplace === marketplace;
      const matchesCountry = country === 'all' ? true : (account.country || 'Other') === country;
      const assigned = Boolean(account.assignedListers?.length);
      const matchesAssignment =
        assignment === 'all'
          ? true
          : assignment === 'assigned'
            ? assigned
            : !assigned;
      const matchesStatus =
        status === 'all' ? true : status === 'active' ? account.isActive : !account.isActive;
      const matchesSearch = !term
        ? true
        : [account.name, account.marketplace, account.country || '', account.currency || '']
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(term));

      return matchesMarketplace && matchesCountry && matchesAssignment && matchesStatus && matchesSearch;
    });
  });
  readonly marketplaceOptions: SearchableSelectOption<MarketplaceFilter>[] = [
    { value: 'all', label: 'All marketplaces' },
    { value: 'amazon', label: 'Amazon' },
    { value: 'ebay', label: 'eBay' },
    { value: 'walmart', label: 'Walmart' },
    { value: 'tiktok_shop', label: 'TikTok Shop' },
    { value: 'noon', label: 'Noon' },
    { value: 'woocommerce', label: 'WooCommerce' },
    { value: 'shopify', label: 'Shopify' },
  ];
  readonly countryOptions: SearchableSelectOption<CountryFilter>[] = [
    { value: 'all', label: 'All countries' },
    { value: 'USA', label: 'USA' },
    { value: 'UK', label: 'UK' },
    { value: 'Canada', label: 'Canada' },
    { value: 'UAE', label: 'UAE' },
    { value: 'Pakistan', label: 'Pakistan' },
    { value: 'Other', label: 'Other' },
  ];
  readonly assignmentOptions: SearchableSelectOption<AssignmentFilter>[] = [
    { value: 'all', label: 'All assignments' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'unassigned', label: 'Unassigned' },
  ];
  readonly statusOptions: SearchableSelectOption<AccountStatusFilter>[] = [
    { value: 'all', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'disabled', label: 'Disabled' },
  ];

  readonly accountForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    marketplace: new FormControl<Exclude<MarketplaceFilter, 'all'>>('ebay', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    country: new FormControl('', { nonNullable: true }),
    currency: new FormControl('USD', { nonNullable: true, validators: [Validators.required] }),
    isActive: new FormControl(true, { nonNullable: true }),
    clientProfitPercentage: new FormControl<number | null>(null),
    companyProfitPercentage: new FormControl<number | null>(null),
    previousOrderCount: new FormControl(0, { nonNullable: true }),
    lastMonthProfit: new FormControl(0, { nonNullable: true }),
  });

  private readonly destroyRef = inject(DestroyRef);
  private accountsSubscribed = false;

  constructor(
    private readonly accountApi: AccountApiService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly exportService: ExportService,
    private readonly invoicePdf: InvoicePdfService,
  ) {
    this.searchControl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.searchTerm.set(value.trim().toLowerCase()));

    this.accountForm.controls.country.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((country) => {
        const inferredCurrency = this.inferCurrency(country);

        if (inferredCurrency) {
          this.accountForm.controls.currency.setValue(inferredCurrency, { emitEvent: false });
        }
      });

    this.invoiceForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncInvoicePreview());

    effect(() => {
      const filtered = this.filteredAccounts();
      const active = this.activeAccount();

      if (!filtered.length) {
        if (active) {
          this.activeAccount.set(null);
          this.activeAccountSummary.set(null);
        }
        return;
      }

      if (!active || !filtered.some((account) => account.id === active.id)) {
        this.selectAccount(filtered[0]);
      }
    });
  }

  ngOnInit(): void {
    this.loadAccounts();

    this.referenceData
      .getUsers('lister')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (listers) => this.listers.set(listers),
        error: (error) => this.error.set(error?.error?.message || 'Could not load listers.'),
      });
  }

  get invoiceLineItems() {
    return this.invoiceForm.controls.lineItems.controls;
  }

  loadAccounts(): void {
    this.loading.set(true);
    this.error.set('');

    if (!this.accountsSubscribed) {
      this.accountsSubscribed = true;

      this.referenceData
        .getAccounts(true)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (accounts) => {
            this.accounts.set(accounts);
            this.loading.set(false);
          },
          error: (error) => {
            this.error.set(error?.error?.message || 'Could not load accounts.');
            this.loading.set(false);
          },
        });
      return;
    }

    this.referenceData.refreshAccounts();
    this.loading.set(false);
  }

  selectAccount(account: Account, force = false): void {
    if (!force && this.activeAccount()?.id === account.id && this.activeAccountSummary()) {
      return;
    }

    this.activeAccount.set(account);
    this.detailLoading.set(true);
    this.detailError.set('');

    this.accountApi
      .getAccountSummary(account.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.activeAccountSummary.set(summary);
          this.detailLoading.set(false);
          this.syncInvoicePreview();
        },
        error: (error) => {
          this.detailError.set(error?.error?.message || 'Could not load account details.');
          this.detailLoading.set(false);
        },
      });
  }

  resetFilters(): void {
    this.searchControl.setValue('', { emitEvent: true });
    this.marketplaceControl.setValue('all');
    this.countryControl.setValue('all');
    this.assignmentControl.setValue('all');
    this.statusControl.setValue('all');
  }

  openAccountModal(): void {
    this.editingAccount.set(null);
    this.accountForm.reset({
      name: '',
      marketplace: 'ebay',
      country: 'USA',
      currency: 'USD',
      isActive: true,
      clientProfitPercentage: 50,
      companyProfitPercentage: 50,
      previousOrderCount: 0,
      lastMonthProfit: 0,
    });
    this.accountModalOpen.set(true);
  }

  openEditAccountModal(account: Account): void {
    this.editingAccount.set(account);
    this.accountForm.reset({
      name: account.name,
      marketplace: account.marketplace as Exclude<MarketplaceFilter, 'all'>,
      country: account.country || '',
      currency: account.currency || this.inferCurrency(account.country) || 'USD',
      isActive: account.isActive,
      clientProfitPercentage: account.clientProfitPercentage ?? null,
      companyProfitPercentage: account.companyProfitPercentage ?? null,
      previousOrderCount: account.previousOrderCount || 0,
      lastMonthProfit: account.lastMonthProfit || 0,
    });
    this.accountModalOpen.set(true);
  }

  closeAccountModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.accountModalOpen.set(false);
    this.editingAccount.set(null);
  }

  openListerModal(account?: Account): void {
    const targetAccount = account || this.activeAccount();

    if (!targetAccount) {
      return;
    }

    this.activeAccount.set(targetAccount);
    this.selectedListerIds.set(targetAccount.assignedListers?.map((lister) => lister.id) || []);
    this.listerModalOpen.set(true);
  }

  closeListerModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.listerModalOpen.set(false);
    this.selectedListerIds.set([]);
  }

  toggleListerSelection(listerId: string, checked: boolean): void {
    const next = new Set(this.selectedListerIds());

    if (checked) {
      next.add(listerId);
    } else {
      next.delete(listerId);
    }

    this.selectedListerIds.set([...next]);
  }

  saveAccount(): void {
    if (this.accountForm.invalid || this.saving()) {
      this.accountForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const raw = this.accountForm.getRawValue();
    const request$ = this.editingAccount()
      ? this.accountApi.updateAccount(this.editingAccount()!.id, raw)
      : this.accountApi.createAccount(raw);

    request$
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (account) => {
          this.referenceData.refreshAccounts();
          this.workspaceSync.notifySettingsChanged();
          this.toast.success(this.editingAccount() ? 'Account updated.' : 'Account created.');
          this.closeAccountModal(true);

          if (account) {
            this.selectAccount(account, true);
          }
        },
        error: (error) => {
          this.error.set(
            error?.error?.message ||
              (this.editingAccount() ? 'Could not update account.' : 'Could not create account.'),
          );
        },
      });
  }

  downloadAccountTemplate(): void {
    this.exportService.exportAsExcelTable({
      filename: 'account-import-template.xlsx',
      sheetName: 'Accounts',
      rows: [{}],
      columns: [
        { header: 'Account Name', value: () => '' },
        { header: 'Marketplace', value: () => '' },
        { header: 'Country', value: () => '' },
        { header: 'Currency', value: () => '' },
        { header: 'Active', value: () => '' },
        { header: 'Client Profit Percentage', value: () => '' },
        { header: 'Company Profit Percentage', value: () => '' },
        { header: 'Previous Order Count', value: () => '' },
        { header: 'Last Month Profit', value: () => '' },
      ],
    });

    this.toast.success('Account import template downloaded.');
  }

  downloadInvoiceTemplate(): void {
    this.exportService.downloadWorkbook({
      filename: 'bulk-invoice-template.xlsx',
      sheetName: 'Invoices',
      rows: [
        {
          'Account Name': 'Default eBay Account',
          'Bill To Name': 'Default eBay Account',
          'Invoice Month': buildInvoiceMonthValue(),
          'Invoice Date': buildInvoiceDateValue(),
          Currency: 'USD',
          'Total Profit': '',
          'Total Profit Description': '',
          'Company Profit': '',
          'Company Profit Description': '',
          'Client Profit': '',
          'Client Profit Description': '',
          'Tracking Fees': '',
          'Tracking Fees Description': '',
          'Primary Title': DEFAULT_PRIMARY_PAYMENT.title,
          'Primary Bank / Holder': DEFAULT_PRIMARY_PAYMENT.bankName,
          'Primary Account Number': DEFAULT_PRIMARY_PAYMENT.accountNumber,
          'Primary IBAN': DEFAULT_PRIMARY_PAYMENT.iban,
          'Primary Branch': DEFAULT_PRIMARY_PAYMENT.branch,
          'Alternate Title': DEFAULT_ALTERNATE_PAYMENT.title,
          'Alternate Bank / Holder': DEFAULT_ALTERNATE_PAYMENT.bankName,
          'Alternate Account Number': DEFAULT_ALTERNATE_PAYMENT.accountNumber,
          'Alternate IBAN': DEFAULT_ALTERNATE_PAYMENT.iban,
          'Alternate Branch': DEFAULT_ALTERNATE_PAYMENT.branch,
          Notes: '',
        },
      ],
    });

    this.toast.success('Bulk invoice template downloaded.');
  }

  async importAccountsFromInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file || this.importingAccounts()) {
      if (input) {
        input.value = '';
      }
      return;
    }

    this.importingAccounts.set(true);

    try {
      const rows = await this.exportService.parseExcelRows(file);

      if (!rows.length) {
        this.toast.warning('The selected file does not contain any account rows.');
        return;
      }

      const result = await firstValueFrom(this.accountApi.bulkImportAccounts(rows));

      this.referenceData.refreshAccounts();
      this.workspaceSync.notifySettingsChanged();

      if (this.activeAccount()) {
        this.reloadActiveAccountSummary();
      }

      if (result.summary.failed > 0) {
        const preview = result.errors
          .slice(0, 3)
          .map((error) => `Row ${error.row}: ${error.message}`)
          .join(' ');
        this.toast.warning(
          `Imported ${result.summary.created} new and updated ${result.summary.updated} account(s). ${result.summary.failed} row(s) need attention. ${preview}`,
        );
      } else {
        this.toast.success(
          `Imported ${result.summary.created} new and updated ${result.summary.updated} account(s).`,
        );
      }
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'error' in error
          ? ((error as { error?: { message?: string } }).error?.message ?? 'Could not import accounts.')
          : 'Could not import accounts.';
      this.toast.error(message);
    } finally {
      this.importingAccounts.set(false);
      if (input) {
        input.value = '';
      }
    }
  }

  async importInvoicesFromInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file || this.importingInvoices()) {
      if (input) {
        input.value = '';
      }
      return;
    }

    this.importingInvoices.set(true);

    try {
      const rows = await this.exportService.parseExcelRows(file);

      if (!rows.length) {
        this.toast.warning('The selected file does not contain any invoice rows.');
        return;
      }

      const result = await firstValueFrom(this.accountApi.bulkCreateAccountInvoices(rows));

      if (this.activeAccount()) {
        this.reloadActiveAccountSummary();
      }

      if (result.invoices.length) {
        await this.invoicePdf.downloadInvoiceArchive(
          result.invoices,
          `account-invoices-${new Date().toISOString().slice(0, 10)}`,
        );
      }

      if (result.summary.failed > 0) {
        const preview = result.errors
          .slice(0, 3)
          .map((error) => `Row ${error.row}: ${error.message}`)
          .join(' ');
        this.toast.warning(
          `Generated ${result.summary.created} invoice(s). ${result.summary.failed} row(s) need attention. ${preview}`,
        );
      } else {
        this.toast.success(`Generated ${result.summary.created} invoice(s) and downloaded the archive.`);
      }
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'error' in error
          ? ((error as { error?: { message?: string } }).error?.message ?? 'Could not generate invoices.')
          : 'Could not generate invoices.';
      this.toast.error(message);
    } finally {
      this.importingInvoices.set(false);
      if (input) {
        input.value = '';
      }
    }
  }

  saveListerAssignments(): void {
    const account = this.activeAccount();

    if (!account || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.accountApi
      .setAccountListers(account.id, this.selectedListerIds())
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updatedAccount) => {
          this.referenceData.refreshAccounts();
          this.workspaceSync.notifySettingsChanged();
          this.toast.success('Assigned listers updated.');
          this.closeListerModal(true);
          this.selectAccount(updatedAccount, true);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not update assigned listers.');
        },
      });
  }

  async toggleAccount(account: Account): Promise<void> {
    if (account.isActive) {
      const confirmed = await this.confirm.ask({
        title: 'Disable account?',
        message: `${account.name} will no longer be available for listing actions.`,
        confirmText: 'Disable',
        tone: 'danger',
      });

      if (!confirmed) {
        return;
      }
    }

    this.accountApi.updateAccount(account.id, { isActive: !account.isActive }).subscribe({
      next: (updatedAccount) => {
        this.referenceData.refreshAccounts();
        this.workspaceSync.notifySettingsChanged();
        this.toast.success(account.isActive ? 'Account disabled.' : 'Account enabled.');
        this.selectAccount(updatedAccount, true);
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not update account.'),
    });
  }

  openInvoiceModal(): void {
    const activeAccount = this.activeAccount();
    const summary = this.activeAccountSummary();

    if (!activeAccount) {
      return;
    }

    const totalProfit = Number(summary?.stats.totalProfit || 0);
    const clientPercentage = Number(activeAccount.clientProfitPercentage ?? 50);
    const companyPercentage = Number(activeAccount.companyProfitPercentage ?? 50);
    const companyProfit = Number(((totalProfit * companyPercentage) / 100).toFixed(2));
    const clientProfit = Number(((totalProfit * clientPercentage) / 100).toFixed(2));

    this.invoiceForm.reset({
      billToName: activeAccount.name,
      invoiceMonth: buildInvoiceMonthValue(),
      invoiceDate: buildInvoiceDateValue(),
      currency: activeAccount.currency || this.inferCurrency(activeAccount.country) || 'USD',
      primaryPayment: DEFAULT_PRIMARY_PAYMENT,
      alternatePayment: DEFAULT_ALTERNATE_PAYMENT,
      notes: '',
    });

    const defaults = [
      { ...DEFAULT_INVOICE_LINE_ITEMS[0], amount: totalProfit },
      { ...DEFAULT_INVOICE_LINE_ITEMS[1], amount: companyProfit },
      { ...DEFAULT_INVOICE_LINE_ITEMS[2], amount: clientProfit },
      { ...DEFAULT_INVOICE_LINE_ITEMS[3], amount: 0 },
    ];

    defaults.forEach((item, index) => {
      this.invoiceLineItems[index].reset(item);
    });

    this.syncInvoicePreview();
    this.invoiceModalOpen.set(true);
  }

  closeInvoiceModal(force = false): void {
    if (this.invoiceSaving() && !force) {
      return;
    }

    this.invoiceModalOpen.set(false);
  }

  submitInvoice(): void {
    const account = this.activeAccount();

    if (!account || this.invoiceForm.invalid || this.invoiceSaving()) {
      this.invoiceForm.markAllAsTouched();
      return;
    }

    this.invoiceSaving.set(true);

    const payload: AccountInvoicePayload = {
      billToName: this.invoiceForm.controls.billToName.getRawValue(),
      invoiceMonth: this.invoiceForm.controls.invoiceMonth.getRawValue(),
      invoiceDate: this.invoiceForm.controls.invoiceDate.getRawValue(),
      currency: this.invoiceForm.controls.currency.getRawValue(),
      lineItems: this.invoiceLineItems.map((item) => ({
        title: item.controls.title.getRawValue(),
        description: item.controls.description.getRawValue() || null,
        amount: Number(item.controls.amount.getRawValue() || 0),
        includeInTotal: item.controls.includeInTotal.getRawValue(),
      })),
      primaryPayment: {
        title: this.invoiceForm.controls.primaryPayment.controls.title.getRawValue(),
        bankName: this.invoiceForm.controls.primaryPayment.controls.bankName.getRawValue(),
        accountNumber: this.invoiceForm.controls.primaryPayment.controls.accountNumber.getRawValue(),
        iban: this.invoiceForm.controls.primaryPayment.controls.iban.getRawValue(),
        branch: this.invoiceForm.controls.primaryPayment.controls.branch.getRawValue(),
      },
      alternatePayment: {
        title: this.invoiceForm.controls.alternatePayment.controls.title.getRawValue(),
        bankName: this.invoiceForm.controls.alternatePayment.controls.bankName.getRawValue(),
        accountNumber: this.invoiceForm.controls.alternatePayment.controls.accountNumber.getRawValue(),
        iban: this.invoiceForm.controls.alternatePayment.controls.iban.getRawValue(),
        branch: this.invoiceForm.controls.alternatePayment.controls.branch.getRawValue(),
      },
      notes: this.invoiceForm.controls.notes.getRawValue() || null,
    };

    this.accountApi
      .createAccountInvoice(account.id, payload)
      .pipe(finalize(() => this.invoiceSaving.set(false)))
      .subscribe({
        next: async (invoice) => {
          this.toast.success('Invoice created.');
          await this.invoicePdf.downloadInvoice(invoice);
          this.closeInvoiceModal(true);
          this.selectAccount(account, true);
        },
        error: (error) => {
          this.toast.error(error?.error?.message || 'Could not create invoice.');
        },
      });
  }

  async downloadInvoice(invoice: AccountInvoice): Promise<void> {
    await this.invoicePdf.downloadInvoice(invoice);
  }

  trackByAccountId(_: number, account: Account): string {
    return account.id;
  }

  trackByInvoiceId(_: number, invoice: AccountInvoice): string {
    return invoice.id;
  }

  reloadActiveAccountSummary(): void {
    const account = this.activeAccount();

    if (!account) {
      return;
    }

    this.selectAccount(account, true);
  }

  private syncInvoicePreview(): void {
    const activeAccount = this.activeAccount();
    const raw = this.invoiceForm.getRawValue();

    this.invoicePreview.set({
      accountName: activeAccount?.name || 'Account',
      billToName: raw.billToName || activeAccount?.name || 'Account',
      invoiceMonthLabel: this.formatInvoiceMonth(raw.invoiceMonth),
      invoiceDateLabel: this.formatInvoiceDate(raw.invoiceDate),
      currency: raw.currency || 'USD',
      lineItems: raw.lineItems.map((item) => ({
        title: item.title || '',
        description: item.description || '',
        amount: Number(item.amount || 0),
        includeInTotal: item.includeInTotal,
      })),
      totalNetPayable: Number(
        raw.lineItems
          .reduce(
            (total, item) => total + (item.includeInTotal === false ? 0 : Number(item.amount || 0)),
            0,
          )
          .toFixed(2),
      ),
      primaryPayment: {
        title: raw.primaryPayment.title || DEFAULT_PRIMARY_PAYMENT.title,
        bankName: raw.primaryPayment.bankName || '',
        accountNumber: raw.primaryPayment.accountNumber || '',
        iban: raw.primaryPayment.iban || '',
        branch: raw.primaryPayment.branch || '',
      },
      alternatePayment: {
        title: raw.alternatePayment.title || DEFAULT_ALTERNATE_PAYMENT.title,
        bankName: raw.alternatePayment.bankName || '',
        accountNumber: raw.alternatePayment.accountNumber || '',
        iban: raw.alternatePayment.iban || '',
        branch: raw.alternatePayment.branch || '',
      },
      notes: raw.notes || '',
    });
  }

  private formatInvoiceMonth(value: string): string {
    if (!value) {
      return '';
    }

    const monthDate = new Date(`${value}-01T00:00:00`);

    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(monthDate);
  }

  private formatInvoiceDate(value: string): string {
    if (!value) {
      return '';
    }

    const invoiceDate = new Date(`${value}T00:00:00`);

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(invoiceDate);
  }

  private inferCurrency(country?: string | null): string | null {
    switch (country) {
      case 'USA':
        return 'USD';
      case 'UK':
        return 'GBP';
      case 'UAE':
        return 'AED';
      case 'Pakistan':
        return 'PKR';
      case 'Canada':
        return 'CAD';
      default:
        return null;
    }
  }
}
