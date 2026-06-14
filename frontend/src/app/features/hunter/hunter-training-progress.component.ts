import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';

import { HunterApiService } from '../../core/api/hunter-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/auth.models';
import { HuntingCriteria, Product } from '../../core/models/product.models';
import { DashboardService, HunterDashboardStats } from '../../core/services/dashboard.service';
import { productStatusLabel } from '../../core/config/statuses';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-hunter-training-progress',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  template: `
    <section class="page-shell training-page">
      <article class="surface-card training-header">
        <div>
          <span class="kicker">Training progress</span>
          <h1>My Training Progress</h1>
          <p>Track approval readiness, mentor assignment, and recent training submissions.</p>
        </div>
        <div class="training-header__actions">
          <span class="status-badge" [class.status-badge--success]="statusLabel() === 'ACTIVE'" [class.status-badge--warning]="statusLabel() === 'TRAINING'" [class.status-badge--danger]="statusLabel() === 'REJECTED'">
            {{ statusLabel() }}
          </span>
          <a mat-stroked-button routerLink="/hunter/rules">
            <mat-icon>rule</mat-icon>
            <span>Open Rules</span>
          </a>
          <a
            mat-flat-button
            color="primary"
            routerLink="/hunter/submission"
            [class.is-disabled]="!auth.currentUser()?.trainingRulesAcknowledgedAt"
          >
            <mat-icon>playlist_add</mat-icon>
            <span>Submit Product</span>
          </a>
        </div>
      </article>

      @if (loading()) {
        <article class="surface-card">
          <div class="loading-state">
            <mat-spinner diameter="24"></mat-spinner>
            <span>Loading training progress.</span>
          </div>
        </article>
      } @else if (error()) {
        <app-error-state [message]="error()" actionLabel="Retry" (action)="load()" />
      } @else if (!stats()) {
        <app-empty-state
          title="No training data yet"
          message="Submit products to start building your training record."
          icon="school"
        />
      } @else {
        <section class="progress-grid">
          @for (card of progressCards(); track card.label) {
            <article class="metric-card">
              <mat-icon>{{ card.icon }}</mat-icon>
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
            </article>
          }
        </section>

        <section class="training-main">
          <article class="surface-card readiness-card">
            <div class="surface-card__header">
              <div>
                <h2>Activation Readiness</h2>
                <p>Requirements met and missing for hunter activation review.</p>
              </div>
              <span class="status-badge" [class.status-badge--success]="activationReady()" [class.status-badge--warning]="!activationReady()">
                {{ activationReady() ? 'Ready' : 'In Progress' }}
              </span>
            </div>

            <div class="readiness-list">
              @for (row of readinessRows(); track row.label) {
                <div class="readiness-row" [class.readiness-row--passed]="row.passed">
                  <mat-icon>{{ row.passed ? 'check_circle' : 'cancel' }}</mat-icon>
                  <div>
                    <strong>{{ row.label }}</strong>
                    <span>{{ row.detail }}</span>
                  </div>
                  <b>{{ row.current }} / {{ row.target }}</b>
                </div>
              }
            </div>
          </article>

          <article class="surface-card mentor-card">
            <div class="surface-card__header">
              <div>
                <h2>Assigned Mentor Lister</h2>
                <p>Use mentor feedback before submitting borderline products.</p>
              </div>
            </div>

            @if (mentorLister()) {
              <div class="mentor-profile">
                <span class="avatar">{{ mentorInitials() }}</span>
                <div>
                  <strong>{{ mentorLister()!.name }}</strong>
                  <span>{{ mentorLister()!.email }}</span>
                </div>
              </div>
              <div class="detail-facts">
                <div class="detail-fact">
                  <span>Performance Summary</span>
                  <strong>Mentor assigned for training review and listing guidance.</strong>
                </div>
                <div class="detail-fact">
                  <span>Rules Read</span>
                  <strong>{{ rulesAcknowledgedLabel() }}</strong>
                </div>
              </div>
            } @else {
              <div class="inline-state inline-state--warning">No mentor lister is assigned yet.</div>
            }
          </article>
        </section>

        <article class="surface-card">
          <div class="surface-card__header">
            <div>
              <h2>Recent Products</h2>
              <p>Latest training submissions with approval and listing state.</p>
            </div>
          </div>

          @if (!recentProducts().length) {
            <app-empty-state
              title="No recent products"
              message="Your latest submissions will appear here."
              icon="inventory_2"
            />
          } @else {
            <div class="recent-grid">
              <div class="recent-grid__header">
                <span>Product</span>
                <span>Status</span>
                <span>Quality</span>
                <span>Profit</span>
                <span>Submitted</span>
              </div>
              @for (product of recentProducts(); track product.id) {
                <div class="recent-grid__row">
                  <span>
                    <strong>{{ product.title || product.asin || 'Untitled product' }}</strong>
                    <small>{{ product.asin || product.customLabel || 'No ASIN' }}</small>
                  </span>
                  <span class="status-badge">{{ productStatusLabel(product.status) }}</span>
                  <span>{{ product.qualityLabel || 'Not graded' }}</span>
                  <span>{{ product.profit | currency: 'USD' }}</span>
                  <span>{{ product.createdAt | date: 'mediumDate' }}</span>
                </div>
              }
            </div>
          }
        </article>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .training-page {
        display: grid;
        gap: 18px;
      }

      .training-header,
      .training-header__actions {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
      }

      .training-header__actions {
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .progress-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .metric-card {
        display: grid;
        gap: 8px;
        padding: 16px;
        border: 1px solid rgba(226, 232, 240, 0.96);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.92);
      }

      .metric-card mat-icon {
        color: var(--tws-primary-strong);
      }

      .metric-card span,
      .detail-fact span {
        color: var(--tws-muted);
        font-size: 0.76rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .metric-card strong {
        font-size: 1.45rem;
      }

      .training-main {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
        gap: 16px;
        align-items: start;
      }

      .readiness-list,
      .detail-facts {
        display: grid;
        gap: 10px;
      }

      .readiness-row {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 13px 14px;
        border: 1px solid rgba(245, 158, 11, 0.28);
        border-radius: 14px;
        background: rgba(255, 251, 235, 0.76);
      }

      .readiness-row--passed {
        border-color: rgba(16, 185, 129, 0.28);
        background: rgba(236, 253, 245, 0.78);
      }

      .readiness-row mat-icon {
        color: #d97706;
      }

      .readiness-row--passed mat-icon {
        color: #059669;
      }

      .readiness-row div {
        display: grid;
        gap: 3px;
      }

      .readiness-row span,
      .mentor-profile span,
      .recent-grid small {
        color: var(--tws-muted);
      }

      .mentor-profile {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 14px;
      }

      .mentor-profile div {
        display: grid;
        gap: 2px;
      }

      .avatar {
        display: grid;
        width: 46px;
        height: 46px;
        place-items: center;
        border-radius: 16px;
        color: var(--tws-primary-strong);
        background: rgba(37, 99, 235, 0.12);
        font-weight: 800;
      }

      .detail-fact {
        display: grid;
        gap: 4px;
        padding: 14px;
        border: 1px solid rgba(226, 232, 240, 0.96);
        border-radius: 14px;
        background: rgba(248, 250, 252, 0.8);
      }

      .recent-grid {
        display: grid;
        overflow: auto;
        border: 1px solid rgba(226, 232, 240, 0.96);
        border-radius: 16px;
      }

      .recent-grid__header,
      .recent-grid__row {
        display: grid;
        grid-template-columns: minmax(260px, 1.4fr) repeat(4, minmax(120px, 1fr));
        gap: 12px;
        align-items: center;
        min-width: 820px;
        padding: 12px 14px;
      }

      .recent-grid__header {
        color: var(--tws-muted);
        background: rgba(248, 250, 252, 0.96);
        font-size: 0.76rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .recent-grid__row {
        border-top: 1px solid rgba(226, 232, 240, 0.86);
      }

      .recent-grid__row > span:first-child {
        display: grid;
        gap: 3px;
      }

      .is-disabled {
        opacity: 0.62;
        pointer-events: none;
      }

      @media (max-width: 1180px) {
        .progress-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .training-main {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .training-header,
        .training-header__actions {
          flex-direction: column;
          align-items: stretch;
        }

        .progress-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterTrainingProgressComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly dashboard = inject(DashboardService);
  private readonly referenceData = inject(ReferenceDataService);
  private readonly hunterApi = inject(HunterApiService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly stats = signal<HunterDashboardStats | null>(null);
  readonly criteria = signal<HuntingCriteria | null>(null);
  readonly recentProducts = signal<Product[]>([]);
  readonly listers = signal<User[]>([]);

  readonly statusLabel = computed(() => this.auth.currentUser()?.hunterStatus || 'ACTIVE');
  readonly productStatusLabel = productStatusLabel;
  readonly mentorLister = computed(() => {
    const mentorId = this.auth.currentUser()?.mentorListerId;
    return mentorId ? this.listers().find((lister) => lister.id === mentorId) || null : null;
  });
  readonly mentorInitials = computed(() =>
    (this.mentorLister()?.name || 'Mentor')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join(''),
  );
  readonly approvalRate = computed(() => {
    const current = this.stats();
    if (!current?.totalHunted) {
      return 0;
    }
    return (current.approved / current.totalHunted) * 100;
  });
  readonly totalProfit = computed(() => this.stats()?.orderStats?.totalProfit || 0);
  readonly rulesAcknowledgedLabel = computed(() =>
    this.auth.currentUser()?.trainingRulesAcknowledgedAt ? 'Completed' : 'Required',
  );
  readonly progressCards = computed(() => {
    const stats = this.stats();

    if (!stats) {
      return [];
    }

    return [
      { label: 'Products Submitted', value: String(stats.totalHunted), icon: 'inventory_2' },
      { label: 'Approved', value: String(stats.approved), icon: 'check_circle' },
      { label: 'Rejected', value: String(stats.rejected), icon: 'cancel' },
      { label: 'Listed', value: String(stats.listed), icon: 'storefront' },
      { label: 'Orders Generated', value: String(stats.orderStats?.totalOrders || 0), icon: 'receipt_long' },
      { label: 'Profit Generated', value: this.formatMoney(this.totalProfit()), icon: 'attach_money' },
      { label: 'Approval Rate', value: `${this.approvalRate().toFixed(1)}%`, icon: 'percent' },
      { label: 'Activation Readiness', value: this.activationReady() ? 'Ready' : 'In Progress', icon: 'workspace_premium' },
    ];
  });
  readonly readinessRows = computed(() => {
    const stats = this.stats();
    const criteria = this.criteria();
    if (!stats || !criteria) {
      return [];
    }

    const ordersGenerated = stats.orderStats?.totalOrders || 0;
    const approvalRate = this.approvalRate();

    return [
      {
        label: 'Minimum Products Met',
        detail: 'Products that reached final listed status.',
        current: stats.listed,
        target: criteria.trainingMinListedProductsForActivation || 0,
        passed: stats.listed >= (criteria.trainingMinListedProductsForActivation || 0),
      },
      {
        label: 'Approval Rate Met',
        detail: 'Approved products divided by submitted products.',
        current: `${approvalRate.toFixed(1)}%`,
        target: `${criteria.trainingMinApprovalRateForActivation || 0}%`,
        passed: approvalRate >= (criteria.trainingMinApprovalRateForActivation || 0),
      },
      {
        label: 'Orders Requirement Met',
        detail: 'Orders generated from your listed products.',
        current: ordersGenerated,
        target: criteria.trainingMinOrdersGeneratedForActivation || 0,
        passed: ordersGenerated >= (criteria.trainingMinOrdersGeneratedForActivation || 0),
      },
      {
        label: 'Rejections Within Limit',
        detail: 'Rejected products must stay below the training allowance.',
        current: stats.rejected,
        target: criteria.trainingMaxRejectedProductsAllowed || 0,
        passed: stats.rejected <= (criteria.trainingMaxRejectedProductsAllowed || 0),
      },
    ];
  });
  readonly activationReady = computed(() => this.readinessRows().length > 0 && this.readinessRows().every((row) => row.passed));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    forkJoin({
      stats: this.dashboard.getHunterStats(),
      criteria: this.referenceData.loadCriteriaOnce().pipe(catchError(() => of(null))),
      products: this.hunterApi.listProducts({ page: 1, limit: 6 }).pipe(
        map((result) => result.items),
        catchError(() => of([] as Product[])),
      ),
      listers: this.referenceData.getUsers('lister').pipe(catchError(() => of([] as User[]))),
    }).subscribe({
      next: ({ stats, criteria, products, listers }) => {
        this.stats.set(stats);
        this.criteria.set(criteria);
        this.recentProducts.set(products);
        this.listers.set(listers);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load training progress.');
        this.loading.set(false);
      },
    });
  }

  private formatMoney(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }
}
