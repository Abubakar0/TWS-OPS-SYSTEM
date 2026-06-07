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
  readonly recommendedTools = [
    {
      name: 'eBay Sold History',
      purpose: 'Check real sold demand before hunting.',
      description: 'Review sold listings to confirm buyers are actively purchasing the same or very similar item.',
      usage: 'Open sold history, compare sell-through, note title patterns, and confirm price consistency.',
      link: 'https://www.ebay.com/sh/research',
    },
    {
      name: 'eBay Image Downloader',
      purpose: 'Verify listing image quality and reuse patterns.',
      description: 'Pull listing imagery quickly so you can compare product matches and catch weak or duplicate source photos.',
      usage: 'Use it when you need to compare the Amazon source item against existing eBay competitors.',
      link: 'https://chromewebstore.google.com/',
    },
    {
      name: 'Keepa',
      purpose: 'Track Amazon pricing, stock swings, and demand history.',
      description: 'Keepa helps confirm whether the current Amazon buy price and stock are stable enough to support a clean listing.',
      usage: 'Check the buy box price, recent price spikes, stock dips, and offer consistency before you submit.',
      link: 'https://keepa.com/',
    },
    {
      name: 'Grabley',
      purpose: 'Speed up product research and cross-platform checks.',
      description: 'Use Grabley when you need faster sourcing comparisons or support material during the hunt.',
      usage: 'Cross-check demand signals and save yourself manual comparison time.',
      link: 'https://grabley.com/',
    },
    {
      name: 'SellerSprite',
      purpose: 'Validate competition and demand trends.',
      description: 'SellerSprite is useful for deeper product intelligence, especially when you need extra confidence on demand.',
      usage: 'Review search demand, related competition, and broader product movement before you submit borderline items.',
      link: 'https://www.sellersprite.com/',
    },
  ];
  readonly basics = [
    'Start with ASIN verification before you fill the form.',
    'Use real Amazon and eBay product links only.',
    'Check stock, sold count, rating, and recent sales before you submit.',
    'Use up-trending products and realistic delivery timelines.',
    'Review your live products every Saturday before fresh hunting starts.',
  ];
  readonly documentationSections = [
    {
      title: 'Introduction',
      items: [
        'Always work from a real Amazon source item and a real comparable eBay market.',
        'Do not submit a product just because it looks profitable on one screen. Verify every signal first.',
      ],
    },
    {
      title: 'Product Requirements',
      items: [
        'ASIN must be valid and should be checked for duplicates in the workspace.',
        'Product title, links, and pricing should describe the same item across platforms.',
        'Avoid mismatched variants, bundles, or ambiguous fitment listings.',
      ],
    },
    {
      title: 'Profit Rules',
      items: [
        'Minimum profit comes from the live admin settings.',
        'Leave buffer for fees, stock movement, and normal market changes.',
      ],
    },
    {
      title: 'ROI Rules',
      items: [
        'Minimum ROI comes from the live admin settings.',
        'Higher ROI products should still be checked for stock and demand stability before submission.',
      ],
    },
    {
      title: 'Stock Rules',
      items: [
        'Confirm Amazon stock meets the live minimum requirement.',
        'Use alternate stock when available, but do not rely on weak or temporary stock signals.',
      ],
    },
    {
      title: 'Rating / Watcher / Sales Rules',
      items: [
        'Check rating quality, watchers, and recent sales together rather than in isolation.',
        'A single strong metric does not rescue a weak product if the rest of the signals are poor.',
      ],
    },
    {
      title: 'Duplicate Rules',
      items: [
        'Never submit a duplicate ASIN already present in the system.',
        'Watch for duplicate product matches created through slightly different titles or links.',
      ],
    },
  ];
  readonly rejectedReasons = [
    'Profit below the minimum threshold.',
    'ROI below the minimum threshold.',
    'Stock too low or unstable.',
    'Sales history too weak for safe listing.',
    'Rating too low or product quality looks unreliable.',
    'Duplicate ASIN already exists in the workspace.',
    'Links do not point to the same real product.',
    'Delivery timeline is too slow for approval.',
  ];
  readonly processSteps = [
    'Search products with recent eBay sold demand, not just active listings.',
    'Validate the exact Amazon source item and confirm ASIN, title, and fitment.',
    'Check current Amazon price, stock, and price-history stability.',
    'Confirm eBay demand using sold history, competition, and live listing quality.',
    'Evaluate profit, ROI, and fee buffer against the live approval rules.',
    'Reject the product yourself if it clearly fails demand, stock, or duplicate checks.',
    'Submit only after every required field and every rule is satisfied.',
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
