import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ChangeRequest, ChangeRequestSummary, ListerChangeRequestBlockStatus } from '../models/product.models';
import { PageResult } from '../state/query-state.models';

@Injectable({ providedIn: 'root' })
export class ChangeRequestApiService {
  constructor(private readonly http: HttpClient) {}

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

    return this.http
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
      );
  }

  getSummary() {
    return this.http
      .get<{ summary: ChangeRequestSummary }>(`${environment.apiUrl}/change-requests/summary`)
      .pipe(map((response) => response.summary));
  }

  createChangeRequest(payload: { asin: string; requestedChanges: string }) {
    return this.http
      .post<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests`, payload)
      .pipe(map((response) => response.changeRequest));
  }

  completeChangeRequest(id: string, payload: { completionNotes?: string }) {
    return this.http
      .patch<{ changeRequest: ChangeRequest | null }>(
        `${environment.apiUrl}/change-requests/${id}/complete`,
        payload,
      )
      .pipe(map((response) => response.changeRequest));
  }

  getChangeRequest(id: string) {
    return this.http
      .get<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}`)
      .pipe(map((response) => response.changeRequest));
  }

  startChangeRequest(id: string) {
    return this.http
      .patch<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}/start`, {})
      .pipe(map((response) => response.changeRequest));
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
      .pipe(map((response) => response.changeRequest));
  }

  rejectChangeRequest(id: string, payload: { rejectedReason: string }) {
    return this.http
      .patch<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}/reject`, payload)
      .pipe(map((response) => response.changeRequest));
  }

  reassignChangeRequest(id: string, listerId: string) {
    return this.http
      .patch<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}/reassign`, { listerId })
      .pipe(map((response) => response.changeRequest));
  }

  closeChangeRequest(id: string, notes?: string) {
    return this.http
      .post<{ changeRequest: ChangeRequest }>(`${environment.apiUrl}/change-requests/${id}/close`, { notes })
      .pipe(map((response) => response.changeRequest));
  }

  getListerBlockStatus(listerId?: string) {
    let params = new HttpParams();

    if (listerId) {
      params = params.set('listerId', listerId);
    }

    return this.http.get<ListerChangeRequestBlockStatus>(`${environment.apiUrl}/lister/change-request-block-status`, { params });
  }
}
