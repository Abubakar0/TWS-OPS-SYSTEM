import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { OrderApiService } from '../../core/api/order-api.service';
import { Order, OrderFilters, OrderStats } from '../../core/models/order.models';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

type DashboardRange = 'today' | 'yesterday' | 'month' | 'custom';

const toDateInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const startOfMonth = () => {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

@Component({
  selector: 'app-order-processor-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    EmptyStateComponent,
  ],
  templateUrl: './order-processor-dashboard.component.html',
  styleUrl: './order-processor-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderProcessorDashboardComponent {
  private readonly orderApi = inject(OrderApiService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly range = signal<DashboardRange>('today');
  readonly stats = signal<OrderStats | null>(null);
  readonly recentOrders = signal<Order[]>([]);

  readonly customFrom = new FormControl(toDateInput(new Date()), { nonNullable: true });
  readonly customTo = new FormControl(toDateInput(new Date()), { nonNullable: true });

  readonly cards = computed(() => {
    const stats = this.stats();

    return [
      { label: 'Orders Added Today', value: stats?.ordersToday || 0, tone: 'status-badge--order-new' },
      { label: 'Pending Placement', value: stats?.pendingPlacement || 0, tone: 'status-badge--order-ready' },
      { label: 'Placed Today', value: stats?.placedToday || 0, tone: 'status-badge--order-placed' },
      { label: 'Orders With Issues', value: stats?.issueOrders || 0, tone: 'status-badge--order-issue' },
      { label: 'Loss Orders', value: stats?.lossOrders || 0, tone: 'status-badge--order-muted' },
      { label: 'Unmatched Orders', value: stats?.unmatchedOrders || 0, tone: 'status-badge--warning' },
    ];
  });

  readonly recentActivity = computed(() =>
    this.recentOrders().map((order) => ({
      id: order.id,
      label:
        order.orderStatus === 'ISSUE'
          ? 'Issue created'
          : order.orderStatus === 'SHIPPED'
            ? 'Tracking added'
            : order.orderStatus === 'PLACED'
              ? 'Order placed'
              : 'Order added',
      orderCode: order.orderCode,
      asin: order.asin || 'No ASIN',
      status: order.orderStatus,
      createdAt: order.updatedAt || order.createdAt,
    })),
  );

  constructor() {
    void this.loadDashboard();
  }

  setRange(range: DashboardRange): void {
    this.range.set(range);

    if (range === 'yesterday') {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      const formatted = toDateInput(date);
      this.customFrom.setValue(formatted, { emitEvent: false });
      this.customTo.setValue(formatted, { emitEvent: false });
    } else if (range === 'today') {
      const today = toDateInput(new Date());
      this.customFrom.setValue(today, { emitEvent: false });
      this.customTo.setValue(today, { emitEvent: false });
    } else if (range === 'month') {
      this.customFrom.setValue(toDateInput(startOfMonth()), { emitEvent: false });
      this.customTo.setValue(toDateInput(new Date()), { emitEvent: false });
    }

    void this.loadDashboard();
  }

  applyCustomRange(): void {
    this.range.set('custom');
    void this.loadDashboard();
  }

  async loadDashboard(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const filters = this.buildFilters();

    try {
      const result = await firstValueFrom(
        forkJoin({
          stats: this.orderApi.getStats(filters),
          orders: this.orderApi.listOrders({ ...filters, page: 1, limit: 6 }),
        }),
      );
      this.stats.set(result.stats);
      this.recentOrders.set(result.orders.items);
    } catch (error: any) {
      this.error.set(error?.error?.message || 'Could not load order processor dashboard.');
    } finally {
      this.loading.set(false);
    }
  }

  private buildFilters(): OrderFilters {
    if (this.range() === 'custom') {
      return {
        dateFrom: this.customFrom.value || undefined,
        dateTo: this.customTo.value || undefined,
      };
    }

    if (this.range() === 'yesterday') {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      const formatted = toDateInput(date);
      return { dateFrom: formatted, dateTo: formatted };
    }

    if (this.range() === 'month') {
      return {
        dateFrom: toDateInput(startOfMonth()),
        dateTo: toDateInput(new Date()),
      };
    }

    const today = toDateInput(new Date());
    return { dateFrom: today, dateTo: today };
  }
}
