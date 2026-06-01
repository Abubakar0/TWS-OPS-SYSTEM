import { computed, DestroyRef, effect, inject, Injectable, Injector, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, forkJoin, debounceTime, distinctUntilChanged, merge } from 'rxjs';
import { FormControl } from '@angular/forms';
import { Router } from '@angular/router';

import { OrderApiService } from '../api/order-api.service';
import { AuthService } from '../auth/auth.service';
import { User } from '../models/auth.models';
import {
  Order,
  OrderFilters,
  OrderImpact,
  OrderIssueType,
  OrderIssueStatus,
  OrderProductMatch,
  OrderStats,
  OrderStatus,
  PaymentStatus,
  PlacementStatus,
  OrderUpsertPayload,
} from '../models/order.models';
import { Account, ProductCategory } from '../models/product.models';
import { ExportService } from '../services/export.service';
import { ReferenceDataService } from '../state/reference-data.service';
import { WorkspaceSyncService } from '../state/workspace-sync.service';
import { ConfirmService } from '../ui/confirm.service';
import { ToastService } from '../ui/toast.service';
import { ValidationMessageService } from '../ui/validation-message.service';
import { createOrderFilterForm, createOrderForm } from '../../shared/forms/order.form';
import { decimalValue } from '../../shared/validators/price.validator';

export type OrderWorkspaceMode = 'admin' | 'hunter' | 'lister' | 'processor';
export type ProcessorWorkspaceView = 'orders' | 'new' | 'issues' | 'detail';

interface OrderModalState {
  open: boolean;
  mode: 'create' | 'edit';
}

type DuplicateState = 'idle' | 'checking' | 'duplicate' | 'allowed';

const ORDER_FILTERS_STORAGE_PREFIX = 'tws_orders_filters_collapsed';

const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  'NEW',
  'READY_TO_PLACE',
  'PLACED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
  'ISSUE',
  'ON_HOLD',
];

const PLACEMENT_STATUS_OPTIONS: PlacementStatus[] = ['NOT_PLACED', 'PLACED', 'FAILED', 'CANCELLED'];
const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = [
  'PAID',
  'PENDING',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
];
const ISSUE_TYPE_OPTIONS: OrderIssueType[] = [
  'PRODUCT_NOT_AVAILABLE',
  'PRICE_INCREASED',
  'ORDER_IN_LOSS',
  'LOW_STOCK',
  'WRONG_PRODUCT_LINK',
  'AMAZON_LINK_NOT_WORKING',
  'SUPPLIER_CANCELLED',
  'BUYER_ADDRESS_ISSUE',
  'TRACKING_ISSUE',
  'OTHER',
];
const ORDER_IMPACT_OPTIONS: OrderImpact[] = [
  'Product unavailable',
  'Product in loss',
  'Price changed',
  'Stock not enough',
  'Wrong listing/product',
  'Other',
];

const containsText = (value: string | null | undefined, term: string) =>
  String(value || '')
    .toLowerCase()
    .includes(term);

const toDisplayDate = (value: string | null | undefined) => {
  if (!value) {
    return '';
  }

  return String(value).slice(0, 10);
};

const numericOrZero = (value: number | null | undefined) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const formatStatusLabel = (value: string | null | undefined) =>
  String(value || '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getOrderStatusTone = (status: OrderStatus) => {
  switch (status) {
    case 'NEW':
      return 'status-badge--order-new';
    case 'READY_TO_PLACE':
      return 'status-badge--order-ready';
    case 'PLACED':
      return 'status-badge--order-placed';
    case 'SHIPPED':
      return 'status-badge--order-shipped';
    case 'DELIVERED':
      return 'status-badge--order-delivered';
    case 'ISSUE':
      return 'status-badge--order-issue';
    case 'CANCELLED':
    case 'REFUNDED':
      return 'status-badge--order-muted';
    case 'ON_HOLD':
    default:
      return 'status-badge--order-hold';
  }
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { error?: { message?: unknown } }).error?.message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
  }

  return fallback;
};

const getPlacementTone = (status: PlacementStatus) => {
  switch (status) {
    case 'PLACED':
      return 'status-badge--order-placed';
    case 'FAILED':
      return 'status-badge--order-issue';
    case 'CANCELLED':
      return 'status-badge--order-muted';
    case 'NOT_PLACED':
    default:
      return 'status-badge--order-ready';
  }
};

const getQualityLabel = (profit: number | null | undefined, roi: number | null | undefined) => {
  const safeProfit = numericOrZero(profit);
  const safeRoi = numericOrZero(roi);

  if (safeProfit >= 15 && safeRoi >= 40) {
    return 'Best Hunt';
  }

  if (safeProfit >= 8 && safeRoi >= 25) {
    return 'Good Hunt';
  }

  if (safeProfit <= 0) {
    return 'Rejected';
  }

  return 'Avg Hunt';
};

const getQualityTone = (label: string) => {
  switch (label) {
    case 'Best Hunt':
      return 'status-badge--success';
    case 'Good Hunt':
      return 'status-badge--listed';
    case 'Rejected':
      return 'status-badge--danger';
    case 'Avg Hunt':
    default:
      return 'status-badge--warning';
  }
};

const isClosedOrderStatus = (status: OrderStatus | null | undefined) =>
  status === 'CANCELLED' || status === 'REFUNDED';

const hasOpenOrderIssue = (order: Order | null | undefined) =>
  Boolean(
    order &&
    order.orderStatus === 'ISSUE' &&
    (!order.issueStatus || order.issueStatus === 'OPEN' || order.issueStatus === 'IN_REVIEW'),
  );

const isPlacedOrder = (order: Order | null | undefined) =>
  Boolean(
    order &&
    (order.placementStatus === 'PLACED' ||
      order.orderStatus === 'PLACED' ||
      order.orderStatus === 'SHIPPED' ||
      order.orderStatus === 'DELIVERED' ||
      Boolean(order.placedDate)),
  );

@Injectable()
export class OrderManagementFacade {
  private readonly auth = inject(AuthService);
  readonly pageSizeOptions = [30, 50, 100];
  readonly mode = signal<OrderWorkspaceMode>('admin');
  readonly processorView = signal<ProcessorWorkspaceView>('orders');
  readonly focusOrderId = signal('');
  readonly loading = signal(false);
  readonly statsLoading = signal(false);
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly orderFormVersion = signal(0);
  readonly matchLoading = signal(false);
  readonly error = signal('');
  readonly orders = signal<Order[]>([]);
  readonly total = signal(0);
  readonly stats = signal<OrderStats | null>(null);
  readonly selectedOrderId = signal('');
  readonly pageIndex = signal(0);
  readonly pageSize = signal(this.pageSizeOptions[0]);
  readonly filtersCollapsed = signal(false);
  readonly modalState = signal<OrderModalState>({ open: false, mode: 'create' });
  readonly editingOrderId = signal<string | null>(null);
  readonly deleteModalOpen = signal(false);
  readonly deletePermanent = signal(false);
  readonly duplicateState = signal<DuplicateState>('idle');
  readonly duplicateMessage = signal('');
  readonly matchResults = signal<OrderProductMatch[]>([]);
  readonly availableHunters = signal<User[]>([]);
  readonly availableListers = signal<User[]>([]);
  readonly availableAccounts = signal<Account[]>([]);
  readonly availableCategories = signal<ProductCategory[]>([]);
  readonly selectedMatchId = signal('');
  readonly ignoreNextOrdersSync = signal(false);
  readonly suppressProcessorNewAutoOpen = signal(false);

