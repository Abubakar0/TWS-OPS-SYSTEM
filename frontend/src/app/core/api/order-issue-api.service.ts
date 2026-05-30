import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { OrderImpact, OrderIssue, OrderIssueStatus, OrderIssueType } from '../models/order.models';
import { RequestCacheService } from '../state/request-cache.service';
import { PageResult } from '../state/query-state.models';

export interface OrderIssueFilters {
  search?: string;
  issueType?: OrderIssueType | '';
  status?: OrderIssueStatus | '';
  hunterId?: string;
  listerId?: string;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class OrderIssueApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  listOrderIssues(filters: OrderIssueFilters = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.orderIssues, filters),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ orderIssues: OrderIssue[]; page: number; limit: number; total: number; hasMore: boolean }>(
            `${environment.apiUrl}/order-issues`,
            { params },
          )
          .pipe(
            map(
              (response): PageResult<OrderIssue> => ({
                items: response.orderIssues,
                page: response.page,
                limit: response.limit,
                total: response.total,
                hasMore: response.hasMore,
              }),
            ),
          ),
    );
  }

  getOrderIssue(id: string) {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.orderIssues, { id }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ orderIssue: OrderIssue }>(`${environment.apiUrl}/order-issues/${id}`)
          .pipe(map((response) => response.orderIssue)),
    );
  }

  updateOrderIssue(
    id: string,
    payload: {
      issueType?: OrderIssueType;
      issueStatus?: OrderIssueStatus;
      issueReason?: string;
      orderImpact?: OrderImpact;
      notes?: string;
    },
  ) {
    return this.http
      .patch<{ orderIssue: OrderIssue }>(`${environment.apiUrl}/order-issues/${id}`, payload)
      .pipe(
        map((response) => response.orderIssue),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.orderIssues)),
      );
  }

  closeOrderIssue(id: string, notes?: string) {
    return this.http
      .post<{ orderIssue: OrderIssue }>(`${environment.apiUrl}/order-issues/${id}/close`, { notes })
      .pipe(
        map((response) => response.orderIssue),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.orderIssues)),
      );
  }
}
