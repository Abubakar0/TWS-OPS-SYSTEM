import { Injectable } from '@angular/core';
import { Observable, Subject, startWith, switchMap, shareReplay } from 'rxjs';

import { User, UserRole } from '../models/auth.models';
import { Account, HuntingCriteria } from '../models/product.models';
import { AdminService } from '../services/admin.service';

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

  constructor(private readonly adminApi: AdminService) {}

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
      switchMap(() => this.adminApi.listUsers(role)),
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
      switchMap(() => this.adminApi.listAccounts(includeInactive)),
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
}
