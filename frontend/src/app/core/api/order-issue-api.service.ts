import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { OrderImpact, OrderIssue, OrderIssueStatus, OrderIssueType } from '../models/order.models';
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
  constructor(private readonly http: HttpClient) {}

  listOrderIssues(filters: OrderIssueFilters = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.http
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
      );
  }

  getOrderIssue(id: string) {
    return this.http
      .get<{ orderIssue: OrderIssue }>(`${environment.apiUrl}/order-issues/${id}`)
      .pipe(map((response) => response.orderIssue));
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
      .pipe(map((response) => response.orderIssue));
  }

  closeOrderIssue(id: string, notes?: string) {
    return this.http
      .post<{ orderIssue: OrderIssue }>(`${environment.apiUrl}/order-issues/${id}/close`, { notes })
      .pipe(map((response) => response.orderIssue));
  }
}
