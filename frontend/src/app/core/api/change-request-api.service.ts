import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ChangeRequest, ChangeRequestSummary } from '../models/product.models';
import { PageResult } from '../state/query-state.models';

@Injectable({ providedIn: 'root' })
export class ChangeRequestApiService {
  constructor(private readonly http: HttpClient) {}

  listChangeRequests(filters: {
    status?: 'pending' | 'completed' | '';
    hunterId?: string;
    listerId?: string;
    search?: string;
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
}
