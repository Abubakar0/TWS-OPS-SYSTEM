import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Account } from '../models/product.models';
import { PageResult } from '../state/query-state.models';

@Injectable({ providedIn: 'root' })
export class AccountApiService {
  constructor(private readonly http: HttpClient) {}

  listAccounts(options: {
    includeInactive?: boolean;
    marketplace?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Observable<PageResult<Account>> {
    let params = new HttpParams();

    if (options.includeInactive) {
      params = params.set('includeInactive', 'true');
    }

    if (options.marketplace) {
      params = params.set('marketplace', options.marketplace);
    }

    if (options.status) {
      params = params.set('status', options.status);
    }

    if (options.search) {
      params = params.set('search', options.search);
    }

    if (options.page) {
      params = params.set('page', String(options.page));
    }

    if (options.limit) {
      params = params.set('limit', String(options.limit));
    }

    return this.http
      .get<{ accounts: Account[]; page: number; limit: number; total: number; hasMore: boolean }>(
        `${environment.apiUrl}/accounts`,
        { params },
      )
      .pipe(
        map((response) => ({
          items: response.accounts,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.hasMore,
        })),
      );
  }

  createAccount(payload: { name: string; marketplace: string; isActive: boolean }): Observable<Account> {
    return this.http
      .post<{ account: Account }>(`${environment.apiUrl}/accounts`, payload)
      .pipe(map((response) => response.account));
  }

  updateAccount(id: string, payload: Partial<Account>): Observable<Account> {
    return this.http
      .patch<{ account: Account }>(`${environment.apiUrl}/accounts/${id}`, payload)
      .pipe(map((response) => response.account));
  }

  setAccountListers(id: string, listerIds: string[]): Observable<Account> {
    return this.http
      .put<{ account: Account }>(`${environment.apiUrl}/accounts/${id}/listers`, { listerIds })
      .pipe(map((response) => response.account));
  }
}
