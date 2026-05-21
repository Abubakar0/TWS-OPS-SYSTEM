import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
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
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { User } from '../../core/models/auth.models';
import { Account } from '../../core/models/product.models';
import { AdminService } from '../../core/services/admin.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

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
  ],
  templateUrl: './admin-accounts.component.html',
  styleUrl: './admin-accounts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAccountsComponent implements OnInit {
  readonly accounts = signal<Account[]>([]);
  readonly listers = signal<User[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly accountModalOpen = signal(false);
  readonly listerModalOpen = signal(false);
  readonly activeAccount = signal<Account | null>(null);
  readonly selectedListerIds = signal<string[]>([]);
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly marketplaceControl = new FormControl<'all' | 'amazon' | 'ebay'>('all', { nonNullable: true });
  readonly statusControl = new FormControl<'all' | 'active' | 'disabled'>('all', { nonNullable: true });
  readonly searchTerm = signal('');
  readonly pageError = computed(() => !this.loading() && this.error());

  readonly filteredAccounts = computed(() => {
    const term = this.searchTerm();
    const marketplace = this.marketplaceControl.value;
    const status = this.statusControl.value;

    return this.accounts().filter((account) => {
      const matchesMarketplace = marketplace === 'all' ? true : account.marketplace === marketplace;
      const matchesStatus =
        status === 'all' ? true : status === 'active' ? account.isActive : !account.isActive;
      const matchesSearch = !term
        ? true
        : [account.name, account.marketplace].some((value) =>
            value.toLowerCase().includes(term),
          );

      return matchesMarketplace && matchesStatus && matchesSearch;
    });
  });

  readonly accountForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    marketplace: new FormControl<'ebay' | 'amazon'>('ebay', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly adminApi: AdminService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {
    this.searchControl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.searchTerm.set(value.trim().toLowerCase()));
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

  loadAccounts(): void {
    this.loading.set(true);
    this.error.set('');

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
  }

  resetFilters(): void {
    this.searchControl.setValue('', { emitEvent: true });
    this.marketplaceControl.setValue('all');
    this.statusControl.setValue('all');
  }

  openAccountModal(): void {
    this.accountForm.reset({ name: '', marketplace: 'ebay', isActive: true });
    this.accountModalOpen.set(true);
  }

  closeAccountModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.accountModalOpen.set(false);
  }

  openListerModal(account: Account): void {
    this.activeAccount.set(account);
    this.selectedListerIds.set(account.assignedListers?.map((lister) => lister.id) || []);
    this.listerModalOpen.set(true);
  }

  closeListerModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.listerModalOpen.set(false);
    this.activeAccount.set(null);
    this.selectedListerIds.set([]);
  }

  isListerSelected(listerId: string): boolean {
    return this.selectedListerIds().includes(listerId);
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

  createAccount(): void {
    if (this.accountForm.invalid || this.saving()) {
      this.accountForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.adminApi.createAccount(this.accountForm.getRawValue()).pipe(
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: () => {
        this.referenceData.refreshAccounts();
        this.workspaceSync.notifySettingsChanged();
        this.toast.success('Account created.');
        this.closeAccountModal(true);
        this.loadAccounts();
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not create account.');
      },
    });
  }

  saveListerAssignments(): void {
    const account = this.activeAccount();

    if (!account || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.adminApi.setAccountListers(account.id, this.selectedListerIds()).pipe(
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: () => {
        this.referenceData.refreshAccounts();
        this.workspaceSync.notifySettingsChanged();
        this.toast.success('Assigned listers updated.');
        this.closeListerModal(true);
        this.loadAccounts();
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

    this.adminApi.updateAccount(account.id, { isActive: !account.isActive }).subscribe({
      next: () => {
        this.referenceData.refreshAccounts();
        this.workspaceSync.notifySettingsChanged();
        this.toast.success(account.isActive ? 'Account disabled.' : 'Account enabled.');
        this.loadAccounts();
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not update account.'),
    });
  }
}
