import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { ChangeRequest, ChangeRequestSummary, ListerChangeRequestBlockStatus } from '../models/product.models';
import { RequestCacheService } from '../state/request-cache.service';
import { PageResult } from '../state/query-state.models';

@Injectable({ providedIn: 'root' })
export class ChangeRequestApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  listChangeRequests(filters: {
    status?: 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'REJECTED' | 'CLOSED' | '';
    hunterId?: string;
    listerId?: string;
    accountId?: string;
    issueType?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  } = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.changeRequests, filters),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ changeRequests: ChangeRequest[]; page: number; limit: number; total: number; hasMore: boolean }>(
            `${environment.apiUrl}/change-requests`,
            { params },
          )
          .pipe(
            map(
              (response): PageResult<ChangeRequest> => ({
                items: response.changeRequests,
                page: response.page,
                limit: response.limit,
                total: response.total,
                hasMore: response.hasMore,
              }),
            ),
          ),
    );
  }

  getSummary() {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.changeRequests, 'summary'),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ summary: ChangeRequestSummary }>(`${environment.apiUrl}/change-requests/summary`)
          .pipe(map((response) => response.summary)),
    );
  }

  createChangeRequest(payload: { asin: string; requestedChanges: string }) {
    return this.http
      .post<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests`, payload)
      .pipe(
        map((response) => response.changeRequest),
        tap(() => this.invalidateChangeRequestCaches()),
      );
  }

  completeChangeRequest(id: string, payload: { completionNotes?: string }) {
    return this.http
      .patch<{ changeRequest: ChangeRequest | null }>(
        `${environment.apiUrl}/change-requests/${id}/complete`,
        payload,
      )
      .pipe(
        map((response) => response.changeRequest),
        tap(() => this.invalidateChangeRequestCaches()),
      );
  }

  getChangeRequest(id: string) {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.changeRequests, { id }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}`)
          .pipe(map((response) => response.changeRequest)),
    );
  }

  startChangeRequest(id: string) {
    return this.http
      .patch<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}/start`, {})
      .pipe(
        map((response) => response.changeRequest),
        tap(() => this.invalidateChangeRequestCaches()),
      );
  }

  fixChangeRequest(
    id: string,
    payload: {
      newAmazonLink?: string;
      newEbayLink?: string;
      newPrice?: string | number | null;
      newStockCount?: string | number | null;
      notes?: string;
    },
  ) {
    return this.http
      .patch<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}/fix`, payload)
      .pipe(
        map((response) => response.changeRequest),
        tap(() => this.invalidateChangeRequestCaches()),
      );
  }

  rejectChangeRequest(id: string, payload: { rejectedReason: string }) {
    return this.http
      .patch<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}/reject`, payload)
      .pipe(
        map((response) => response.changeRequest),
        tap(() => this.invalidateChangeRequestCaches()),
      );
  }

  reassignChangeRequest(id: string, listerId: string) {
    return this.http
      .patch<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}/reassign`, { listerId })
      .pipe(
        map((response) => response.changeRequest),
        tap(() => this.invalidateChangeRequestCaches()),
      );
  }

  closeChangeRequest(id: string, notes?: string) {
    return this.http
      .post<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}/close`, { notes })
      .pipe(
        map((response) => response.changeRequest),
        tap(() => this.invalidateChangeRequestCaches()),
      );
  }

  getListerBlockStatus(listerId?: string) {
    let params = new HttpParams();

    if (listerId) {
      params = params.set('listerId', listerId);
    }

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.changeRequests, { listerId, blockStatus: true }),
      CACHE_TTL.short,
      () =>
        this.http.get<ListerChangeRequestBlockStatus>(
          `${environment.apiUrl}/lister/change-request-block-status`,
          { params },
        ),
    );
  }

  private invalidateChangeRequestCaches(): void {
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.changeRequests);
  }
}
