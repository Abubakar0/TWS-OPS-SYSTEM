import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { finalize, firstValueFrom } from 'rxjs';

import { AdminApiService } from '../../core/api/admin-api.service';
import { ProductCategoryApiService } from '../../core/api/product-category-api.service';
import { SystemApiService } from '../../core/api/system-api.service';
import { HuntingCriteria, ProductCategory } from '../../core/models/product.models';
import { AnnouncementBarSettings, HrSettings } from '../../core/models/system.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { SessionCacheService } from '../../core/state/session-cache.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-admin-settings',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent implements OnInit {
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly formVersion = signal(0);
  readonly criteriaSnapshot = signal('');
  readonly categoryLoading = signal(false);
  readonly categorySaving = signal(false);
  readonly categoryError = signal('');
  readonly categories = signal<ProductCategory[]>([]);
  readonly editingCategoryId = signal<string | null>(null);
  private readonly destroyRef = inject(DestroyRef);

  readonly categorySearch = new FormControl('', { nonNullable: true });
  readonly categoryForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    active: new FormControl(true, { nonNullable: true }),
  });

  readonly criteriaForm = new FormGroup({
    minRoi: new FormControl(30, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    minProfit: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    minSoldCount: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    minStockCount: new FormControl(8, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    minAlternateStockCount: new FormControl(8, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    minRating: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    minWatcherCount: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    minSalesLastTwoMonths: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    maxDeliveryDays: new FormControl(7, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    feePercent: new FormControl(21, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    asinRequired: new FormControl(true, { nonNullable: true }),
    customLabelRequired: new FormControl(false, { nonNullable: true }),
    watchersRequired: new FormControl(false, { nonNullable: true }),
    basketCountRequired: new FormControl(false, { nonNullable: true }),
    deliveryDaysRequired: new FormControl(false, { nonNullable: true }),
    monthlyGraphRequired: new FormControl(false, { nonNullable: true }),
  });
  readonly announcementForm = new FormGroup({
    enabled: new FormControl(false, { nonNullable: true }),
    tone: new FormControl<'info' | 'success' | 'warning' | 'danger'>('info', {
      nonNullable: true,
    }),
    title: new FormControl('', { nonNullable: true }),
    message: new FormControl('', { nonNullable: true }),
  });
  readonly hrSettingsForm = new FormGroup({
    allowEmployeeProfileEditing: new FormControl(true, { nonNullable: true }),
  });

  readonly hasUnsavedChanges = computed(() => {
    this.formVersion();
    return this.serializeCriteriaForm() !== this.criteriaSnapshot();
  });
  readonly hasCriteria = computed(() => Boolean(this.criteriaSnapshot()));
  readonly activeCategoryCount = computed(
    () => this.categories().filter((category) => category.active).length,
  );
  readonly filteredCategories = computed(() => {
    const term = this.categorySearch.value.trim().toLowerCase();

    if (!term) {
      return this.categories();
    }

    return this.categories().filter((category) =>
      category.name.toLowerCase().includes(term),
    );
  });
  readonly categoryFormTitle = computed(() =>
    this.editingCategoryId() ? 'Update category' : 'Add category',
  );

  constructor(
    private readonly adminApi: AdminApiService,
    private readonly productCategoryApi: ProductCategoryApiService,
    private readonly systemApi: SystemApiService,
    private readonly referenceData: ReferenceDataService,
    private readonly sessionCache: SessionCacheService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.criteriaForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.formVersion.update((value) => value + 1);
      });

    this.loadData();
  }

  loadData(): void {
    this.loadCriteria();
    void this.loadCategories();
  }

  saveCriteria(): void {
    if (this.criteriaForm.invalid || this.saving()) {
      this.criteriaForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.adminApi
      .updateCriteria(this.criteriaForm.getRawValue() as HuntingCriteria)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
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
        },
      });
  }

  saveAnnouncement(): void {
    if (this.categorySaving()) {
      return;
    }

    this.categorySaving.set(true);
    this.categoryError.set('');

    const payload = this.announcementForm.getRawValue() as AnnouncementBarSettings;

    this.systemApi
      .updateAnnouncement(payload)
      .pipe(finalize(() => this.categorySaving.set(false)))
      .subscribe({
        next: (announcement) => {
          this.announcementForm.patchValue(announcement, { emitEvent: false });
          this.workspaceSync.notifySettingsChanged();
          this.toast.success('Announcement updated.');
        },
        error: (error) => {
          this.categoryError.set(error?.error?.message || 'Could not update announcement.');
        },
      });
  }

  saveHrSettings(): void {
    if (this.categorySaving()) {
      return;
    }

    this.categorySaving.set(true);
    this.categoryError.set('');

    this.systemApi
      .updateHrSettings(this.hrSettingsForm.getRawValue() as HrSettings)
      .pipe(finalize(() => this.categorySaving.set(false)))
      .subscribe({
        next: (settings) => {
          this.hrSettingsForm.patchValue(settings, { emitEvent: false });
          this.workspaceSync.notifySettingsChanged();
          this.toast.success('HR settings updated.');
        },
        error: (error) => {
          this.categoryError.set(error?.error?.message || 'Could not update HR settings.');
        },
      });
  }

  async resetCriteria(): Promise<void> {
    if (!this.hasUnsavedChanges()) {
      this.criteriaForm.patchValue(JSON.parse(this.criteriaSnapshot() || '{}'), {
        emitEvent: false,
      });
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

    this.criteriaForm.patchValue(JSON.parse(this.criteriaSnapshot() || '{}'), {
      emitEvent: false,
    });
    this.formVersion.update((value) => value + 1);
  }

  startCategoryEdit(category: ProductCategory): void {
    this.editingCategoryId.set(category.id);
    this.categoryForm.patchValue(
      {
        name: category.name,
        active: category.active,
      },
      { emitEvent: false },
    );
  }

  cancelCategoryEdit(): void {
    this.editingCategoryId.set(null);
    this.categoryForm.reset(
      {
        name: '',
        active: true,
      },
      { emitEvent: false },
    );
  }

  saveCategory(): void {
    if (this.categoryForm.invalid || this.categorySaving()) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.categorySaving.set(true);
    this.categoryError.set('');

    const payload = {
      name: this.categoryForm.controls.name.value.trim(),
      active: this.categoryForm.controls.active.value,
    };
    const editingId = this.editingCategoryId();
    const request$ = editingId
      ? this.productCategoryApi.updateCategory(editingId, payload)
      : this.productCategoryApi.createCategory(payload);

    request$.pipe(finalize(() => this.categorySaving.set(false))).subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.referenceData.refreshProductCategories();
        this.workspaceSync.notifySettingsChanged();
        this.toast.success(editingId ? 'Category updated.' : 'Category added.');
        this.cancelCategoryEdit();
      },
      error: (error) => {
        this.categoryError.set(error?.error?.message || 'Could not save category.');
      },
    });
  }

  async toggleCategoryActive(category: ProductCategory): Promise<void> {
    const nextState = !category.active;
    const confirmed = await this.confirm.ask({
      title: nextState ? 'Enable category?' : 'Disable category?',
      message: nextState
        ? 'This category will appear in product and report filters again.'
        : 'Disabled categories will no longer appear in submission and filter dropdowns.',
      confirmText: nextState ? 'Enable' : 'Disable',
    });

    if (!confirmed) {
      return;
    }

    this.categorySaving.set(true);
    this.categoryError.set('');

    this.productCategoryApi
      .updateCategory(category.id, { active: nextState })
      .pipe(finalize(() => this.categorySaving.set(false)))
      .subscribe({
        next: (categories) => {
          this.categories.set(categories);
          this.referenceData.refreshProductCategories();
          this.workspaceSync.notifySettingsChanged();
          this.toast.success(nextState ? 'Category enabled.' : 'Category disabled.');
        },
        error: (error) => {
          this.categoryError.set(error?.error?.message || 'Could not update category.');
        },
      });
  }

  async deleteCategory(category: ProductCategory): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Delete category?',
      message: `Remove "${category.name}" from the category list.`,
      confirmText: 'Delete',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.categorySaving.set(true);
    this.categoryError.set('');

    this.productCategoryApi
      .deleteCategory(category.id)
      .pipe(finalize(() => this.categorySaving.set(false)))
      .subscribe({
        next: (categories) => {
          this.categories.set(categories);
          this.referenceData.refreshProductCategories();
          this.workspaceSync.notifySettingsChanged();
          this.toast.success('Category deleted.');
          if (this.editingCategoryId() === category.id) {
            this.cancelCategoryEdit();
          }
        },
        error: (error) => {
          this.categoryError.set(error?.error?.message || 'Could not delete category.');
        },
      });
  }

  private loadCriteria(): void {
    const cachedCriteria = this.sessionCache.criteria();
    const hasCachedCriteria = Boolean(cachedCriteria);

    if (cachedCriteria) {
      this.criteriaForm.patchValue(cachedCriteria, { emitEvent: false });
      this.criteriaSnapshot.set(JSON.stringify(cachedCriteria));
      this.formVersion.update((value) => value + 1);
    }

    this.loading.set(!hasCachedCriteria);
    this.error.set('');

    this.adminApi
      .getCriteria(true)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (criteria) => {
          this.criteriaForm.patchValue(criteria, { emitEvent: false });
          this.criteriaSnapshot.set(JSON.stringify(criteria));
          this.formVersion.update((value) => value + 1);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load settings.');
          this.loading.set(false);
        },
      });
  }

  private async loadCategories(): Promise<void> {
    this.categoryLoading.set(true);
    this.categoryError.set('');

    try {
      const [categories, settings] = await Promise.all([
        firstValueFrom(this.productCategoryApi.listCategories(true, true)),
        firstValueFrom(this.systemApi.getSettings(true)),
      ]);
      this.categories.set(categories);
      this.announcementForm.patchValue(settings.announcementBar, { emitEvent: false });
      this.hrSettingsForm.patchValue(settings.hrSettings, { emitEvent: false });
    } catch (error) {
      this.categoryError.set('Could not load product categories.');
    } finally {
      this.categoryLoading.set(false);
    }
  }

  private serializeCriteriaForm(): string {
    return JSON.stringify(this.criteriaForm.getRawValue());
  }
}
