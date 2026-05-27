import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Order, OrderFilters, OrderIssueType, OrderProductMatch, OrderStats, OrderStatus, OrderUpsertPayload } from '../models/order.models';
import { PageResult } from '../state/query-state.models';

@Injectable({ providedIn: 'root' })
export class OrderApiService {
  constructor(private readonly http: HttpClient) {}

  listOrders(filters: OrderFilters = {}): Observable<PageResult<Order>> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.http
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
      );
  }

  getOrder(id: string, includeDeleted = false): Observable<Order> {
    let params = new HttpParams();

    if (includeDeleted) {
      params = params.set('includeDeleted', 'true');
    }

    return this.http
      .get<{ order: Order }>(`${environment.apiUrl}/orders/${id}`, { params })
      .pipe(map((response) => response.order));
  }

  createOrder(payload: OrderUpsertPayload): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders`, payload)
      .pipe(map((response) => response.order));
  }

  updateOrder(id: string, payload: Partial<OrderUpsertPayload>): Observable<Order> {
    return this.http
      .patch<{ order: Order }>(`${environment.apiUrl}/orders/${id}`, payload)
      .pipe(map((response) => response.order));
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
      });
  }

  restoreOrder(id: string): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/restore`, {})
      .pipe(map((response) => response.order));
  }

  markPlaced(id: string, payload: Partial<OrderUpsertPayload>): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/mark-placed`, payload)
      .pipe(map((response) => response.order));
  }

  markShipped(id: string, payload: Pick<OrderUpsertPayload, 'trackingNumber' | 'carrier'>): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/mark-shipped`, payload)
      .pipe(map((response) => response.order));
  }

  markDelivered(id: string, payload: { deliveredDate?: string | null } = {}): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/mark-delivered`, payload)
      .pipe(map((response) => response.order));
  }

  markIssue(id: string, issueReason: string): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/mark-issue`, { issueReason })
      .pipe(map((response) => response.order));
  }

  markIssueWithType(
    id: string,
    payload: { issueType: OrderIssueType; issueReason: string; orderImpact: string },
  ): Observable<Order> {
    return this.http
      .post<{ order: Order }>(`${environment.apiUrl}/orders/${id}/mark-issue`, payload)
      .pipe(map((response) => response.order));
  }

  updateStatus(
    id: string,
    payload: Partial<OrderUpsertPayload> & { orderStatus: OrderStatus },
  ): Observable<Order> {
    return this.http
      .patch<{ order: Order }>(`${environment.apiUrl}/orders/${id}/status`, payload)
      .pipe(map((response) => response.order));
  }

  getStats(filters: OrderFilters = {}): Observable<OrderStats> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.http
      .get<{ stats: OrderStats }>(`${environment.apiUrl}/orders/stats`, { params })
      .pipe(map((response) => response.stats));
  }

  getReports(filters: OrderFilters = {}): Observable<OrderStats> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.http
      .get<{ reports: OrderStats }>(`${environment.apiUrl}/orders/reports`, { params })
      .pipe(map((response) => response.reports));
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

    return this.http
      .get<{ matches: OrderProductMatch[] }>(`${environment.apiUrl}/orders/match-product`, { params })
      .pipe(map((response) => response.matches));
  }

  matchByAsin(query: { asin?: string; search?: string; title?: string; customLabel?: string; limit?: number }): Observable<OrderProductMatch[]> {
    let params = new HttpParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.http
      .get<{ matches: OrderProductMatch[] }>(`${environment.apiUrl}/orders/match-by-asin`, { params })
      .pipe(map((response) => response.matches));
  }
}
