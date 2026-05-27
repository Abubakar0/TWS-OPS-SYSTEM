import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Account, HuntingCriteria } from '../../core/models/product.models';
import { ApiLimitSettings } from '../../core/models/system.models';
import { SystemApiService } from '../../core/api/system-api.service';
import { AdminService } from '../../core/services/admin.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-superadmin-settings',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './superadmin-settings.component.html',
  styleUrl: './superadmin-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminSettingsComponent implements OnInit {
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
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
    maxDeliveryDays: new FormControl(7, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    feePercent: new FormControl(21, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    asinRequired: new FormControl(true, { nonNullable: true }),
    customLabelRequired: new FormControl(false, { nonNullable: true }),
    watchersRequired: new FormControl(false, { nonNullable: true }),
    basketCountRequired: new FormControl(false, { nonNullable: true }),
    deliveryDaysRequired: new FormControl(false, { nonNullable: true }),
    monthlyGraphRequired: new FormControl(false, { nonNullable: true }),
  });

  readonly accountForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    marketplace: new FormControl('ebay', { nonNullable: true, validators: [Validators.required] }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  readonly apiLimitsForm = new FormGroup({
    users: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
    hunters: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
    listers: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
    products: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
    orders: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
    accounts: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
    reports: new FormControl(100, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
    assignments: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
    activity: new FormControl(50, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
    listingQueue: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
    rejections: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(10)] }),
  });

  constructor(
    private readonly adminApi: AdminService,
    private readonly systemApi: SystemApiService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set('');

    this.referenceData.getCriteria().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (criteria) => this.criteriaForm.patchValue(criteria),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load system settings.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });

    this.referenceData.getAccounts(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (accounts) => this.accounts.set(accounts),
      error: (error) => this.error.set(error?.error?.message || 'Could not load listing accounts.'),
    });

    this.systemApi.getSettings().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (settings) => this.apiLimitsForm.patchValue(settings.apiLimits),
      error: (error) => this.error.set(error?.error?.message || 'Could not load system limits.'),
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
        this.criteriaForm.patchValue(criteria);
        this.referenceData.refreshCriteria();
        this.workspaceSync.notifySettingsChanged();
        this.toast.success('Global settings saved.');
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not save global settings.');
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

  saveApiLimits(): void {
    if (this.apiLimitsForm.invalid || this.saving()) {
      this.apiLimitsForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.systemApi.updateApiLimits(this.apiLimitsForm.getRawValue() as ApiLimitSettings).subscribe({
      next: (limits) => {
        this.apiLimitsForm.patchValue(limits);
        this.toast.success('API limits saved.');
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not save API limits.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }
}
