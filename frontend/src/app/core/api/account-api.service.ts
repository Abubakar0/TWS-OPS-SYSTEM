import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Account } from '../models/product.models';

@Injectable({ providedIn: 'root' })
export class AccountApiService {
  constructor(private readonly http: HttpClient) {}

  listAccounts(includeInactive = false): Observable<Account[]> {
    const params = includeInactive ? new HttpParams().set('includeInactive', 'true') : undefined;
    return this.http
      .get<{ accounts: Account[] }>(`${environment.apiUrl}/accounts`, { params })
      .pipe(map((response) => response.accounts));
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
