import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { Order, OrderActivityEntry, OrderFilters, OrderIssueType, OrderProductMatch, OrderStats, OrderStatus, OrderUpsertPayload } from '../models/order.models';
import { RequestCacheService } from '../state/request-cache.service';
import { PageResult } from '../state/query-state.models';

@Injectable({ providedIn: 'root' })
export class OrderApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  listOrders(filters: OrderFilters = {}): Observable<PageResult<Order>> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.orders, { type: 'list', ...filters }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ orders: Order[]; page: number; limit: number; total: number; hasMore: boolean }>(
            `${environment.apiUrl}/orders`,
            { params },
          )
          .pipe(
            map((response) => ({
              items: response.orders,
              page: response.page,
              limit: response.limit,
              total: response.total,
              hasMore: response.hasMore,
            })),
          ),
    );
  }

  getOrder(id: string, includeDeleted = false): Observable<Order> {
    let params = new HttpParams();

    if (includeDeleted) {
      params = params.set('includeDeleted', 'true');
    }

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.orders, { type: 'detail', id, includeDeleted }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ order: Order }>(`${environment.apiUrl}/orders/${id}`, { params })
          .pipe(map((response) => response.order)),
    );
  }

  getOrderActivity(id: string, limit = 20): Observable<OrderActivityEntry[]> {
    const params = new HttpParams().set('limit', String(limit));
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.orders, { type: 'activity', id, limit }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ activity: OrderActivityEntry[] }>(`${environment.apiUrl}/orders/${id}/activity`, { params })
          .pipe(map((response) => response.activity)),
    );
  }

  createOrder(payload: OrderUpsertPayload): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders`, payload)
      .pipe(
        map((response) => response.order),
        tap(() => this.invalidateOrderCaches()),
      );
  }

  updateOrder(id: string, payload: Partial<OrderUpsertPayload>): Observable<Order> {
    return this.http
      .patch<{ order: Order }>(`${environment.apiUrl}/orders/${id}`, payload)
      .pipe(
        map((response) => response.order),
        tap(() => this.invalidateOrderCaches()),
      );
  }

  deleteOrder(id: string, options: { permanent?: boolean; reason?: string } = {}): Observable<void> {
    let params = new HttpParams();

    if (options.permanent) {
      params = params.set('permanent', 'true');
    }

    return this.http
      .request<void>('delete', `${environment.apiUrl}/orders/${id}`, {
        params,
        body: options.reason ? { reason: options.reason } : undefined,
      })
      .pipe(tap(() => this.invalidateOrderCaches()));
  }

  restoreOrder(id: string): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/restore`, {})
      .pipe(
        map((response) => response.order),
        tap(() => this.invalidateOrderCaches()),
      );
  }

  markPlaced(id: string, payload: Partial<OrderUpsertPayload>): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/mark-placed`, payload)
      .pipe(
        map((response) => response.order),
        tap(() => this.invalidateOrderCaches()),
      );
  }

  markShipped(id: string, payload: Pick<OrderUpsertPayload, 'trackingNumber' | 'carrier'>): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/mark-shipped`, payload)
      .pipe(
        map((response) => response.order),
        tap(() => this.invalidateOrderCaches()),
      );
  }

  markDelivered(id: string, payload: { deliveredDate?: string | null } = {}): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/mark-delivered`, payload)
      .pipe(
        map((response) => response.order),
        tap(() => this.invalidateOrderCaches()),
      );
  }

  markIssue(id: string, issueReason: string): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/mark-issue`, { issueReason })
      .pipe(
        map((response) => response.order),
        tap(() => this.invalidateOrderCaches()),
      );
  }

  markIssueWithType(
    id: string,
    payload: { issueType: OrderIssueType; issueReason: string; orderImpact: string },
  ): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/mark-issue`, payload)
      .pipe(
        map((response) => response.order),
        tap(() => this.invalidateOrderCaches()),
      );
  }

  updateStatus(
    id: string,
    payload: Partial<OrderUpsertPayload> & { orderStatus: OrderStatus },
  ): Observable<Order> {
    return this.http
      .patch<{ order: Order }>(`${environment.apiUrl}/orders/${id}/status`, payload)
      .pipe(
        map((response) => response.order),
        tap(() => this.invalidateOrderCaches()),
      );
  }

  bulkUpdateStatus(
    ids: string[],
    payload: Partial<OrderUpsertPayload> & { orderStatus: OrderStatus },
  ): Observable<{ updated: Order[]; skipped: Array<{ id: string; message: string }>; requested: number }> {
    return this.http
      .post<{ updated: Order[]; skipped: Array<{ id: string; message: string }>; requested: number }>(
        `${environment.apiUrl}/orders/bulk-status`,
        { ids, ...payload },
      )
      .pipe(tap(() => this.invalidateOrderCaches()));
  }

  getStats(filters: OrderFilters = {}): Observable<OrderStats> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.orders, { type: 'stats', ...filters }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ stats: OrderStats }>(`${environment.apiUrl}/orders/stats`, { params })
          .pipe(map((response) => response.stats)),
    );
  }

  getReports(filters: OrderFilters = {}): Observable<OrderStats> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.orders, { type: 'reports', ...filters }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ reports: OrderStats }>(`${environment.apiUrl}/orders/reports`, { params })
          .pipe(map((response) => response.reports)),
    );
  }

  matchProduct(query: {
    search?: string;
    asin?: string;
    customLabel?: string;
    ebayListingUrl?: string;
    ebayItemId?: string;
    title?: string;
    productId?: string;
    limit?: number;
  }): Observable<OrderProductMatch[]> {
    let params = new HttpParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.orders, { type: 'match', ...query }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ matches: OrderProductMatch[] }>(`${environment.apiUrl}/orders/match-product`, { params })
          .pipe(map((response) => response.matches)),
    );
  }

  matchByAsin(query: { asin?: string; search?: string; title?: string; customLabel?: string; limit?: number }): Observable<OrderProductMatch[]> {
    let params = new HttpParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.orders, { type: 'match-asin', ...query }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ matches: OrderProductMatch[] }>(`${environment.apiUrl}/orders/match-by-asin`, { params })
          .pipe(map((response) => response.matches)),
    );
  }

  private invalidateOrderCaches(): void {
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.orders);
  }
}
