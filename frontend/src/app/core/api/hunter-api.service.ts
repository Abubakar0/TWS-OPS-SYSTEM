import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { AsinCheckResult, Product, ProductCreatePayload, ProductFilters } from '../models/product.models';
import { User } from '../models/auth.models';
import { RequestCacheService } from '../state/request-cache.service';
import { PageResult } from '../state/query-state.models';

@Injectable({ providedIn: 'root' })
export class HunterApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  createProduct(payload: ProductCreatePayload): Observable<Product> {
    return this.http
      .post<{ product: Product }>(`${environment.apiUrl}/products`, payload)
      .pipe(
        map((response) => response.product),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)),
      );
  }

  acknowledgeTrainingRules(): Observable<User> {
    return this.http
      .post<{ user: User }>(`${environment.apiUrl}/users/me/hunter-training/acknowledge`, {})
      .pipe(map((response) => response.user));
  }

  checkAsin(asin: string): Observable<AsinCheckResult> {
    const params = new HttpParams().set('asin', asin);
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.products, { asin }),
      CACHE_TTL.short,
      () => this.http.get<AsinCheckResult>(`${environment.apiUrl}/products/check-asin`, { params }),
    );
  }

  listProducts(filters: ProductFilters = {}): Observable<PageResult<Product>> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.products, filters),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ products: Product[]; page: number; limit: number; total: number; hasMore: boolean }>(
            `${environment.apiUrl}/products`,
            { params },
          )
          .pipe(
            map((response) => ({
              items: response.products,
              page: response.page,
              limit: response.limit,
              total: response.total,
              hasMore: response.hasMore,
            })),
          ),
    );
  }
}
