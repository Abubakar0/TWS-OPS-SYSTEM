import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { HuntingCriteria } from '../../core/models/product.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';

@Component({
  selector: 'app-hunter-rules',
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './hunter-rules.component.html',
  styleUrl: './hunter-rules.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterRulesComponent {
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

  constructor(private readonly referenceData: ReferenceDataService) {
    this.referenceData
      .getCriteria()
      .pipe(takeUntilDestroyed())
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