  readonly filters = createOrderFilterForm();
  readonly orderForm = createOrderForm();
  readonly deleteReasonControl = new FormControl('', { nonNullable: true });

  readonly currentUser = this.auth.currentUser;
  readonly currentRole = computed(() => this.currentUser()?.role || 'hunter');
  readonly isProcessorOnlyRole = computed(() => this.currentRole() === 'order_processor');
  readonly isAdminWorkspace = computed(() => this.mode() === 'admin');
  readonly isHunterWorkspace = computed(() => this.mode() === 'hunter');
  readonly isListerWorkspace = computed(() => this.mode() === 'lister');
  readonly isProcessingWorkspace = computed(() => this.mode() === 'processor');
  readonly canWrite = computed(
    () =>
      this.currentRole() === 'admin' ||
      this.currentRole() === 'super_admin' ||
      Boolean(this.currentUser()?.permissions?.canProcessOrders),
  );
  readonly canExport = computed(
    () =>
      this.currentRole() === 'admin' ||
      this.currentRole() === 'super_admin' ||
      Boolean(this.currentUser()?.permissions?.canExportReports),
  );
  readonly canDelete = computed(
    () => this.currentRole() === 'admin' || this.currentRole() === 'super_admin',
  );
  readonly canRestore = computed(() => this.currentRole() === 'super_admin');
  readonly showDeletedFilter = computed(
    () => this.currentRole() === 'admin' || this.currentRole() === 'super_admin',
  );
  readonly showHunterFilter = computed(
    () =>
      this.currentRole() === 'admin' ||
      this.currentRole() === 'super_admin' ||
      Boolean(this.currentUser()?.permissions?.canViewAllOrders),
  );
  readonly showListerFilter = computed(
    () =>
      this.currentRole() === 'admin' ||
      this.currentRole() === 'super_admin' ||
      Boolean(this.currentUser()?.permissions?.canViewAllOrders),
  );
  readonly selectedOrder = computed(
    () => this.orders().find((order) => order.id === this.selectedOrderId()) || null,
  );
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly pageLabel = computed(() => {
    if (!this.total()) {
      return 'No orders to show';
    }

    const start = this.pageIndex() * this.pageSize() + 1;
    const end = Math.min(this.total(), start + this.orders().length - 1);
    return `Showing ${start}-${end} of ${this.total()}`;
  });
  readonly orderStatusOptions = ORDER_STATUS_OPTIONS;
  readonly placementStatusOptions = PLACEMENT_STATUS_OPTIONS;
  readonly paymentStatusOptions = PAYMENT_STATUS_OPTIONS;
  readonly issueTypeOptions = ISSUE_TYPE_OPTIONS;
  readonly orderImpactOptions = ORDER_IMPACT_OPTIONS;
  readonly modalTitle = computed(() =>
    this.modalState().mode === 'create' ? 'Add Order' : 'Edit Order',
  );
  readonly usesMinimalOrderEntry = computed(() => this.modalState().mode === 'create');
  readonly processorRouteLabel = computed(() => {
    if (this.processorView() === 'new') {
      return 'Add Order';
    }

    if (this.processorView() === 'issues') {
      return 'Order Issues';
    }

    if (this.processorView() === 'detail') {
      return 'Order Details';
    }

    return 'Orders';
  });
  readonly orderRows = computed(() =>
    this.orders().map((order) => {
      const qualityLabel = getQualityLabel(order.profit, order.roi);

      return {
        ...order,
        title: order.productTitle || order.asin || order.ebayOrderId,
        statusLabel: formatStatusLabel(order.orderStatus),
        placementLabel: formatStatusLabel(order.placementStatus),
        statusTone: getOrderStatusTone(order.orderStatus),
        placementTone: getPlacementTone(order.placementStatus),
        qualityLabel,
        qualityTone: getQualityTone(qualityLabel),
        matchedLabel: order.matchStatus === 'matched' ? 'Matched' : 'Unmatched',
        dateLabel: toDisplayDate(order.orderDate),
      };
    }),
  );
  readonly selectedOrderVm = computed(() => {
    const order = this.selectedOrder();

    if (!order) {
      return null;
    }

    const qualityLabel = getQualityLabel(order.profit, order.roi);

    return {
      ...order,
      title: order.productTitle || order.asin || order.ebayOrderId,
      statusLabel: formatStatusLabel(order.orderStatus),
      placementLabel: formatStatusLabel(order.placementStatus),
      paymentLabel: formatStatusLabel(order.paymentStatus),
      statusTone: getOrderStatusTone(order.orderStatus),
      placementTone: getPlacementTone(order.placementStatus),
      placementReady: Boolean(
        (order.amazonOrderId || order.amazonOrderLink) &&
        numericOrZero(order.amazonBuyingPrice) > 0,
      ),
      shippingReady: Boolean(order.trackingNumber && order.carrier),
      qualityLabel,
      qualityTone: getQualityTone(qualityLabel),
      timeline: [
        { label: 'Order Received', value: order.orderDate },
        { label: 'Payment', value: order.paymentDate },
        { label: 'Placed', value: order.placedDate },
        { label: 'Expected Ship', value: order.expectedShipDate },
        { label: 'Delivered', value: order.deliveredDate },
      ],
    };
  });
  readonly productivityBar = computed(() => {
    const stats = this.stats();
    const selectedHunterId = this.filters.controls.hunterId.value;
    const selectedHunter =
      this.availableHunters().find((hunter) => hunter.id === selectedHunterId)?.name ||
      'All Hunters';
    const listed = stats?.placedOrders || 0;
    const pending = stats?.pendingPlacement || 0;
    const rejected = stats?.issueOrders || 0;
    const denominator = Math.max(listed + pending, 1);

    return {
      hunterName: selectedHunter,
      listed,
      pending,
      rejected,
      progressLabel: `${listed} / ${listed + pending}`,
      completionPercent: Math.round((listed / denominator) * 100),
      newOrders: stats?.ordersToday || 0,
      readyToPlace: stats?.pendingPlacement || 0,
      placedToday: stats?.placedToday || 0,
      issues: stats?.issueOrders || 0,
    };
  });
  readonly financialPreview = computed(() => {
    this.orderFormVersion();
    const salePrice = decimalValue(this.orderForm.controls.salePrice.value) ?? 0;
    const ebayFee = decimalValue(this.orderForm.controls.ebayFee.value) ?? 0;
    const amazonBuyingPrice = decimalValue(this.orderForm.controls.amazonBuyingPrice.value) ?? 0;
    const supplierShippingCost =
      decimalValue(this.orderForm.controls.supplierShippingCost.value) ?? 0;
    const otherCost = decimalValue(this.orderForm.controls.otherCost.value) ?? 0;
    const totalCost = amazonBuyingPrice + supplierShippingCost + otherCost;
    const profit = salePrice - ebayFee - totalCost;
    const roi = amazonBuyingPrice > 0 ? (profit / amazonBuyingPrice) * 100 : 0;

    return {
      salePrice,
      ebayFee,
      totalCost,
      profit,
      roi,
    };
  });
  readonly canSubmitOrder = computed(() => {
    this.orderFormVersion();
    if (
      !this.canWrite() ||
      !this.modalState().open ||
      this.duplicateState() === 'duplicate' ||
      this.saving()
    ) {
      return false;
    }

    if (this.modalState().mode === 'create') {
      return this.isCreateOrderReady();
    }

    return (
      this.orderForm.valid &&
      !this.saving()
    );
  });
  readonly orderFormErrors = computed(() => {
    this.orderFormVersion();

    return {
    ebayOrderId: this.messages.orderFieldError(
      this.orderForm.controls.ebayOrderId,
      'ebayOrderId',
      this.orderForm.controls.ebayOrderId.touched || this.orderForm.controls.ebayOrderId.dirty,
    ),
    ebayListingUrl: this.messages.orderFieldError(
      this.orderForm.controls.ebayListingUrl,
      'ebayListingUrl',
      this.orderForm.controls.ebayListingUrl.touched ||
        this.orderForm.controls.ebayListingUrl.dirty,
    ),
    orderDate: this.messages.orderFieldError(
      this.orderForm.controls.orderDate,
      'orderDate',
      this.orderForm.controls.orderDate.touched || this.orderForm.controls.orderDate.dirty,
    ),
    quantity: this.messages.orderFieldError(
      this.orderForm.controls.quantity,
      'quantity',
      this.orderForm.controls.quantity.touched || this.orderForm.controls.quantity.dirty,
    ),
    salePrice: this.messages.orderFieldError(
      this.orderForm.controls.salePrice,
      'salePrice',
      this.orderForm.controls.salePrice.touched || this.orderForm.controls.salePrice.dirty,
    ),
    accountId: this.messages.orderFieldError(
      this.orderForm.controls.accountId,
      'accountId',
      this.orderForm.controls.accountId.touched || this.orderForm.controls.accountId.dirty,
    ),
    asin: this.messages.orderFieldError(
      this.orderForm.controls.asin,
      'asin',
      this.orderForm.controls.asin.touched || this.orderForm.controls.asin.dirty,
    ),
    amazonOrderId: this.messages.orderFieldError(
      this.orderForm.controls.amazonOrderId,
      'amazonOrderId',
      this.orderForm.controls.amazonOrderId.touched ||
        this.orderForm.controls.amazonOrderId.dirty,
    ),
    amazonOrderLink: this.messages.orderFieldError(
      this.orderForm.controls.amazonOrderLink,
      'amazonOrderLink',
      this.orderForm.controls.amazonOrderLink.touched ||
        this.orderForm.controls.amazonOrderLink.dirty,
    ),
    amazonBuyingPrice: this.messages.orderFieldError(
      this.orderForm.controls.amazonBuyingPrice,
      'amazonBuyingPrice',
      this.orderForm.controls.amazonBuyingPrice.touched ||
        this.orderForm.controls.amazonBuyingPrice.dirty,
    ),
    };
  });
  readonly matchingSummary = computed(() => {
    this.orderFormVersion();
    const productId = this.orderForm.controls.productId.value.trim();
    const selectedMatch = this.matchResults().find((match) => match.id === this.selectedMatchId());

    if (selectedMatch) {
      return `Matched ${selectedMatch.title || selectedMatch.asin || 'product'} to the order.`;
    }

    if (productId) {
      return 'Matched product attached.';
    }

    if (this.matchLoading()) {
      return 'Checking products and listings for a match.';
    }

    if (this.matchResults().length) {
      return `${this.matchResults().length} matching product option${this.matchResults().length === 1 ? '' : 's'} found.`;
    }

    return 'Use ASIN, custom label, listing URL, or title to match the order to a product.';
  });
  readonly modalSummaryVm = computed(() => {
    this.orderFormVersion();
    const selectedMatch = this.matchResults().find((match) => match.id === this.selectedMatchId());
    const profit = this.financialPreview().profit;
    const roi = this.financialPreview().roi;

    return {
      salePrice: this.financialPreview().salePrice,
      buyingPrice: decimalValue(this.orderForm.controls.amazonBuyingPrice.value) ?? 0,
      profit,
      roi,
      statusLabel: formatStatusLabel(this.orderForm.controls.orderStatus.value),
      matchedHunter:
        selectedMatch?.hunterName ||
        this.availableHunters().find(
          (hunter) => hunter.id === this.orderForm.controls.hunterId.value,
        )?.name ||
        'Unmatched order',
      matchedProduct:
        selectedMatch?.title ||
        this.orderForm.controls.productTitle.value.trim() ||
        this.orderForm.controls.asin.value.trim() ||
        'Awaiting product match',
      qualityLabel: getQualityLabel(profit, roi),
      matchStatus:
        selectedMatch || this.orderForm.controls.productId.value.trim() ? 'Matched' : 'Unmatched',
    };
  });
  readonly processingActionsVm = computed(() => {
    this.orderFormVersion();
    const order = this.selectedOrder();
    const issueType = this.orderForm.controls.issueType.value;
    const orderImpact = this.orderForm.controls.orderImpact.value;
    const amazonBuyingPrice = decimalValue(this.orderForm.controls.amazonBuyingPrice.value) ?? 0;
    const amazonOrderId = this.orderForm.controls.amazonOrderId.value.trim();
    const trackingNumber = this.orderForm.controls.trackingNumber.value.trim();
    const carrier = this.orderForm.controls.carrier.value.trim();
    const issueReason = this.orderForm.controls.issueReason.value.trim();
    const deleted = Boolean(order?.deletedAt);
    const closedStatus = isClosedOrderStatus(order?.orderStatus);
    const alreadyPlaced = Boolean(order?.placementStatus === 'PLACED');
    const alreadyShipped = Boolean(order?.orderStatus === 'SHIPPED');
    const alreadyDelivered = Boolean(order?.orderStatus === 'DELIVERED');

    return {
      canMarkPlaced:
        this.canWrite() &&
        Boolean(order) &&
        !deleted &&
        !closedStatus &&
        order?.orderStatus !== 'ISSUE' &&
        !hasOpenOrderIssue(order) &&
        !alreadyPlaced &&
        !alreadyShipped &&
        !alreadyDelivered &&
        amazonBuyingPrice > 0 &&
        Boolean(amazonOrderId) &&
        !this.saving(),
      canMarkShipped:
        this.canWrite() &&
        Boolean(order) &&
        !deleted &&
        !closedStatus &&
        order?.orderStatus !== 'ISSUE' &&
        !alreadyShipped &&
        !alreadyDelivered &&
        isPlacedOrder(order) &&
        Boolean(trackingNumber && carrier) &&
        !this.saving(),
      canMarkDelivered:
        this.canWrite() &&
        Boolean(order) &&
        !deleted &&
        !closedStatus &&
        order?.orderStatus === 'SHIPPED' &&
        !this.saving(),
      canMarkIssue:
        this.canWrite() &&
        Boolean(order) &&
        !deleted &&
        !closedStatus &&
        !hasOpenOrderIssue(order) &&
        Boolean(issueType) &&
        Boolean(orderImpact) &&
        Boolean(issueReason) &&
        !this.saving(),
    };
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private referenceDataSubscribed = false;

  constructor(
    private readonly orderApi: OrderApiService,
    private readonly exportService: ExportService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly messages: ValidationMessageService,
  ) {
    this.initialize();
  }

  configure(
    mode: OrderWorkspaceMode,
    options: { processorView?: ProcessorWorkspaceView; focusOrderId?: string } = {},
  ): void {
    this.mode.set(mode);
    this.processorView.set(options.processorView || 'orders');
    this.focusOrderId.set(options.focusOrderId || '');
    this.filtersCollapsed.set(this.readFiltersCollapsed(mode));

    if (mode === 'processor') {
      const processorView = options.processorView || 'orders';
      this.filters.patchValue(
        {
          placementStatus: processorView === 'issues' ? '' : 'NOT_PLACED',
          status: processorView === 'issues' ? 'ISSUE' : '',
        },
        { emitEvent: false },
      );

      if (processorView !== 'new') {
        this.suppressProcessorNewAutoOpen.set(false);
      }
    }

    this.loadReferenceData();
    this.refresh();

    if (
      mode === 'processor' &&
      options.processorView === 'new' &&
      !this.modalState().open &&
      !this.suppressProcessorNewAutoOpen()
    ) {
      this.openCreateModal();
    }
  }

  refresh(): void {
    this.loadOrdersAndStats();
  }

  loadOrdersAndStats(): void {
    this.loading.set(true);
    this.statsLoading.set(true);
    this.error.set('');
    const filters = this.buildFilters();

    forkJoin({
      orders: this.orderApi.listOrders(filters),
      stats: this.orderApi.getStats(this.buildStatsFilters()),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ orders, stats }) => {
          this.orders.set(orders.items);
          this.total.set(orders.total);
          this.stats.set(stats);
          this.syncSelectedOrder(orders.items);
          this.ensureFocusedOrderLoaded();
          this.loading.set(false);
          this.statsLoading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load orders.');
          this.loading.set(false);
          this.statsLoading.set(false);
        },
      });
  }

