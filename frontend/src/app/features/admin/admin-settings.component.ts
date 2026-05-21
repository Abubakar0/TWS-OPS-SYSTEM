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

import { Account, HuntingCriteria } from '../../core/models/product.models';
import { AdminService } from '../../core/services/admin.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-admin-settings',
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
    EmptyStateComponent,
  ],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent implements OnInit {
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly accountModalOpen = signal(false);
  readonly formVersion = signal(0);
  readonly criteriaSnapshot = signal<string>('');
  private readonly destroyRef = inject(DestroyRef);

  readonly criteriaForm = new FormGroup({
    minRoi: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minProfit: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minSoldCount: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minStockCount: new FormControl(8, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minAlternateStockCount: new FormControl(8, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    minRating: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minWatcherCount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minSalesLastTwoMonths: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    feePercent: new FormControl(21, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    asinRequired: new FormControl(true, { nonNullable: true }),
    customLabelRequired: new FormControl(false, { nonNullable: true }),
    watchersRequired: new FormControl(false, { nonNullable: true }),
  });

  readonly accountForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    marketplace: new FormControl('ebay', { nonNullable: true, validators: [Validators.required] }),
    isActive: new FormControl(true, { nonNullable: true }),
  });
  readonly hasUnsavedChanges = computed(() => {
    this.formVersion();
    return this.serializeCriteriaForm() !== this.criteriaSnapshot();
  });

  constructor(
    private readonly adminApi: AdminService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.criteriaForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.formVersion.update((value) => value + 1);
    });
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set('');

    this.referenceData.getCriteria().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (criteria) => {
        this.criteriaForm.patchValue(criteria, { emitEvent: false });
        this.criteriaSnapshot.set(JSON.stringify(criteria));
        this.formVersion.update((value) => value + 1);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load settings.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });

    this.referenceData.getAccounts(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (accounts) => this.accounts.set(accounts),
      error: (error) => this.error.set(error?.error?.message || 'Could not load accounts.'),
    });
  }

  saveCriteria(): void {
    if (this.criteriaForm.invalid || this.saving()) {
      this.criteriaForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.adminApi.updateCriteria(this.criteriaForm.getRawValue() as HuntingCriteria).subscribe({
      next: (criteria) => {
        this.criteriaForm.patchValue(criteria, { emitEvent: false });
        this.criteriaSnapshot.set(JSON.stringify(criteria));
        this.formVersion.update((value) => value + 1);
        this.referenceData.refreshCriteria();
        this.workspaceSync.notifySettingsChanged();
        this.toast.success('Settings saved.');
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not save settings.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }

  createAccount(): void {
    if (this.accountForm.invalid || this.saving()) {
      this.accountForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.adminApi.createAccount(this.accountForm.getRawValue()).subscribe({
      next: () => {
        this.accountForm.reset({ name: '', marketplace: 'ebay', isActive: true });
        this.referenceData.refreshAccounts();
        this.workspaceSync.notifySettingsChanged();
        this.toast.success('Account created.');
        this.closeAccountModal(true);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not create account.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
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
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not update account.'),
    });
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
    this.accountForm.reset({ name: '', marketplace: 'ebay', isActive: true });
  }

  async resetCriteria(): Promise<void> {
    if (!this.hasUnsavedChanges()) {
      this.criteriaForm.patchValue(JSON.parse(this.criteriaSnapshot() || '{}'), { emitEvent: false });
      this.formVersion.update((value) => value + 1);
      return;
    }

    const confirmed = await this.confirm.ask({
      title: 'Reset unsaved changes?',
      message: 'Any edits on this page that have not been saved will be removed.',
      confirmText: 'Reset',
    });

    if (!confirmed) {
      return;
    }

    this.criteriaForm.patchValue(JSON.parse(this.criteriaSnapshot() || '{}'), { emitEvent: false });
    this.formVersion.update((value) => value + 1);
  }

  private serializeCriteriaForm(): string {
    return JSON.stringify(this.criteriaForm.getRawValue());
  }
}
