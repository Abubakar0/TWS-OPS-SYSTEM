import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { DashboardService, HunterDashboardStats } from '../../core/services/dashboard.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { HuntingCriteria } from '../../core/models/product.models';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

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
    <section class="page-shell">
      <article class="surface-card">
        <div class="surface-card__header">
          <div>
            <h1>My Training Progress</h1>
            <p>Track approval readiness and see how close you are to activation.</p>
          </div>
          <div class="page-actions">
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
        <section class="hr-kpis">
          <article class="hr-kpi"><span>Submitted</span><strong>{{ stats()!.totalHunted }}</strong></article>
          <article class="hr-kpi"><span>Approved</span><strong>{{ stats()!.approved }}</strong></article>
          <article class="hr-kpi"><span>Rejected</span><strong>{{ stats()!.rejected }}</strong></article>
          <article class="hr-kpi"><span>Listed</span><strong>{{ stats()!.listed }}</strong></article>
          <article class="hr-kpi"><span>Orders Generated</span><strong>{{ stats()!.orderStats?.totalOrders || 0 }}</strong></article>
          <article class="hr-kpi"><span>Profit Generated</span><strong>{{ totalProfit() | number: '1.2-2' }}</strong></article>
          <article class="hr-kpi"><span>Approval Rate</span><strong>{{ approvalRate() | number: '1.0-2' }}%</strong></article>
          <article class="hr-kpi"><span>Rules Read</span><strong>{{ rulesAcknowledgedLabel() }}</strong></article>
        </section>

        <section class="section-grid">
          <article class="surface-card">
            <div class="surface-card__header">
              <div>
                <h2>Activation Readiness</h2>
                <p>Your current training thresholds compared against the activation targets.</p>
              </div>
            </div>

            <div class="simple-table">
              @for (row of readinessRows(); track row.label) {
                <div class="simple-table__row simple-table__row--two">
                  <div>
                    <strong>{{ row.label }}</strong>
                    <small>{{ row.detail }}</small>
                  </div>
                  <span
                    class="status-badge"
                    [class.status-badge--success]="row.passed"
                    [class.status-badge--warning]="!row.passed"
                  >
                    {{ row.current }} / {{ row.target }}
                  </span>
                </div>
              }
            </div>

            <div class="inline-state" [class.inline-state--success]="activationReady()" [class.inline-state--warning]="!activationReady()">
              {{ activationReady() ? 'This hunter is ready for activation review.' : 'Keep improving the metrics above before activation.' }}
            </div>
          </article>

          <article class="surface-card">
            <div class="surface-card__header">
              <div>
                <h2>Training Status</h2>
                <p>Mentor assignment and manual training window from Admin or Super Admin.</p>
              </div>
            </div>

            <div class="detail-facts">
              <div class="detail-fact">
                <span>Hunter Status</span>
                <strong>{{ auth.currentUser()?.hunterStatus || 'ACTIVE' }}</strong>
              </div>
              <div class="detail-fact">
                <span>Mentor Lister</span>
                <strong>{{ auth.currentUser()?.mentorListerId ? 'Assigned' : 'Not assigned' }}</strong>
              </div>
              <div class="detail-fact">
                <span>Training Extended Until</span>
                <strong>{{ auth.currentUser()?.trainingExtendedUntil || 'Not set' }}</strong>
              </div>
            </div>
          </article>
        </section>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterTrainingProgressComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly dashboard = inject(DashboardService);
  private readonly referenceData = inject(ReferenceDataService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly stats = signal<HunterDashboardStats | null>(null);
  readonly criteria = signal<HuntingCriteria | null>(null);

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
        label: 'Approval Rate',
        detail: 'Approved products divided by submitted products.',
        current: `${approvalRate.toFixed(1)}%`,
        target: `${criteria.trainingMinApprovalRateForActivation || 0}%`,
        passed: approvalRate >= (criteria.trainingMinApprovalRateForActivation || 0),
      },
      {
        label: 'Listed Products',
        detail: 'Products that reached final listed status.',
        current: stats.listed,
        target: criteria.trainingMinListedProductsForActivation || 0,
        passed: stats.listed >= (criteria.trainingMinListedProductsForActivation || 0),
      },
      {
        label: 'Orders Generated',
        detail: 'Orders generated from your listed products.',
        current: ordersGenerated,
        target: criteria.trainingMinOrdersGeneratedForActivation || 0,
        passed: ordersGenerated >= (criteria.trainingMinOrdersGeneratedForActivation || 0),
      },
      {
        label: 'Rejected Products',
        detail: 'Stay below the maximum rejected products allowance.',
        current: stats.rejected,
        target: criteria.trainingMaxRejectedProductsAllowed || 0,
        passed: stats.rejected <= (criteria.trainingMaxRejectedProductsAllowed || 0),
      },
    ];
  });
  readonly activationReady = computed(() => this.readinessRows().every((row) => row.passed));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.dashboard.getHunterStats().subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load training progress.');
        this.loading.set(false);
      },
    });

    this.referenceData.loadCriteriaOnce().subscribe({
      next: (criteria) => this.criteria.set(criteria),
      error: () => this.criteria.set(null),
    });
  }
}