  selectOrder(id: string): void {
    this.selectedOrderId.set(id);
    const order = this.orders().find((entry) => entry.id === id);

    if (order && !this.modalState().open) {
      this.patchFormFromOrder(order);
    }
  }

  toggleFiltersCollapsed(): void {
    const next = !this.filtersCollapsed();
    this.filtersCollapsed.set(next);
    localStorage.setItem(this.filtersStorageKey(this.mode()), JSON.stringify(next));
  }

  applyFilters(): void {
    this.pageIndex.set(0);
    this.refresh();
  }

  resetFilters(): void {
    this.filters.reset(
      {
        search: '',
        category: '',
        hunterId: '',
        listerId: '',
        accountId: '',
        status: this.mode() === 'processor' && this.processorView() === 'issues' ? 'ISSUE' : '',
        placementStatus:
          this.mode() === 'processor' && this.processorView() !== 'issues' ? 'NOT_PLACED' : '',
        dateFrom: '',
        dateTo: '',
        asin: '',
        ebayOrderId: '',
        amazonOrderId: '',
        unmatched: false,
        deletedState: 'active',
      },
      { emitEvent: false },
    );
    this.pageIndex.set(0);
    this.refresh();
  }

  previousPage(): void {
    this.pageIndex.update((value) => Math.max(0, value - 1));
    this.refresh();
  }

