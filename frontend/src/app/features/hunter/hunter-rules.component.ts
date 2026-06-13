import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { take } from 'rxjs';

import { HunterApiService } from '../../core/api/hunter-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { HuntingCriteria } from '../../core/models/product.models';
import { isTrainingHunterUser } from '../../core/models/auth.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { SessionCacheService } from '../../core/state/session-cache.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-hunter-rules',
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './hunter-rules.component.html',
  styleUrl: './hunter-rules.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterRulesComponent implements OnInit {
  readonly loading = signal(true);
  readonly acknowledging = signal(false);
  readonly error = signal('');
  readonly criteria = signal<HuntingCriteria | null>(null);
  readonly user = computed(() => this.auth.currentUser());
  readonly isTrainingHunter = computed(() => isTrainingHunterUser(this.user()));
  readonly hasAcknowledgedRules = computed(() =>
    Boolean(this.user()?.trainingRulesAcknowledgedAt),
  );
  readonly recommendedTools = [
    {
      name: 'eBay Sold History',
      purpose: 'Check real sold demand before hunting.',
      description: 'Review sold listings to confirm buyers are actively purchasing the same or very similar item.',
      usage: 'Open sold history, compare sell-through, note title patterns, and confirm price consistency.',
      link: 'https://chromewebstore.google.com/detail/ebay-sold-history-button/lhdknendolkhkmfpklppgpbimpbnlgel?hl=en',
    },
    {
      name: 'eBay Image Downloader',
      purpose: 'Verify listing image quality and reuse patterns.',
      description: 'Pull listing imagery quickly so you can compare product matches and catch weak or duplicate source photos.',
      usage: 'Use it when you need to compare the Amazon source item against existing eBay competitors.',
      link: 'https://chromewebstore.google.com/detail/ebay-image-downloader-ima/cghikkbnjoibaneicdgjdhjfcmijjgnp?hl=en',
    },
    {
      name: 'Keepa',
      purpose: 'Track Amazon pricing, stock swings, and demand history.',
      description: 'Keepa helps confirm whether the current Amazon buy price and stock are stable enough to support a clean listing.',
      usage: 'Check the buy box price, recent price spikes, stock dips, and offer consistency before you submit.',
      link: 'https://chromewebstore.google.com/detail/keepa-amazon-price-tracke/neebplgakaahbhdphmkckjjcegoiijjo?hl=en',
    },
    {
      name: 'Grabley',
      purpose: 'Speed up product research and cross-platform checks.',
      description: 'Use Grabley when you need faster sourcing comparisons or support material during the hunt.',
      usage: 'Cross-check demand signals and save yourself manual comparison time.',
      link: 'https://chromewebstore.google.com/detail/grabley-product-search-to/hppdgjpcbnbfapnailmeiibngpolplao?hl=en',
    },
    {
      name: 'SellerSprite',
      purpose: 'Validate competition and demand trends.',
      description: 'SellerSprite is useful for deeper product intelligence, especially when you need extra confidence on demand.',
      usage: 'Review search demand, related competition, and broader product movement before you submit borderline items.',
      link: 'https://chromewebstore.google.com/detail/sellersprite-amazon-resea/lnbmbgocenenhhhdojdielgnmeflbnfb?hl=en',
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
  readonly sectionNav = [
    { id: 'introduction', label: 'Introduction', icon: 'flag' },
    { id: 'company-rules', label: 'Company Hunting Rules', icon: 'rule' },
    { id: 'training-rules', label: 'Training Hunter Rules', icon: 'school' },
    { id: 'quality-rules', label: 'Product Quality Rules', icon: 'verified' },
    { id: 'profit-rules', label: 'Profit & ROI Rules', icon: 'trending_up' },
    { id: 'stock-rules', label: 'Stock Rules', icon: 'inventory_2' },
    { id: 'rating-rules', label: 'Rating Rules', icon: 'star' },
    { id: 'sales-rules', label: 'Sales Rules', icon: 'shopping_cart' },
    { id: 'duplicate-rules', label: 'Duplicate Product Rules', icon: 'content_copy' },
    { id: 'good-examples', label: 'Good Product Examples', icon: 'thumb_up' },
    { id: 'rejected-examples', label: 'Rejected Product Examples', icon: 'thumb_down' },
    { id: 'tools', label: 'Tools & Extensions', icon: 'extension' },
    { id: 'mistakes', label: 'Common Mistakes', icon: 'warning' },
    { id: 'acknowledgement', label: 'Final Acknowledgement', icon: 'task_alt' },
  ];
  readonly companyRules = [
    {
      title: 'Match the exact product',
      text: 'Amazon source, eBay demand, title, fitment, and variant must describe the same real item.',
      tone: 'success',
    },
    {
      title: 'Validate before submitting',
      text: 'Every product should pass stock, demand, price, profit, and duplicate checks before it enters review.',
      tone: 'success',
    },
    {
      title: 'Do not chase one strong metric',
      text: 'High ROI does not approve a product if stock, sales, rating, or link quality is weak.',
      tone: 'warning',
    },
  ];
  readonly qualityRules = [
    'Use clean product titles without keyword stuffing or vague variant language.',
    'Check that the main item, fitment, pack size, color, and bundle count match across Amazon and eBay.',
    'Reject products with unclear images, unreliable supplier pages, or weak delivery expectations.',
    'Prefer products with stable source pricing and enough sold history to support a listing.',
  ];
  readonly trainingRules = [
    'Read and acknowledge the rules before submitting training products.',
    'Use the stricter training validation thresholds until the hunter is activated.',
    'Treat mentor feedback as the source of truth during the training period.',
    'Activation requires consistent approval rate, listed products, and generated orders.',
  ];
  readonly goodProductExamples = [
    {
      title: 'Stable replacement part',
      text: 'Exact ASIN match, clear fitment, strong sold history, enough Amazon stock, and positive profit after fees.',
    },
    {
      title: 'Repeatable home accessory',
      text: 'Consistent buy price, clean supplier page, clear eBay demand, and no duplicate already in the system.',
    },
    {
      title: 'Accessory with broad demand',
      text: 'Healthy rating, recent sales, available stock, reasonable delivery time, and a clean listing path.',
    },
  ];
  readonly rejectedProductExamples = [
    {
      title: 'Variant mismatch',
      text: 'Amazon source is a different size, color, bundle, fitment, or model than the eBay market result.',
    },
    {
      title: 'Weak demand',
      text: 'Low sold count, stale eBay sales, or demand based only on active listings rather than completed sales.',
    },
    {
      title: 'Unsafe supplier signal',
      text: 'Stock is low, price recently jumped, delivery is too slow, or supplier page looks unreliable.',
    },
  ];
  readonly commonMistakes = [
    'Submitting before duplicate check finishes.',
    'Copying a competitor title without confirming the exact Amazon variant.',
    'Ignoring recent Amazon price spikes or low offer count.',
    'Using screenshots or notes instead of real product URLs.',
    'Leaving too little profit buffer for fees, refunds, and stock movement.',
  ];

  readonly pageTitle = computed(() =>
    this.isTrainingHunter() ? 'Training Hunter Rules' : 'Hunting Rules',
  );
  readonly pageDescription = computed(() =>
    this.isTrainingHunter()
      ? 'Read these rules carefully, acknowledge them once, and then start your training submissions.'
      : 'Everything a hunter should check before sending a product into the listing workflow.',
  );
  readonly ruleRows = computed(() => {
    const criteria = this.criteria();

    if (!criteria) {
      return [];
    }

    return [
      ['Minimum ROI', `${(this.isTrainingHunter() ? criteria.trainingMinRoi : criteria.minRoi) ?? criteria.minRoi}%`],
      [
        'Minimum profit',
        `${((this.isTrainingHunter() ? criteria.trainingMinProfit : criteria.minProfit) ?? criteria.minProfit).toFixed(2)}`,
      ],
      [
        'Minimum Amazon stock',
        `${(this.isTrainingHunter() ? criteria.trainingMinStockCount : criteria.minStockCount) ?? criteria.minStockCount}`,
      ],
      ['Minimum alternate stock', `${criteria.minAlternateStockCount}`],
      [
        'Minimum sold count',
        `${(this.isTrainingHunter() ? criteria.trainingMinSoldCount : criteria.minSoldCount) ?? criteria.minSoldCount}`,
      ],
      [
        'Minimum rating',
        `${(this.isTrainingHunter() ? criteria.trainingMinRating : criteria.minRating) ?? criteria.minRating}`,
      ],
      [
        'Minimum watchers',
        `${(this.isTrainingHunter() ? criteria.trainingMinWatcherCount : criteria.minWatcherCount) ?? criteria.minWatcherCount}`,
      ],
      [
        'Minimum 2-month sales',
        `${(this.isTrainingHunter() ? criteria.trainingMinSalesLastTwoMonths : criteria.minSalesLastTwoMonths) ?? criteria.minSalesLastTwoMonths}`,
      ],
      ['Maximum delivery days', `${criteria.maxDeliveryDays}`],
      [
        'Require ASIN',
        (this.isTrainingHunter() ? criteria.trainingAsinRequired : criteria.asinRequired) ? 'Yes' : 'No',
      ],
      [
        'Require custom label',
        (this.isTrainingHunter()
          ? criteria.trainingCustomLabelRequired
          : criteria.customLabelRequired)
          ? 'Yes'
          : 'No',
      ],
      [
        'Require category',
        (this.isTrainingHunter() ? criteria.trainingCategoryRequired : criteria.categoryRequired)
          ? 'Yes'
          : 'No',
      ],
      [
        'Require alternate Amazon link',
        (this.isTrainingHunter()
          ? criteria.trainingAmazonAltUrlRequired
          : criteria.amazonAltUrlRequired)
          ? 'Yes'
          : 'No',
      ],
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

    const minRoi = (this.isTrainingHunter() ? criteria.trainingMinRoi : criteria.minRoi) ?? criteria.minRoi;
    const minProfit =
      (this.isTrainingHunter() ? criteria.trainingMinProfit : criteria.minProfit) ??
      criteria.minProfit;
    const minSales =
      (this.isTrainingHunter()
        ? criteria.trainingMinSalesLastTwoMonths
        : criteria.minSalesLastTwoMonths) ?? criteria.minSalesLastTwoMonths;
    const minStock =
      (this.isTrainingHunter() ? criteria.trainingMinStockCount : criteria.minStockCount) ??
      criteria.minStockCount;
    const minRating =
      (this.isTrainingHunter() ? criteria.trainingMinRating : criteria.minRating) ??
      criteria.minRating;
    const excellentRoi = Math.max(minRoi + 15, minRoi * 1.35, 35);
    const excellentProfit = Math.max(minProfit + 5, minProfit * 1.5, 5);
    const excellentSales = Math.max(
      minSales + 12,
      minSales * 1.4,
      12,
    );
    const excellentStock = Math.max(minStock + 4, minStock * 1.3, 12);
    const excellentRating = Math.max(minRating + 0.5, 4.2);

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
  private readonly auth = inject(AuthService);
  private readonly hunterApi = inject(HunterApiService);
  private readonly toast = inject(ToastService);

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

  acknowledgeRules(): void {
    if (!this.isTrainingHunter() || this.hasAcknowledgedRules() || this.acknowledging()) {
      return;
    }

    this.acknowledging.set(true);
    this.hunterApi
      .acknowledgeTrainingRules()
      .pipe(take(1))
      .subscribe({
        next: (user) => {
          this.auth.updateCurrentUser(user);
          this.toast.success('Training rules acknowledged. Product submission is now unlocked.');
          this.acknowledging.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not acknowledge the training rules.');
          this.acknowledging.set(false);
        },
      });
  }
}
