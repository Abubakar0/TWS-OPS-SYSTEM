import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { take } from 'rxjs';

import { HuntingCriteria } from '../../core/models/product.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { SessionCacheService } from '../../core/state/session-cache.service';

@Component({
  selector: 'app-hunter-rules',
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './hunter-rules.component.html',
  styleUrl: './hunter-rules.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterRulesComponent implements OnInit {
  readonly loading = signal(true);
  readonly error = signal('');
  readonly criteria = signal<HuntingCriteria | null>(null);
  readonly basics = [
    'Start with ASIN verification before you fill the form.',
    'Use real Amazon and eBay product links only.',
    'Check stock, sold count, rating, and recent sales before you submit.',
    'Use up-trending products and realistic delivery timelines.',
    'Review your live products every Saturday before fresh hunting starts.',
  ];

  readonly ruleRows = computed(() => {
    const criteria = this.criteria();

    if (!criteria) {
      return [];
    }

    return [
      ['Minimum ROI', `${criteria.minRoi}%`],
      ['Minimum profit', `${criteria.minProfit.toFixed(2)}`],
      ['Minimum Amazon stock', `${criteria.minStockCount}`],
      ['Minimum alternate stock', `${criteria.minAlternateStockCount}`],
      ['Minimum sold count', `${criteria.minSoldCount}`],
      ['Minimum rating', `${criteria.minRating}`],
      ['Minimum watchers', `${criteria.minWatcherCount}`],
      ['Minimum 2-month sales', `${criteria.minSalesLastTwoMonths}`],
      ['Maximum delivery days', `${criteria.maxDeliveryDays}`],
      ['Require ASIN', criteria.asinRequired ? 'Yes' : 'No'],
      ['Require custom label', criteria.customLabelRequired ? 'Yes' : 'No'],
      ['Require basket count', criteria.basketCountRequired ? 'Yes' : 'No'],
      ['Require delivery days', criteria.deliveryDaysRequired ? 'Yes' : 'No'],
      ['Require 1-month graph uptrend', criteria.monthlyGraphRequired ? 'Yes' : 'No'],
      ['Require watchers', criteria.watchersRequired ? 'Yes' : 'No'],
    ];
  });

  readonly qualityGuide = computed(() => {
    const criteria = this.criteria();

    if (!criteria) {
      return [];
    }

    const excellentRoi = Math.max(criteria.minRoi + 15, criteria.minRoi * 1.35, 35);
    const excellentProfit = Math.max(criteria.minProfit + 5, criteria.minProfit * 1.5, 5);
    const excellentSales = Math.max(
      criteria.minSalesLastTwoMonths + 12,
      criteria.minSalesLastTwoMonths * 1.4,
      12,
    );
    const excellentStock = Math.max(criteria.minStockCount + 4, criteria.minStockCount * 1.3, 12);
    const excellentRating = Math.max(criteria.minRating + 0.5, 4.2);

    return [
      {
        label: 'Best Hunt',
        detail: `Passes every rule and hits at least 4 strong signals: ROI ${excellentRoi.toFixed(0)}%+, profit ${excellentProfit.toFixed(2)}+, sales ${excellentSales}+, stock ${excellentStock}+, rating ${excellentRating.toFixed(1)}+.`,
      },
      {
        label: 'Good Hunt',
        detail: 'Passes every rule and lands at least 2 strong signals above the current baseline.',
      },
      {
        label: 'Avg Hunt',
        detail: 'Passes the required rules but stays close to the minimum thresholds.',
      },
      {
        label: 'Rejected',
        detail: 'Misses one or more required rules for approval.',
      },
    ];
  });

  private readonly sessionCache = inject(SessionCacheService);

  constructor(private readonly referenceData: ReferenceDataService) {}

  ngOnInit(): void {
    const cachedCriteria = this.sessionCache.criteria();

    if (cachedCriteria) {
      this.criteria.set(cachedCriteria);
      this.loading.set(false);
    }

    this.referenceData
      .loadCriteriaOnce()
      .pipe(take(1))
      .subscribe({
        next: (criteria) => {
          this.criteria.set(criteria);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load the current hunting criteria.');
          this.loading.set(false);
        },
      });
  }
}