  nextPage(): void {
    this.pageIndex.update((value) => Math.min(this.pageCount() - 1, value + 1));
    this.refresh();
  }

  setPageSize(value: string | number): void {
    this.pageSize.set(Number(value));
    this.pageIndex.set(0);
    this.refresh();
  }

  openCreateModal(): void {
    this.suppressProcessorNewAutoOpen.set(false);
    this.editingOrderId.set(null);
    this.modalState.set({ open: true, mode: 'create' });
    this.duplicateState.set('idle');
    this.duplicateMessage.set('');
    this.matchResults.set([]);
    this.selectedMatchId.set('');
    this.orderForm.reset(
      {
        ebayOrderId: '',
        ebayItemId: '',
        ebayListingUrl: '',
        orderDate: toDisplayDate(new Date().toISOString()),
        quantity: 1,
        salePrice: '',
        buyerCountry: '',
        buyerName: '',
        buyerState: '',
        buyerCity: '',
        productId: '',
        hunterId: '',
        listerId: '',
        accountId: '',
        asin: '',
        productTitle: '',
        customLabel: '',
        amazonOrderId: '',
        amazonOrderLink: '',
        amazonBuyingPrice: '',
        supplierShippingCost: '',
        otherCost: '',
        ebayFee: '',
        shippingCharged: '',
        taxCollected: '',
        paymentDate: '',
        expectedShipDate: '',
        placedDate: '',
        deliveredDate: '',
        trackingNumber: '',
        carrier: '',
        supplierOrderStatus: 'NOT_PLACED',
        orderStatus: 'NEW',
        placementStatus: 'NOT_PLACED',
        paymentStatus: 'PENDING',
        issueType: 'OTHER',
        issueStatus: '',
        orderImpact: '',
        notes: '',
        issueReason: '',
      },
      { emitEvent: false },
    );
  }

