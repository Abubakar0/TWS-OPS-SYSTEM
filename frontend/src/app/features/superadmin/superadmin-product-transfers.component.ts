import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../core/auth/auth.service';
import { ProductAdminApiService } from '../../core/api/product-admin-api.service';
import { ProductOwnershipTransferSummary } from '../../core/models/product.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { ToastService } from '../../core/ui/toast.service';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../shared/ui/searchable-select.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-superadmin-product-transfers',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SearchableSelectComponent,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  template: `
    <section class="page-shell">
      <article class="surface-card">
        <div class="surface-card__header">
          <div>
            <h1>Product Ownership Transfer</h1>
            <p>Transfer all or selected products from one hunter to another while preserving ownership history.</p>
          </div>
        </div>

        <form class="form-grid" [formGroup]="form" (ngSubmit)="loadSummary()">
          <app-searchable-select
            label="Source Hunter"
            [formControl]="form.controls.sourceHunterId"
            [options]="hunterOptions()"
          />
          <app-searchable-select
            label="Target Hunter"
            [formControl]="form.controls.targetHunterId"
            [options]="targetHunterOptions()"
          />
          <app-searchable-select
            label="Transfer Mode"
            [formControl]="form.controls.transferMode"
            [options]="transferModeOptions"
          />
          <div class="field-span-2 actions-row">
            <button mat-flat-button color="primary" type="submit" [disabled]="loading() || form.controls.sourceHunterId.invalid">
              <mat-icon>summarize</mat-icon>
              <span>Load Summary</span>
            </button>
          </div>
        </form>
      </article>

      @if (loading()) {
        <article class="surface-card">
          <div class="loading-state">
            <mat-spinner diameter="24"></mat-spinner>
            <span>Loading hunter ownership summary.</span>
          </div>
        </article>
      } @else if (error()) {
        <app-error-state [message]="error()" actionLabel="Retry" (action)="loadSummary()" />
      } @else if (summary(); as summary) {
        <section class="section-grid">
          <article class="surface-card">
            <div class="surface-card__header">
              <div>
                <h2>Source Hunter</h2>
                <p>{{ summary.hunter.name }} | {{ summary.hunter.email }}</p>
              </div>
            </div>
            <div class="detail-facts">
              <div class="detail-fact"><span>Total Products</span><strong>{{ summary.summary.total }}</strong></div>
              <div class="detail-fact"><span>Ready</span><strong>{{ summary.summary.readyForListing }}</strong></div>
              <div class="detail-fact"><span>Needs Review</span><strong>{{ summary.summary.listedNeedsReview }}</strong></div>
              <div class="detail-fact"><span>Listed</span><strong>{{ summary.summary.listed }}</strong></div>
              <div class="detail-fact"><span>Rejected</span><strong>{{ summary.summary.rejected }}</strong></div>
            </div>
            @if (summary.warning) {
              <div class="inline-state inline-state--warning">{{ summary.warning }}</div>
            }
          </article>

          <article class="surface-card">
            <div class="surface-card__header">
              <div>
                <h2>Transfer Action</h2>
                <p>Move ownership to the selected target hunter and preserve original ownership history.</p>
              </div>
            </div>
            <div class="inline-state inline-state--warning">
              This action updates current ownership and assigned lister routing for the transferred products.
            </div>
            <div class="actions-row">
              <button
                mat-flat-button
                color="primary"
                type="button"
                (click)="confirmTransfer()"
                [disabled]="saving() || form.invalid || !summary.summary.total"
              >
                <mat-icon>swap_horiz</mat-icon>
                <span>{{ saving() ? 'Transferring' : 'Transfer Products' }}</span>
              </button>
            </div>
          </article>

          @if (lastTransfer(); as transfer) {
            <article class="surface-card">
              <div class="surface-card__header">
                <div>
                  <h2>Confirmation Result</h2>
                  <p>Latest product transfer completed from this workspace.</p>
                </div>
              </div>

              <div class="detail-facts">
                <div class="detail-fact"><span>Source Hunter</span><strong>{{ transfer.sourceHunterName }}</strong></div>
                <div class="detail-fact"><span>Target Hunter</span><strong>{{ transfer.targetHunterName }}</strong></div>
                <div class="detail-fact"><span>Product Count</span><strong>{{ transfer.transferred }}</strong></div>
                <div class="detail-fact"><span>Transfer Date</span><strong>{{ transfer.transferredAt | date: 'MMM d, y, h:mm a' }}</strong></div>
                <div class="detail-fact"><span>Transferred By</span><strong>{{ transfer.transferredBy }}</strong></div>
              </div>
            </article>
          }
        </section>
      } @else {
        <app-empty-state
          title="Choose a source hunter"
          message="Load a hunter summary before transferring ownership."
          icon="swap_horiz"
        />
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperadminProductTransfersComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ProductAdminApiService);
  private readonly referenceData = inject(ReferenceDataService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly summary = signal<ProductOwnershipTransferSummary | null>(null);
  readonly lastTransfer = signal<{
    sourceHunterName: string;
    targetHunterName: string;
    transferred: number;
    transferredAt: string;
    transferredBy: string;
  } | null>(null);
  readonly hunters = signal<Array<{ id: string; name: string; email: string }>>([]);
  readonly form = new FormGroup({
    sourceHunterId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    targetHunterId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    transferMode: new FormControl<'all' | 'selected'>('all', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly transferModeOptions: SearchableSelectOption<'all' | 'selected'>[] = [
    { value: 'all', label: 'Transfer all products' },
    { value: 'selected', label: 'Transfer selected products' },
  ];
  readonly hunterOptions = computed(() =>
    this.hunters().map((hunter) => ({ value: hunter.id, label: hunter.name, description: hunter.email })),
  );
  readonly targetHunterOptions = computed(() =>
    this.hunters()
      .filter((hunter) => hunter.id !== this.form.controls.sourceHunterId.value)
      .map((hunter) => ({ value: hunter.id, label: hunter.name, description: hunter.email })),
  );
  readonly sourceHunterName = computed(
    () =>
      this.hunters().find((hunter) => hunter.id === this.form.controls.sourceHunterId.value)?.name ||
      this.summary()?.hunter.name ||
      'Source hunter',
  );
  readonly targetHunterName = computed(
    () =>
      this.hunters().find((hunter) => hunter.id === this.form.controls.targetHunterId.value)?.name ||
      'Target hunter',
  );

  ngOnInit(): void {
    this.referenceData.getUsers('hunter').subscribe((users) => {
      this.hunters.set(users.map((user) => ({ id: user.id, name: user.name, email: user.email })));
    });
  }

  loadSummary(): void {
    if (this.form.controls.sourceHunterId.invalid) {
      this.form.controls.sourceHunterId.markAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.getOwnershipTransferSummary(this.form.controls.sourceHunterId.value).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load product ownership summary.');
        this.loading.set(false);
      },
    });
  }

  confirmTransfer(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.transferProductOwnership(this.form.getRawValue()).subscribe({
      next: (result) => {
        this.lastTransfer.set({
          sourceHunterName: this.sourceHunterName(),
          targetHunterName: this.targetHunterName(),
          transferred: Number(result.transferred || 0),
          transferredAt: new Date().toISOString(),
          transferredBy: this.auth.currentUser()?.name || 'Current user',
        });
        this.toast.success(`Transferred ${Number(result.transferred || 0)} product(s).`);
        this.saving.set(false);
        this.loadSummary();
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not transfer product ownership.');
        this.saving.set(false);
      },
    });
  }
}
