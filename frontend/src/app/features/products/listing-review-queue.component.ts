import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ListerApiService } from '../../core/api/lister-api.service';
import { ProductAdminApiService } from '../../core/api/product-admin-api.service';
import { Account, Product, ProductCategory, ProductFilters, ProductStatus } from '../../core/models/product.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { FilterPanelComponent } from '../../shared/ui/filter-panel.component';
import { listingLinkValidator } from '../../shared/validators/listing-link.validator';
import { productStatusLabel } from '../../core/config/statuses';

type ReviewScope = 'lister' | 'admin' | 'superadmin';

const toLocalDateInput = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Component({
  selector: 'app-listing-review-queue',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EmptyStateComponent,
    ErrorStateComponent,
    FilterPanelComponent,
  ],
  template: `
    <section class="page-shell">
      <article class="surface-card">
        <div class="surface-card__header">
          <div>
            <h1>{{ title() }}</h1>
            <p>{{ subtitle() }}</p>
          </div>
          <div class="page-actions">
            <button mat-stroked-button type="button" (click)="load()" [disabled]="loading()">
              <mat-icon>refresh</mat-icon>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <app-filter-panel
          title="Review Filters"
          summary="Search by title, ASIN, hunter, account, or workflow status."
          icon="filter_list"
          [badge]="pageLabel()"
          storageKey="tws_listing_review_filters"
        >
          <div class="range-toolbar">
            <button mat-stroked-button type="button" class="range-chip" (click)="applyDatePreset('today')">
              Today
            </button>
            <button
              mat-stroked-button
              type="button"
              class="range-chip"
              (click)="applyDatePreset('yesterday')"
            >
              Yesterday
            </button>
          </div>

          <form class="filters-grid" [formGroup]="filters" (ngSubmit)="applyFilters()">
            <mat-form-field appearance="outline" class="filters-grid__search">
              <mat-label>Search</mat-label>
              <input matInput formControlName="search" autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Status</mat-label>
              <mat-select formControlName="status">
                <mat-option value="listed_needs_review">Needs Review</mat-option>
                <mat-option value="rejected">Rejected</mat-option>
                <mat-option value="">All</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Category</mat-label>
              <mat-select formControlName="category">
                <mat-option value="">All categories</mat-option>
                @for (category of categories(); track category.id) {
                  <mat-option [value]="category.name">{{ category.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>From</mat-label>
              <input matInput type="date" formControlName="from" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>To</mat-label>
              <input matInput type="date" formControlName="to" />
            </mat-form-field>
            <div class="filters-actions">
              <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
                <mat-icon>filter_alt</mat-icon>
                <span>Apply</span>
              </button>
              <button mat-stroked-button type="button" (click)="resetFilters()">
                <mat-icon>restart_alt</mat-icon>
                <span>Reset</span>
              </button>
            </div>
          </form>
        </app-filter-panel>
      </article>

      @if (loading()) {
        <article class="surface-card">
          <div class="loading-state">
            <mat-spinner diameter="24"></mat-spinner>
            <span>Loading listing reviews.</span>
          </div>
        </article>
      } @else if (error()) {
        <app-error-state [message]="error()" actionLabel="Retry" (action)="load()" />
      } @else if (!products().length) {
        <app-empty-state
          title="No products need review"
          message="There are no listed products waiting for a final review in the current scope."
          icon="fact_check"
        />
      } @else {
        <section class="listing-layout">
          <article class="surface-card listing-main">
            <div class="listing-table">
              <div class="listing-table__head">
                <span>Product</span>
                <span>Hunter</span>
                <span>Listed By</span>
                <span>Account</span>
                <span>Profit & ROI</span>
                <span>Status</span>
              </div>

              @for (product of products(); track product.id) {
                <button
                  type="button"
                  class="listing-row"
                  [class.is-active]="selectedProductId() === product.id"
                  (click)="selectProduct(product.id)"
                >
                  <div class="listing-row__product">
                    <div class="listing-row__product-copy">
                      <strong>{{ product.title || product.asin || 'Untitled product' }}</strong>
                      <span>ASIN: {{ product.asin || 'No ASIN' }}</span>
                      <small>{{ product.currentHunterName || product.hunterName }}</small>
                    </div>
                  </div>
                  <div class="listing-row__metric">
                    <strong>{{ product.hunterName }}</strong>
                    <span>Original: {{ product.originalHunterName || product.hunterName }}</span>
                  </div>
                  <div class="listing-row__metric">
                    <strong>{{ product.listedByName || 'Unknown' }}</strong>
                    <span>{{ product.assignedListerName || 'No assigned reviewer' }}</span>
                  </div>
                  <div class="listing-row__metric">
                    <strong>{{ product.accountName || 'Not assigned' }}</strong>
                    <span>{{ product.listingSubmittedForReviewAt | date: 'MMM d, y, h:mm a' }}</span>
                  </div>
                  <div class="listing-row__metric">
                    <span>Profit {{ product.profit | number: '1.2-2' }}</span>
                    <strong>{{ product.roi | number: '1.0-2' }}%</strong>
                  </div>
                  <div class="listing-row__status">
                      <span
                      class="status-badge"
                      [class.status-badge--warning]="
                        product.status === 'listed_needs_review' || product.status === 'ready_for_listing'
                      "
                      [class.status-badge--danger]="
                        product.status === 'rejected' || product.status === 'listing_rejected'
                      "
                    >
                      {{ productStatusLabel(product.status) }}
                    </span>
                  </div>
                </button>
              }
            </div>
          </article>

          <aside class="surface-card listing-sidebar">
            @if (selectedProduct(); as currentProduct) {
              <div class="listing-sidebar__top">
                <h2>Review Details</h2>
              </div>

              <div class="detail-summary">
                <div class="detail-summary__thumb">
                  <mat-icon>fact_check</mat-icon>
                </div>
                <div class="detail-summary__copy">
                  <strong>{{ currentProduct.title || currentProduct.asin || 'Selected product' }}</strong>
                  <span>ASIN: {{ currentProduct.asin || 'No ASIN' }}</span>
                  <small>Submitted {{ currentProduct.listingSubmittedForReviewAt | date: 'MMM d, y, h:mm a' }}</small>
                </div>
              </div>

              <div class="detail-facts">
                <div class="detail-fact"><span>Hunter</span><strong>{{ currentProduct.hunterName }}</strong></div>
                <div class="detail-fact"><span>Listed By</span><strong>{{ currentProduct.listedByName || 'Unknown' }}</strong></div>
                <div class="detail-fact"><span>Reviewer</span><strong>{{ currentProduct.assignedListerName || 'Admin / Super Admin' }}</strong></div>
                <div class="detail-fact"><span>Account</span><strong>{{ currentProduct.accountName || 'Not assigned' }}</strong></div>
              </div>

              <div class="detail-section">
                <h3>Product Links</h3>
                <div class="action-stack">
                  <button mat-stroked-button type="button" (click)="openLink(currentProduct.amazonUrl)">
                    <mat-icon>open_in_new</mat-icon><span>Amazon Link</span>
                  </button>
                  @if (currentProduct.amazonAltUrl) {
                    <button mat-stroked-button type="button" (click)="openLink(currentProduct.amazonAltUrl)">
                      <mat-icon>open_in_new</mat-icon><span>Alt Amazon</span>
                    </button>
                  }
                  <button mat-stroked-button type="button" (click)="openLink(currentProduct.ebayUrl)">
                    <mat-icon>open_in_new</mat-icon><span>eBay Source</span>
                  </button>
                  @if (currentProduct.listingUrl) {
                    <button mat-stroked-button type="button" (click)="openLink(currentProduct.listingUrl)">
                      <mat-icon>open_in_new</mat-icon><span>Listed eBay Link</span>
                    </button>
                  }
                </div>
              </div>

              @if (currentProduct.listingReviewRejectionReason) {
                <div class="inline-state inline-state--error">
                  {{ currentProduct.listingReviewRejectionReason }}
                </div>
              }

              <div class="detail-section">
                <h3>Review Actions</h3>
                <div class="action-stack">
                  <mat-form-field appearance="outline">
                    <mat-label>Rejection reason</mat-label>
                    <textarea matInput rows="4" [formControl]="rejectionReason"></textarea>
                    @if (rejectionReason.touched && rejectionReason.invalid) {
                      <mat-error>Rejection reason is required.</mat-error>
                    }
                  </mat-form-field>
                  <button
                    mat-flat-button
                    color="primary"
                    type="button"
                    (click)="approveCurrent()"
                    [disabled]="saving() || currentProduct.status !== 'listed_needs_review'"
                  >
                    <mat-icon>check_circle</mat-icon>
                    <span>Approve Listing</span>
                  </button>
                  <button
                    mat-flat-button
                    color="warn"
                    type="button"
                    (click)="rejectCurrent()"
                    [disabled]="saving()"
                  >
                    <mat-icon>block</mat-icon>
                    <span>Reject Listing</span>
                  </button>
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="openCorrectionModal(currentProduct)"
                    [disabled]="saving()"
                  >
                    <mat-icon>edit_note</mat-icon>
                    <span>Correct Listing</span>
                  </button>
                </div>
              </div>

              <div class="detail-section">
                <h3>Listing History</h3>
                @if (currentProduct.listingHistory?.length) {
                  <div class="history-list">
                    @for (entry of currentProduct.listingHistory || []; track entry.id) {
                      <div class="history-row">
                        <div>
                          <strong>{{ entry.fieldChanged }}</strong>
                          <small>{{ entry.editedAt | date: 'MMM d, y, h:mm a' }}</small>
                        </div>
                        <span>{{ entry.oldValue || 'Not set' }} → {{ entry.newValue || 'Not set' }}</span>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="inline-state">No listing corrections recorded.</div>
                }
              </div>
            }
          </aside>
        </section>
      }

      @if (correctionModalOpen()) {
        <div class="app-modal-backdrop" (click)="closeCorrectionModal()">
          <div class="app-modal listing-correction-modal" (click)="$event.stopPropagation()">
            <div class="app-modal__header">
              <div>
                <h2>Correct Listing</h2>
                <p>Update listing-only fields before completing review.</p>
              </div>
              <button mat-icon-button type="button" (click)="closeCorrectionModal()">
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <form class="app-modal__body correction-form" [formGroup]="correctionForm">
              @if (correctionProduct()?.hasOrders) {
                <div class="inline-state inline-state--warning">
                  This product already has orders associated with it.
                </div>
              }

              <mat-form-field appearance="outline">
                <mat-label>Listing account</mat-label>
                <mat-select formControlName="accountId">
                  @for (account of accounts(); track account.id) {
                    <mat-option [value]="account.id">{{ account.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Listed eBay link</mat-label>
                <input matInput formControlName="listingUrl" autocomplete="off" />
                @if (correctionForm.controls.listingUrl.hasError('ebayUrl')) {
                  <mat-error>Enter a valid eBay URL.</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Listing status</mat-label>
                <mat-select formControlName="listingStatus">
                  @for (option of listingStatusOptions; track option.value) {
                    <mat-option [value]="option.value">{{ option.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Listing notes</mat-label>
                <textarea matInput rows="3" formControlName="listingNotes"></textarea>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Review notes</mat-label>
                <textarea matInput rows="3" formControlName="reviewNotes"></textarea>
              </mat-form-field>
            </form>

            <div class="app-modal__footer">
              <button mat-stroked-button type="button" (click)="closeCorrectionModal()">Cancel</button>
              <button
                mat-flat-button
                color="primary"
                type="button"
                (click)="submitListingCorrection()"
                [disabled]="correctionForm.invalid || saving()"
              >
                <mat-icon>save</mat-icon>
                <span>Save Correction</span>
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  `,
  styleUrl: '../lister/lister-products.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingReviewQueueComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly listerApi = inject(ListerApiService);
  private readonly productAdminApi = inject(ProductAdminApiService);
  private readonly referenceData = inject(ReferenceDataService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly products = signal<Product[]>([]);
  readonly categories = signal<ProductCategory[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly selectedProductId = signal('');
  readonly correctionModalOpen = signal(false);
  readonly correctionProduct = signal<Product | null>(null);
  readonly rejectionReason = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly correctionForm = new FormGroup({
    accountId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    listingUrl: new FormControl('', { nonNullable: true, validators: [listingLinkValidator] }),
    listingStatus: new FormControl<ProductStatus>('listed_needs_review', { nonNullable: true }),
    listingNotes: new FormControl('', { nonNullable: true }),
    reviewNotes: new FormControl('', { nonNullable: true }),
  });
  readonly listingStatusOptions: Array<{ value: ProductStatus; label: string }> = [
    { value: 'listed', label: 'Listed' },
    { value: 'listed_needs_review', label: 'Pending review' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'ready_for_listing', label: 'Assigned' },
  ];
  readonly productStatusLabel = productStatusLabel;
  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    status: new FormControl<'listed_needs_review' | 'rejected' | ''>('listed_needs_review', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  readonly scope = computed(() => (this.route.snapshot.data['reviewScope'] || 'lister') as ReviewScope);
  readonly title = computed(() => this.route.snapshot.data['title'] || 'Listing Review Queue');
  readonly subtitle = computed(() => this.route.snapshot.data['subtitle'] || '');
  readonly selectedProduct = computed(
    () => this.products().find((product) => product.id === this.selectedProductId()) || null,
  );
  readonly pageLabel = computed(() => `${this.products().length} review item${this.products().length === 1 ? '' : 's'}`);

  ngOnInit(): void {
    this.referenceData.getProductCategories(true).subscribe((categories) => this.categories.set(categories));
    this.referenceData.getAccounts(true).subscribe((accounts) => this.accounts.set(accounts));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const filters = this.buildFilters();
    const request$ =
      this.scope() === 'lister'
        ? this.listerApi.listListingReviews(filters)
        : this.productAdminApi.listProducts(filters);

    request$.subscribe({
      next: (page) => {
        this.products.set(page.items);
        this.selectedProductId.set(page.items[0]?.id || '');
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load listing review items.');
        this.loading.set(false);
      },
    });
  }

  applyFilters(): void {
    this.load();
  }

  resetFilters(): void {
    this.filters.reset(
      { search: '', status: 'listed_needs_review', category: '', from: '', to: '' },
      { emitEvent: false },
    );
    this.load();
  }

  applyDatePreset(preset: 'today' | 'yesterday'): void {
    const target = new Date();

    if (preset === 'yesterday') {
      target.setDate(target.getDate() - 1);
    }

    const date = toLocalDateInput(target);
    this.filters.patchValue(
      {
        from: date,
        to: date,
      },
      { emitEvent: false },
    );
    this.load();
  }

  selectProduct(productId: string): void {
    this.selectedProductId.set(productId);
    const request$ =
      this.scope() === 'lister'
        ? this.listerApi.getProductById(productId)
        : this.productAdminApi.getProductById(productId);

    request$.subscribe({
      next: (product) => this.applyProductUpdate(product),
      error: () => undefined,
    });
  }

  approveCurrent(): void {
    const product = this.selectedProduct();
    if (!product) {
      return;
    }
    this.resetRejectionReason();
    this.saving.set(true);
    const request$ =
      this.scope() === 'lister'
        ? this.listerApi.approveListingReview(product.id)
        : this.productAdminApi.approveListingReview(product.id);
    request$.subscribe({
      next: (updated) => {
        this.applyProductUpdate(updated);
        this.resetRejectionReason();
        this.toast.success('Listing approved.');
        this.saving.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not approve listing.');
        this.saving.set(false);
      },
    });
  }

  rejectCurrent(): void {
    const product = this.selectedProduct();
    if (!product) {
      return;
    }
    if (this.rejectionReason.invalid) {
      this.rejectionReason.markAsTouched();
      return;
    }
    this.saving.set(true);
    const request$ =
      this.scope() === 'lister'
        ? this.listerApi.rejectListingReview(product.id, this.rejectionReason.value.trim())
        : this.productAdminApi.rejectListingReview(product.id, this.rejectionReason.value.trim());
    request$.subscribe({
      next: (updated) => {
        this.applyProductUpdate(updated);
        this.rejectionReason.reset('', { emitEvent: false });
        this.toast.success('Listing rejected.');
        this.saving.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not reject listing.');
        this.saving.set(false);
      },
    });
  }

  openCorrectionModal(product = this.selectedProduct()): void {
    if (!product) {
      return;
    }

    this.correctionProduct.set(product);
    this.correctionForm.reset(
      {
        accountId: product.accountUsed || '',
        listingUrl: product.listingUrl || '',
        listingStatus: this.listingStatusOptions.some((option) => option.value === product.status)
          ? product.status
          : 'listed_needs_review',
        listingNotes: product.listingNotes || '',
        reviewNotes: product.reviewNotes || '',
      },
      { emitEvent: false },
    );
    this.correctionModalOpen.set(true);
  }

  closeCorrectionModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.correctionModalOpen.set(false);
    this.correctionProduct.set(null);
  }

  async submitListingCorrection(confirmOrderImpact = false): Promise<void> {
    const product = this.correctionProduct();

    if (!product || this.correctionForm.invalid || this.saving()) {
      this.correctionForm.markAllAsTouched();
      return;
    }

    const raw = this.correctionForm.getRawValue();
    const request$ =
      this.scope() === 'lister'
        ? this.listerApi.correctListing(product.id, {
            accountId: raw.accountId,
            listingUrl: raw.listingUrl.trim(),
            listingStatus: raw.listingStatus,
            listingNotes: raw.listingNotes.trim() || null,
            reviewNotes: raw.reviewNotes.trim() || null,
            confirmOrderImpact,
          })
        : this.productAdminApi.correctListing(product.id, {
            accountId: raw.accountId,
            listingUrl: raw.listingUrl.trim(),
            listingStatus: raw.listingStatus,
            listingNotes: raw.listingNotes.trim() || null,
            reviewNotes: raw.reviewNotes.trim() || null,
            confirmOrderImpact,
          });

    this.saving.set(true);
    request$.subscribe({
      next: (updated) => {
        this.applyProductUpdate(updated);
        this.closeCorrectionModal(true);
        this.toast.success('Listing corrected.');
        this.saving.set(false);
      },
      error: async (error) => {
        this.saving.set(false);

        if (error?.status === 409 && error?.error?.requiresConfirmation) {
          const confirmed = await this.confirm.ask({
            title: 'Orders already exist',
            message:
              'This product already has orders associated with it. Continue with this listing correction?',
            confirmText: 'Continue',
            tone: 'danger',
          });

          if (confirmed) {
            await this.submitListingCorrection(true);
            return;
          }
        }

        this.error.set(error?.error?.message || 'Could not correct listing.');
      },
    });
  }

  openLink(url: string | null | undefined): void {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  private buildFilters(): ProductFilters {
    const raw = this.filters.getRawValue();
    return {
      search: raw.search.trim() || undefined,
      status: raw.status || undefined,
      category: raw.category || undefined,
      from: raw.from || undefined,
      to: raw.to || undefined,
      page: 1,
      limit: 50,
    };
  }

  private applyProductUpdate(updated: Product): void {
    this.products.update((products) => products.map((product) => (product.id === updated.id ? updated : product)));
    this.selectedProductId.set(updated.id);
  }

  private resetRejectionReason(): void {
    this.rejectionReason.reset('', { emitEvent: false });
    this.rejectionReason.markAsPristine();
    this.rejectionReason.markAsUntouched();
  }
}