  openEditModal(order: Order): void {
    this.suppressProcessorNewAutoOpen.set(false);
    this.editingOrderId.set(order.id);
    this.modalState.set({ open: true, mode: 'edit' });
    this.duplicateState.set('idle');
    this.duplicateMessage.set('');
    this.selectedMatchId.set(order.productId || '');
    this.orderForm.reset(
      {
        ebayOrderId: order.ebayOrderId,
        ebayItemId: order.ebayItemId || '',
        ebayListingUrl: order.ebayListingUrl || '',
        orderDate: toDisplayDate(order.orderDate),
        quantity: order.quantity,
        salePrice: String(order.salePrice ?? ''),
        buyerCountry: order.buyerCountry || '',
        buyerName: order.buyerName || '',
        buyerState: order.buyerState || '',
        buyerCity: order.buyerCity || '',
        productId: order.productId || '',
        hunterId: order.hunterId || '',
        listerId: order.listerId || '',
        accountId: order.accountId || '',
        asin: order.asin || '',
        productTitle: order.productTitle || '',
        customLabel: order.customLabel || '',
        amazonOrderId: order.amazonOrderId || '',
        amazonOrderLink: order.amazonOrderLink || '',
        amazonBuyingPrice: order.amazonBuyingPrice === null ? '' : String(order.amazonBuyingPrice),
        supplierShippingCost:
          order.supplierShippingCost === null ? '' : String(order.supplierShippingCost),
        otherCost: order.otherCost === null ? '' : String(order.otherCost),
        ebayFee: order.ebayFee === null ? '' : String(order.ebayFee),
        shippingCharged: order.shippingCharged === null ? '' : String(order.shippingCharged),
        taxCollected: order.taxCollected === null ? '' : String(order.taxCollected),
        paymentDate: toDisplayDate(order.paymentDate),
        expectedShipDate: toDisplayDate(order.expectedShipDate),
        placedDate: toDisplayDate(order.placedDate),
        deliveredDate: toDisplayDate(order.deliveredDate),
        trackingNumber: order.trackingNumber || '',
        carrier: order.carrier || '',
        supplierOrderStatus: order.supplierOrderStatus || order.placementStatus,
        orderStatus: order.orderStatus,
        placementStatus: order.placementStatus,
        paymentStatus: order.paymentStatus,
        issueType: order.issueType || 'OTHER',
        issueStatus: order.issueStatus || '',
        orderImpact: order.orderImpact || '',
        notes: order.notes || '',
        issueReason: order.issueReason || '',
      },
      { emitEvent: false },
    );
  }

  closeOrderModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    const shouldExitProcessorNew =
      this.mode() === 'processor' && this.processorView() === 'new';

    if (shouldExitProcessorNew) {
      this.suppressProcessorNewAutoOpen.set(true);
    }

    this.modalState.set({ ...this.modalState(), open: false });
    this.editingOrderId.set(null);
    this.matchResults.set([]);
    this.selectedMatchId.set('');

