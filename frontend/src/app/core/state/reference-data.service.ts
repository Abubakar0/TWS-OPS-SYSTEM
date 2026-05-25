import { Injectable } from '@angular/core';
import { firstValueFrom, from, Observable, Subject, startWith, switchMap, shareReplay } from 'rxjs';

import { User, UserRole } from '../models/auth.models';
import { Account, HuntingCriteria } from '../models/product.models';
import { AdminApiService } from '../api/admin-api.service';
import { AccountApiService } from '../api/account-api.service';

@Injectable({ providedIn: 'root' })
export class ReferenceDataService {
  private readonly criteriaRefresh$ = new Subject<void>();
  private readonly usersRefreshMap = new Map<string, Subject<void>>();
  private readonly usersCache = new Map<string, Observable<User[]>>();
  private readonly accountsRefreshMap = new Map<string, Subject<void>>();
  private readonly accountsCache = new Map<string, Observable<Account[]>>();

  readonly criteria$ = this.criteriaRefresh$.pipe(
    startWith(void 0),
    switchMap(() => this.adminApi.getCriteria()),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor(
    private readonly adminApi: AdminApiService,
    private readonly accountApi: AccountApiService,
  ) {}

  getCriteria(): Observable<HuntingCriteria> {
    return this.criteria$;
  }

  refreshCriteria(): void {
    this.criteriaRefresh$.next();
  }

  getUsers(role?: UserRole): Observable<User[]> {
    const key = role || 'all';
    const existing = this.usersCache.get(key);

    if (existing) {
      return existing;
    }

    const refresh$ = new Subject<void>();
    this.usersRefreshMap.set(key, refresh$);

    const request$ = refresh$.pipe(
      startWith(void 0),
      switchMap(() => from(this.fetchAllUsers(role))),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.usersCache.set(key, request$);
    return request$;
  }

  refreshUsers(): void {
    for (const refresh of this.usersRefreshMap.values()) {
      refresh.next();
    }
  }

  getAccounts(includeInactive = false): Observable<Account[]> {
    const key = includeInactive ? 'all' : 'active';
    const existing = this.accountsCache.get(key);

    if (existing) {
      return existing;
    }

    const refresh$ = new Subject<void>();
    this.accountsRefreshMap.set(key, refresh$);

    const request$ = refresh$.pipe(
      startWith(void 0),
      switchMap(() => from(this.fetchAllAccounts(includeInactive))),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.accountsCache.set(key, request$);
    return request$;
  }

  refreshAccounts(): void {
    for (const refresh of this.accountsRefreshMap.values()) {
      refresh.next();
    }
  }

  private async fetchAllUsers(role?: UserRole): Promise<User[]> {
    const firstPage = await firstValueFrom(
      this.adminApi.listUsers(role, {
        page: 1,
        limit: 100,
      }),
    );
    const users = [...firstPage.items];
    const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.limit));

    for (let page = 2; page <= totalPages; page += 1) {
      const nextPage = await firstValueFrom(
        this.adminApi.listUsers(role, {
          page,
          limit: firstPage.limit,
        }),
      );
      users.push(...nextPage.items);
    }

    return users;
  }

  private async fetchAllAccounts(includeInactive: boolean): Promise<Account[]> {
    const firstPage = await firstValueFrom(
      this.accountApi.listAccounts({
        includeInactive,
        page: 1,
        limit: 100,
      }),
    );
    const accounts = [...firstPage.items];
    const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.limit));

    for (let page = 2; page <= totalPages; page += 1) {
      const nextPage = await firstValueFrom(
        this.accountApi.listAccounts({
          includeInactive,
          page,
          limit: firstPage.limit,
        }),
      );
      accounts.push(...nextPage.items);
    }

    return accounts;
  }
}
