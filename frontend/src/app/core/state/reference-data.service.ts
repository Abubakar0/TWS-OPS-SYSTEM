import { Injectable } from '@angular/core';
import { firstValueFrom, from, Observable, Subject, shareReplay, startWith, switchMap } from 'rxjs';

import { User, UserRole } from '../models/auth.models';
import { Account, HuntingCriteria, ProductCategory } from '../models/product.models';
import { AdminApiService } from '../api/admin-api.service';
import { AccountApiService } from '../api/account-api.service';
import { ProductCategoryApiService } from '../api/product-category-api.service';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { RequestCacheService } from './request-cache.service';

@Injectable({ providedIn: 'root' })
export class ReferenceDataService {
  private readonly criteriaRefresh$ = new Subject<void>();
  private readonly usersRefreshMap = new Map<string, Subject<void>>();
  private readonly usersStreams = new Map<string, Observable<User[]>>();
  private readonly accountsRefreshMap = new Map<string, Subject<void>>();
  private readonly accountsStreams = new Map<string, Observable<Account[]>>();
  private readonly categoriesRefresh$ = new Subject<void>();
  private readonly categoriesStreams = new Map<string, Observable<ProductCategory[]>>();
  private readonly criteria$ = this.criteriaRefresh$.pipe(
    startWith(void 0),
    switchMap(() =>
      this.requestCache.getOrCreate(
        makeCacheKey(CACHE_NAMESPACE.criteria),
        CACHE_TTL.long,
        () => this.adminApi.getCriteria(),
      ),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor(
    private readonly adminApi: AdminApiService,
    private readonly accountApi: AccountApiService,
    private readonly productCategoryApi: ProductCategoryApiService,
    private readonly requestCache: RequestCacheService,
  ) {}

  getCriteria(): Observable<HuntingCriteria> {
    return this.criteria$;
  }

  refreshCriteria(): void {
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.criteria);
    this.criteriaRefresh$.next();
  }

  getUsers(role?: UserRole): Observable<User[]> {
    const key = role || 'all';
    const existing = this.usersStreams.get(key);

    if (existing) {
      return existing;
    }

    const refresh$ = new Subject<void>();
    this.usersRefreshMap.set(key, refresh$);

    const stream$ = refresh$.pipe(
      startWith(void 0),
      switchMap(() =>
        this.requestCache.getOrCreate(
          makeCacheKey(CACHE_NAMESPACE.users, { role: key }),
          CACHE_TTL.long,
          () => from(this.fetchAllUsers(role)),
        ),
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.usersStreams.set(key, stream$);
    return stream$;
  }

  refreshUsers(): void {
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.users);
    for (const refresh of this.usersRefreshMap.values()) {
      refresh.next();
    }
  }

  getAccounts(includeInactive = false): Observable<Account[]> {
    const key = includeInactive ? 'all' : 'active';
    const existing = this.accountsStreams.get(key);

    if (existing) {
      return existing;
    }

    const refresh$ = new Subject<void>();
    this.accountsRefreshMap.set(key, refresh$);

    const stream$ = refresh$.pipe(
      startWith(void 0),
      switchMap(() =>
        this.requestCache.getOrCreate(
          makeCacheKey(CACHE_NAMESPACE.accounts, { includeInactive }),
          CACHE_TTL.long,
          () => from(this.fetchAllAccounts(includeInactive)),
        ),
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.accountsStreams.set(key, stream$);
    return stream$;
  }

  refreshAccounts(): void {
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.accounts);
    for (const refresh of this.accountsRefreshMap.values()) {
      refresh.next();
    }
  }

  getProductCategories(includeInactive = false): Observable<ProductCategory[]> {
    const key = includeInactive ? 'all' : 'active';
    const existing = this.categoriesStreams.get(key);

    if (existing) {
      return existing;
    }

    const stream$ = this.categoriesRefresh$.pipe(
      startWith(void 0),
      switchMap(() =>
        this.requestCache.getOrCreate(
          makeCacheKey(CACHE_NAMESPACE.categories, { includeInactive }),
          CACHE_TTL.long,
          () => this.productCategoryApi.listCategories(includeInactive),
        ),
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.categoriesStreams.set(key, stream$);
    return stream$;
  }

  refreshProductCategories(): void {
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.categories);
    this.categoriesRefresh$.next();
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