    if (shouldExitProcessorNew) {
      void this.router.navigateByUrl('/order-processor/orders');
    }
  }

  async submitOrder(): Promise<void> {
    if (!this.canSubmitOrder()) {
      this.orderForm.controls.amazonOrderId.markAsTouched();
      this.orderForm.markAllAsTouched();
      this.bumpOrderFormVersion();
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const payload = this.buildOrderPayload();

    try {
      const saved =
        this.modalState().mode === 'create'
          ? await firstValueFrom(this.orderApi.createOrder(payload))
          : await firstValueFrom(this.orderApi.updateOrder(this.editingOrderId() || '', payload));

      this.upsertLocalOrder(saved, this.modalState().mode === 'create');
      this.closeOrderModal(true);
      this.refreshStatsOnly();
      this.ignoreNextOrdersSync.set(true);
      this.workspaceSync.notifyOrdersChanged();
      this.toast.success(this.modalState().mode === 'create' ? 'Order created.' : 'Order updated.');
    } catch (error: unknown) {
      const status = error && typeof error === 'object' ? (error as { status?: number }).status : undefined;
      if (status === 409) {
        this.duplicateState.set('duplicate');
        this.duplicateMessage.set('This eBay order already exists.');
      } else {
        this.error.set(getErrorMessage(error, 'Could not save the order.'));
      }
    } finally {
      this.saving.set(false);
    }
  }

  async openDeleteModal(order: Order, permanent = false): Promise<void> {
    if (!this.canDelete()) {
      return;
    }

    this.selectedOrderId.set(order.id);
    this.deletePermanent.set(permanent);
    this.deleteReasonControl.setValue('', { emitEvent: false });
    this.deleteModalOpen.set(true);
  }

  closeDeleteModal(force = false): void {
    if (this.saving() && !force) {
      return;
    }

    this.deleteModalOpen.set(false);
    this.deleteReasonControl.setValue('', { emitEvent: false });
  }

  async confirmDelete(): Promise<void> {
    const order = this.selectedOrder();

    if (!order) {
      return;
    }

    const confirmed = await this.confirm.ask({
      title: this.deletePermanent() ? 'Permanently delete order?' : 'Delete order?',
      message: this.deletePermanent()
        ? 'This action cannot be undone.'
        : 'The order will be removed from active views and can only be restored by Super Admin.',
      confirmText: this.deletePermanent() ? 'Delete forever' : 'Delete',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      await firstValueFrom(
        this.orderApi.deleteOrder(order.id, {
          permanent: this.deletePermanent(),
          reason: this.deleteReasonControl.value.trim() || undefined,
        }),
      );

      this.orders.update((orders) => orders.filter((entry) => entry.id !== order.id));
      this.total.update((value) => Math.max(0, value - 1));
      this.syncSelectedOrder(this.orders());
      this.refreshStatsOnly();
      this.ignoreNextOrdersSync.set(true);
      this.workspaceSync.notifyOrdersChanged();
      this.toast.success(this.deletePermanent() ? 'Order deleted forever.' : 'Order deleted.');
      this.closeDeleteModal(true);
    } catch (error: unknown) {
      this.error.set(getErrorMessage(error, 'Could not delete the order.'));
    } finally {
      this.saving.set(false);
    }
  }

  restoreSelectedOrder(): void {
    const order = this.selectedOrder();

    if (!order || !this.canRestore()) {
      return;
    }

    this.saving.set(true);
    firstValueFrom(this.orderApi.restoreOrder(order.id))
      .then((restored) => {
        this.upsertLocalOrder(restored, false);
        this.refreshStatsOnly();
        this.workspaceSync.notifyOrdersChanged();
        this.toast.success('Order restored.');
      })
      .catch((error: unknown) => {
        this.error.set(getErrorMessage(error, 'Could not restore the order.'));
      })
      .finally(() => this.saving.set(false));
  }

  async findProductMatches(): Promise<void> {
    const query = {
      productId: this.orderForm.controls.productId.value || undefined,
      customLabel: this.orderForm.controls.customLabel.value || undefined,
      asin: this.orderForm.controls.asin.value || undefined,
      ebayListingUrl: this.orderForm.controls.ebayListingUrl.value || undefined,
      ebayItemId: this.orderForm.controls.ebayItemId.value || undefined,
      title: this.orderForm.controls.productTitle.value || undefined,
      search:
        this.orderForm.controls.asin.value ||
        this.orderForm.controls.customLabel.value ||
        this.orderForm.controls.productTitle.value ||
        undefined,
    };

    this.matchLoading.set(true);
    this.error.set('');

    try {
      const matches = await firstValueFrom(this.orderApi.matchByAsin(query));
      this.matchResults.set(matches);

      if (matches[0]) {
        this.applyMatch(matches[0]);
      }
    } catch (error: unknown) {
      this.error.set(getErrorMessage(error, 'Could not match the product.'));
    } finally {
      this.matchLoading.set(false);
    }
  }

  applyMatch(match: OrderProductMatch): void {
    this.selectedMatchId.set(match.id);
    this.orderForm.patchValue(
      {
        productId: match.id,
        hunterId: match.hunterId,
        listerId: match.listerId || '',
        accountId: match.accountId || this.orderForm.controls.accountId.value,
        asin: match.asin || this.orderForm.controls.asin.value,
        productTitle: match.title || this.orderForm.controls.productTitle.value,
        customLabel: match.customLabel || this.orderForm.controls.customLabel.value,
        ebayListingUrl: match.listingUrl || this.orderForm.controls.ebayListingUrl.value,
      },
      { emitEvent: false },
    );
  }

  markSelectedPlaced(): void {
    const order = this.selectedOrder();

    if (!order || !this.processingActionsVm().canMarkPlaced) {
      return;
    }

    const amazonBuyingPrice = decimalValue(this.orderForm.controls.amazonBuyingPrice.value);
    const amazonOrderId = this.orderForm.controls.amazonOrderId.value.trim();
    if (!amazonOrderId || amazonBuyingPrice === null || amazonBuyingPrice <= 0) {
      this.orderForm.controls.amazonBuyingPrice.markAsTouched();
      this.orderForm.controls.amazonOrderId.markAsTouched();
      this.bumpOrderFormVersion();
      return;
    }

    this.saving.set(true);
    firstValueFrom(
      this.orderApi.markPlaced(order.id, {
        amazonOrderId: amazonOrderId || undefined,
        amazonBuyingPrice,
        supplierShippingCost:
          decimalValue(this.orderForm.controls.supplierShippingCost.value) ?? undefined,
        otherCost: decimalValue(this.orderForm.controls.otherCost.value) ?? undefined,
      }),
    )
      .then((updated) => {
        this.upsertLocalOrder(updated, false);
        this.refreshStatsOnly();
        this.ignoreNextOrdersSync.set(true);
        this.workspaceSync.notifyOrdersChanged();
        this.toast.success('Order marked as placed.');
      })
      .catch((error: unknown) => {
        this.error.set(getErrorMessage(error, 'Could not mark the order as placed.'));
      })
      .finally(() => this.saving.set(false));
  }

  markSelectedShipped(): void {
    const order = this.selectedOrder();

    if (!order || !this.processingActionsVm().canMarkShipped) {
      return;
    }

    const trackingNumber = this.orderForm.controls.trackingNumber.value.trim();
    const carrier = this.orderForm.controls.carrier.value.trim();

    if (!trackingNumber || !carrier) {
      this.orderForm.controls.trackingNumber.markAsTouched();
      this.orderForm.controls.carrier.markAsTouched();
      this.bumpOrderFormVersion();
      return;
    }

    this.saving.set(true);
    firstValueFrom(this.orderApi.markShipped(order.id, { trackingNumber, carrier }))
      .then((updated) => {
        this.upsertLocalOrder(updated, false);
        this.refreshStatsOnly();
        this.ignoreNextOrdersSync.set(true);
        this.workspaceSync.notifyOrdersChanged();
        this.toast.success('Order marked as shipped.');
      })
      .catch((error: unknown) => {
        this.error.set(getErrorMessage(error, 'Could not mark the order as shipped.'));
      })
      .finally(() => this.saving.set(false));
  }

  markSelectedDelivered(): void {
    const order = this.selectedOrder();

    if (!order || !this.processingActionsVm().canMarkDelivered) {
      return;
    }

    this.saving.set(true);
    firstValueFrom(this.orderApi.markDelivered(order.id))
      .then((updated) => {
        this.upsertLocalOrder(updated, false);
        this.refreshStatsOnly();
        this.ignoreNextOrdersSync.set(true);
        this.workspaceSync.notifyOrdersChanged();
        this.toast.success('Order marked as delivered.');
      })
      .catch((error: unknown) => {
        this.error.set(getErrorMessage(error, 'Could not mark the order as delivered.'));
      })
      .finally(() => this.saving.set(false));
  }

  markSelectedIssue(): void {
    const order = this.selectedOrder();
    const issueType = this.orderForm.controls.issueType.value;
    const orderImpact = this.orderForm.controls.orderImpact.value;
    const issueReason = this.orderForm.controls.issueReason.value.trim();

    if (!order || !this.processingActionsVm().canMarkIssue || !issueType || !orderImpact || !issueReason) {
      this.orderForm.controls.issueType.markAsTouched();
      this.orderForm.controls.orderImpact.markAsTouched();
      this.orderForm.controls.issueReason.markAsTouched();
      this.bumpOrderFormVersion();
      return;
    }

    this.saving.set(true);
    firstValueFrom(this.orderApi.markIssueWithType(order.id, { issueType, issueReason, orderImpact }))
      .then((updated) => {
        this.upsertLocalOrder(updated, false);
        this.refreshStatsOnly();
        this.ignoreNextOrdersSync.set(true);
        this.workspaceSync.notifyOrdersChanged();
        this.workspaceSync.notifyChangeRequestsChanged();
        this.toast.success('Order flagged for issue follow-up.');
      })
      .catch((error: unknown) => {
        this.error.set(getErrorMessage(error, 'Could not mark the order as an issue.'));
      })
      .finally(() => this.saving.set(false));
  }

  exportOrders(): void {
    void this.exportAllOrders();
  }

  private initialize(): void {
    merge(this.orderForm.valueChanges, this.orderForm.statusChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.bumpOrderFormVersion());

    this.filters.controls.search.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pageIndex.set(0);
        this.refresh();
      });

    this.orderForm.controls.ebayOrderId.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkDuplicateOrder());

    this.orderForm.controls.ebayItemId.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkDuplicateOrder());

    this.orderForm.controls.asin.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((asin) => {
        if (this.modalState().mode !== 'create' || !this.modalState().open) {
          return;
        }

        if (!/^[A-Za-z0-9]{10}$/.test(String(asin || '').trim())) {
          return;
        }

        void this.findProductMatches();
      });

    effect(
      () => {
        const version = this.workspaceSync.ordersVersion();

        if (version > 0) {
          if (this.ignoreNextOrdersSync()) {
            this.ignoreNextOrdersSync.set(false);
            return;
          }

          this.refresh();
        }
      },
      { allowSignalWrites: true, injector: this.injector },
    );
  }

  private async loadReferenceData(): Promise<void> {
    if (this.referenceDataSubscribed) {
      return;
    }

    this.referenceDataSubscribed = true;
    const canManagePeople =
      this.currentRole() === 'admin' ||
      this.currentRole() === 'super_admin' ||
      Boolean(this.currentUser()?.permissions?.canProcessOrders);
    const accountSource =
      this.mode() === 'admin' || this.mode() === 'processor'
        ? this.referenceData.getAccounts(true)
        : this.referenceData.getAccounts();

    accountSource.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (accounts) => this.availableAccounts.set(accounts),
    });

    this.referenceData
      .getProductCategories(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (categories) => this.availableCategories.set(categories) });

    if (canManagePeople) {
      this.referenceData
        .getUsers('hunter')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (users) => this.availableHunters.set(users) });
      this.referenceData
        .getUsers('lister')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (users) => this.availableListers.set(users) });
    }
  }

  private buildFilters(): OrderFilters {
    const raw = this.filters.getRawValue();

    return {
      search: raw.search.trim() || undefined,
      category: raw.category || undefined,
      hunterId: raw.hunterId || undefined,
      listerId: raw.listerId || undefined,
      accountId: raw.accountId || undefined,
      status: raw.status || undefined,
      placementStatus: raw.placementStatus || undefined,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
      asin: raw.asin.trim() || undefined,
      ebayOrderId: raw.ebayOrderId.trim() || undefined,
      amazonOrderId: raw.amazonOrderId.trim() || undefined,
      unmatched: raw.unmatched || undefined,
      deletedState: this.showDeletedFilter() ? raw.deletedState : 'active',
      page: this.pageIndex() + 1,
      limit: this.pageSize(),
    };
  }

  private buildStatsFilters(): OrderFilters {
    const filters = this.buildFilters();
    delete filters.page;
    delete filters.limit;
    return filters;
  }

  private buildOrderPayload(): OrderUpsertPayload {
    const raw = this.orderForm.getRawValue();
    return {
      ebayOrderId: raw.ebayOrderId.trim(),
      ebayItemId: raw.ebayItemId.trim() || null,
      ebayListingUrl: raw.ebayListingUrl.trim() || null,
      orderDate: raw.orderDate || new Date().toISOString().slice(0, 10),
      quantity: raw.quantity || 1,
      salePrice: raw.salePrice.trim(),
      buyerCountry: raw.buyerCountry.trim() || null,
      buyerName: raw.buyerName.trim() || null,
      buyerState: raw.buyerState.trim() || null,
      buyerCity: raw.buyerCity.trim() || null,
      productId: raw.productId.trim() || null,
      hunterId: raw.hunterId.trim() || null,
      listerId: raw.listerId.trim() || null,
      accountId: raw.accountId.trim(),
      asin: raw.asin.trim() || null,
      productTitle: raw.productTitle.trim() || null,
      customLabel: raw.customLabel.trim() || null,
      amazonOrderId: raw.amazonOrderId.trim() || null,
      amazonOrderLink: raw.amazonOrderLink.trim() || null,
      amazonBuyingPrice: raw.amazonBuyingPrice.trim() || null,
      supplierShippingCost: raw.supplierShippingCost.trim() || null,
      otherCost: raw.otherCost.trim() || null,
      ebayFee: raw.ebayFee.trim() || null,
      shippingCharged: raw.shippingCharged.trim() || null,
      taxCollected: raw.taxCollected.trim() || null,
      paymentDate: raw.paymentDate || null,
      expectedShipDate: raw.expectedShipDate || null,
      placedDate: raw.placedDate || null,
      deliveredDate: raw.deliveredDate || null,
      trackingNumber: raw.trackingNumber.trim() || null,
      carrier: raw.carrier.trim() || null,
      supplierOrderStatus: raw.supplierOrderStatus.trim() || null,
      orderStatus: raw.orderStatus,
      placementStatus: raw.placementStatus,
      paymentStatus: raw.paymentStatus,
      issueType: raw.issueType,
      issueStatus: raw.issueStatus || null,
      orderImpact: raw.orderImpact || null,
      notes: raw.notes.trim() || null,
      issueReason: raw.issueReason.trim() || null,
    };
  }

  private isCreateOrderReady(): boolean {
    const controls = this.orderForm.controls;
    const ebayOrderId = controls.ebayOrderId.value.trim();
    const asin = controls.asin.value.trim();
    const amazonOrderId = controls.amazonOrderId.value.trim();
    const accountId = controls.accountId.value.trim();
    const salePrice = decimalValue(controls.salePrice.value);
    const amazonBuyingPrice = decimalValue(controls.amazonBuyingPrice.value);

    return (
      Boolean(ebayOrderId) &&
      controls.ebayOrderId.valid &&
      Boolean(asin) &&
      controls.asin.valid &&
      Boolean(amazonOrderId) &&
      controls.amazonOrderId.valid &&
      Boolean(accountId) &&
      controls.accountId.valid &&
      salePrice !== null &&
      salePrice > 0 &&
      controls.salePrice.valid &&
      amazonBuyingPrice !== null &&
      amazonBuyingPrice > 0 &&
      controls.amazonBuyingPrice.valid &&
      controls.amazonOrderLink.valid
    );
  }

  private bumpOrderFormVersion(): void {
    this.orderFormVersion.update((value) => value + 1);
  }

  private upsertLocalOrder(order: Order, isCreate: boolean): void {
    const matchesFilters = this.matchesCurrentFilters(order);
    const currentOrders = this.orders();
    const existingIndex = currentOrders.findIndex((entry) => entry.id === order.id);

    if (!matchesFilters) {
      if (existingIndex >= 0) {
        const next = [...currentOrders];
        next.splice(existingIndex, 1);
        this.orders.set(next);
        this.total.update((value) => Math.max(0, value - 1));
        this.syncSelectedOrder(next);
      }
      return;
    }

    if (existingIndex >= 0) {
      const next = [...currentOrders];
      next[existingIndex] = order;
      this.orders.set(next);
      this.selectedOrderId.set(order.id);
      if (!this.modalState().open) {
        this.patchFormFromOrder(order);
      }
      return;
    }

    const next = [order, ...currentOrders].slice(0, this.pageSize());
    this.orders.set(next);
    this.total.update((value) => value + (isCreate ? 1 : 0));
    this.selectedOrderId.set(order.id);
    if (!this.modalState().open) {
      this.patchFormFromOrder(order);
    }
  }

  private syncSelectedOrder(orders: Order[]): void {
    if (!orders.length) {
      this.selectedOrderId.set('');
      return;
    }

    if (!orders.some((order) => order.id === this.selectedOrderId())) {
      this.selectedOrderId.set(orders[0].id);
      if (!this.modalState().open) {
        this.patchFormFromOrder(orders[0]);
      }
      return;
    }

    if (!this.modalState().open) {
      const order = orders.find((entry) => entry.id === this.selectedOrderId());

      if (order) {
        this.patchFormFromOrder(order);
      }
    }
  }

  private matchesCurrentFilters(order: Order): boolean {
    const filters = this.buildStatsFilters();
    const term = (filters.search || '').toLowerCase();
    const orderDate = toDisplayDate(order.orderDate);

    if (filters.deletedState === 'active' && order.deletedAt) {
      return false;
    }

    if (filters.deletedState === 'deleted' && !order.deletedAt) {
      return false;
    }

    if (filters.hunterId && order.hunterId !== filters.hunterId) {
      return false;
    }

    if (filters.listerId && order.listerId !== filters.listerId) {
      return false;
    }

    if (filters.accountId && order.accountId !== filters.accountId) {
      return false;
    }

    if (filters.status && order.orderStatus !== filters.status) {
      return false;
    }

    if (filters.placementStatus && order.placementStatus !== filters.placementStatus) {
      return false;
    }

    if (filters.asin && order.asin !== filters.asin) {
      return false;
    }

    if (
      filters.ebayOrderId &&
      order.ebayOrderId.toLowerCase() !== filters.ebayOrderId.toLowerCase()
    ) {
      return false;
    }

    if (
      filters.amazonOrderId &&
      (order.amazonOrderId || '').toLowerCase() !== filters.amazonOrderId.toLowerCase()
    ) {
      return false;
    }

    if (filters.unmatched && order.matchStatus !== 'unmatched') {
      return false;
    }

    if (filters.dateFrom && orderDate < filters.dateFrom) {
      return false;
    }

    if (filters.dateTo && orderDate > filters.dateTo) {
      return false;
    }

    if (!term) {
      return true;
    }

    return [
      order.ebayOrderId,
      order.ebayItemId,
      order.amazonOrderId,
      order.asin,
      order.productTitle,
      order.hunterName,
      order.listerName,
      order.accountName,
      order.notes,
    ].some((value) => containsText(value, term));
  }

  private async exportAllOrders(): Promise<void> {
    this.exporting.set(true);
    this.error.set('');

    try {
      const filters = this.buildStatsFilters();
      const firstPage = await firstValueFrom(
        this.orderApi.listOrders({ ...filters, page: 1, limit: 100 }),
      );
      const rows = [...firstPage.items];
      const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.limit));

      for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await firstValueFrom(
          this.orderApi.listOrders({ ...filters, page, limit: 100 }),
        );
        rows.push(...nextPage.items);
      }

      const dateStamp = new Date().toISOString().slice(0, 10);
      this.exportService.exportAsExcelTable({
        filename: `orders-${this.mode()}-${dateStamp}.xlsx`,
        sheetName: 'Orders',
        rows,
        columns: [
          { header: 'Order Code', value: (row) => row.orderCode },
          { header: 'eBay Order ID', value: (row) => row.ebayOrderId },
          { header: 'Product', value: (row) => row.productTitle || '' },
          { header: 'ASIN', value: (row) => row.asin || '' },
          { header: 'Category', value: (row) => row.productCategory || '' },
          { header: 'Hunter', value: (row) => row.hunterName || '' },
          { header: 'Lister', value: (row) => row.listerName || '' },
          { header: 'Account', value: (row) => row.accountName || '' },
          { header: 'Quantity', value: (row) => row.quantity },
          { header: 'Sale Price', value: (row) => row.salePrice },
          { header: 'Total Cost', value: (row) => row.totalCost },
          { header: 'Profit', value: (row) => row.profit },
          { header: 'ROI', value: (row) => row.roi },
          { header: 'Order Status', value: (row) => row.orderStatus },
          { header: 'Placement Status', value: (row) => row.placementStatus },
          { header: 'Order Date', value: (row) => row.orderDate },
          { header: 'Tracking Number', value: (row) => row.trackingNumber || '' },
        ],
      });
      this.toast.success('Orders exported.');
    } catch (error) {
      this.error.set('Could not export orders.');
    } finally {
      this.exporting.set(false);
    }
  }

  private ensureFocusedOrderLoaded(): void {
    const focusOrderId = this.focusOrderId();

    if (!focusOrderId) {
      return;
    }

    if (this.orders().some((order) => order.id === focusOrderId)) {
      this.selectedOrderId.set(focusOrderId);
      return;
    }

    firstValueFrom(this.orderApi.getOrder(focusOrderId, true))
      .then((order) => {
        this.orders.update((orders) =>
          [order, ...orders.filter((entry) => entry.id !== order.id)].slice(0, this.pageSize()),
        );
        this.selectedOrderId.set(order.id);
        if (!this.modalState().open) {
          this.patchFormFromOrder(order);
        }
      })
      .catch(() => {});
  }

  private refreshStatsOnly(): void {
    this.statsLoading.set(true);
    firstValueFrom(this.orderApi.getStats(this.buildStatsFilters()))
      .then((stats) => this.stats.set(stats))
      .catch((error: unknown) => {
        this.error.set(getErrorMessage(error, 'Could not refresh order stats.'));
      })
      .finally(() => this.statsLoading.set(false));
  }

  private checkDuplicateOrder(): void {
    if (!this.modalState().open) {
      return;
    }

    const ebayOrderId = this.orderForm.controls.ebayOrderId.value.trim();

    if (!ebayOrderId) {
      this.duplicateState.set('idle');
      this.duplicateMessage.set('');
      return;
    }

    this.duplicateState.set('checking');
    this.orderApi
      .listOrders({
        ebayOrderId,
        deletedState: 'all',
        page: 1,
        limit: 5,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const duplicate = page.items.find((order) => order.id !== this.editingOrderId());

          if (duplicate) {
            this.duplicateState.set('duplicate');
            this.duplicateMessage.set('This eBay order already exists.');
            return;
          }

          this.duplicateState.set('allowed');
          this.duplicateMessage.set('eBay order ID is available.');
        },
        error: () => {
          this.duplicateState.set('idle');
          this.duplicateMessage.set('');
        },
      });
  }

  private filtersStorageKey(mode: OrderWorkspaceMode): string {
    return `${ORDER_FILTERS_STORAGE_PREFIX}_${mode}`;
  }

  private readFiltersCollapsed(mode: OrderWorkspaceMode): boolean {
    try {
      return (
        JSON.parse(
          localStorage.getItem(this.filtersStorageKey(mode)) ||
            (mode === 'processor' ? 'true' : 'false'),
        ) === true
      );
    } catch {
      return mode === 'processor';
    }
  }

  private patchFormFromOrder(order: Order): void {
    this.orderForm.patchValue(
      {
        productId: order.productId || '',
        hunterId: order.hunterId || '',
        listerId: order.listerId || '',
        accountId: order.accountId || '',
        asin: order.asin || '',
        productTitle: order.productTitle || '',
        customLabel: order.customLabel || '',
        amazonOrderId: order.amazonOrderId || '',
        amazonOrderLink: order.amazonOrderLink || '',
        amazonBuyingPrice: order.amazonBuyingPrice === null ? '' : String(order.amazonBuyingPrice),
        supplierShippingCost:
          order.supplierShippingCost === null ? '' : String(order.supplierShippingCost),
        otherCost: order.otherCost === null ? '' : String(order.otherCost),
        ebayFee: order.ebayFee === null ? '' : String(order.ebayFee),
        shippingCharged: order.shippingCharged === null ? '' : String(order.shippingCharged),
        taxCollected: order.taxCollected === null ? '' : String(order.taxCollected),
        trackingNumber: order.trackingNumber || '',
        carrier: order.carrier || '',
        orderStatus: order.orderStatus,
        placementStatus: order.placementStatus,
        paymentStatus: order.paymentStatus,
        issueType: order.issueType || 'OTHER',
        issueStatus: order.issueStatus || '',
        orderImpact: order.orderImpact || '',
        issueReason: order.issueReason || '',
        notes: order.notes || '',
      },
      { emitEvent: false },
    );
  }
}
