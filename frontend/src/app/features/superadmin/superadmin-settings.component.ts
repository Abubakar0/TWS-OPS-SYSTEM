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
import { MatSelectModule } from '@angular/material/select';

import { Account, HuntingCriteria } from '../../core/models/product.models';
import { AnnouncementBarSettings, ApiLimitSettings, HrSettings } from '../../core/models/system.models';
import { AccountApiService } from '../../core/api/account-api.service';
import { AdminApiService } from '../../core/api/admin-api.service';
import { SystemApiService } from '../../core/api/system-api.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { SessionCacheService } from '../../core/state/session-cache.service';
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
    MatSelectModule,
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
    categoryRequired: new FormControl(false, { nonNullable: true }),
    amazonAltUrlRequired: new FormControl(false, { nonNullable: true }),
    watchersRequired: new FormControl(false, { nonNullable: true }),
    basketCountRequired: new FormControl(false, { nonNullable: true }),
    deliveryDaysRequired: new FormControl(false, { nonNullable: true }),
    monthlyGraphRequired: new FormControl(false, { nonNullable: true }),
    trainingMinRoi: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    trainingMinProfit: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    trainingMinSoldCount: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    trainingMinStockCount: new FormControl(8, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    trainingMinRating: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    trainingMinWatcherCount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    trainingMinSalesLastTwoMonths: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    trainingAsinRequired: new FormControl(true, { nonNullable: true }),
    trainingCustomLabelRequired: new FormControl(false, { nonNullable: true }),
    trainingCategoryRequired: new FormControl(false, { nonNullable: true }),
    trainingAmazonAltUrlRequired: new FormControl(false, { nonNullable: true }),
    trainingMaxRejectedProductsAllowed: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    trainingMinApprovalRateForActivation: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    trainingMinListedProductsForActivation: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    trainingMinOrdersGeneratedForActivation: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
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
  readonly announcementForm = new FormGroup({
    enabled: new FormControl(false, { nonNullable: true }),
    tone: new FormControl<'info' | 'success' | 'warning' | 'danger'>('info', { nonNullable: true }),
    title: new FormControl('', { nonNullable: true }),
    message: new FormControl('', { nonNullable: true }),
  });
  readonly hrSettingsForm = new FormGroup({
    allowEmployeeProfileEditing: new FormControl(true, { nonNullable: true }),
    allowDualRoleSelfListing: new FormControl(false, { nonNullable: true }),
  });

  constructor(
    private readonly adminApi: AdminApiService,
    private readonly accountApi: AccountApiService,
    private readonly systemApi: SystemApiService,
    private readonly referenceData: ReferenceDataService,
    private readonly sessionCache: SessionCacheService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    const cachedCriteria = this.sessionCache.criteria();

    if (cachedCriteria) {
      this.criteriaForm.patchValue(cachedCriteria, { emitEvent: false });
      this.loading.set(false);
    } else {
      this.loading.set(true);
    }

    this.error.set('');

    this.referenceData.loadCriteriaOnce().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (criteria) => {
        this.criteriaForm.patchValue(criteria);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load system settings.');
        this.loading.set(false);
      },
    });

    this.referenceData.getAccounts(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (accounts) => this.accounts.set(accounts),
      error: (error) => this.error.set(error?.error?.message || 'Could not load listing accounts.'),
    });

    this.systemApi.getSettings(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (settings) => {
        this.apiLimitsForm.patchValue(settings.apiLimits);
        this.announcementForm.patchValue(settings.announcementBar, { emitEvent: false });
        this.hrSettingsForm.patchValue(settings.hrSettings, { emitEvent: false });
      },
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

    this.accountApi.createAccount(this.accountForm.getRawValue()).subscribe({
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

    this.accountApi.updateAccount(account.id, { isActive: !account.isActive }).subscribe({
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

  saveAnnouncement(): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.systemApi
      .updateAnnouncement(this.announcementForm.getRawValue() as AnnouncementBarSettings)
      .subscribe({
        next: (announcement) => {
          this.announcementForm.patchValue(announcement, { emitEvent: false });
          this.workspaceSync.notifySettingsChanged();
          this.toast.success('Announcement updated.');
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not save announcement.');
          this.saving.set(false);
        },
        complete: () => this.saving.set(false),
      });
  }

  saveHrSettings(): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.systemApi
      .updateHrSettings(this.hrSettingsForm.getRawValue() as HrSettings)
      .subscribe({
        next: (settings) => {
          this.hrSettingsForm.patchValue(settings, { emitEvent: false });
          this.workspaceSync.notifySettingsChanged();
          this.toast.success('HR settings updated.');
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not save HR settings.');
          this.saving.set(false);
        },
        complete: () => this.saving.set(false),
      });
  }
}
