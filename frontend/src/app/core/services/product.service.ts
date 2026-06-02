import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import {
  AsinCheckResult,
  AssignedHunter,
  BulkListedPayload,
  Product,
  ProductCreatePayload,
  ProductFilters,
} from '../models/product.models';
import { PageResult } from '../state/query-state.models';
import { RequestCacheService } from '../state/request-cache.service';

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  listProducts(filters: ProductFilters = {}) {
    const params = Object.entries(filters).reduce((acc, [key, value]) => {
      if (value) {
        acc.set(key, String(value));
      }

      return acc;
    }, new URLSearchParams());

    const query = params.toString();
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.products, { legacy: 'hunter', ...filters }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ products: Product[]; page: number; limit: number; total: number; hasMore: boolean }>(
            `${environment.apiUrl}/products${query ? `?${query}` : ''}`,
          )
          .pipe(
            map(
              (response): PageResult<Product> => ({
                items: response.products,
                page: response.page,
                limit: response.limit,
                total: response.total,
                hasMore: response.hasMore,
              }),
            ),
          ),
    );
  }

  createProduct(payload: ProductCreatePayload) {
    return this.http
      .post<{ product: Product }>(`${environment.apiUrl}/products`, payload)
      .pipe(
        map((response) => response.product),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)),
      );
  }

  checkAsin(asin: string) {
    const params = new URLSearchParams();
    params.set('asin', asin);

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.products, { asin }),
      CACHE_TTL.short,
      () => this.http.get<AsinCheckResult>(`${environment.apiUrl}/products/check-asin?${params.toString()}`),
    );
  }

  listAssignedHunters() {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.assignedHunters),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ hunters: AssignedHunter[] }>(`${environment.apiUrl}/products/assigned-hunters`)
          .pipe(map((response) => response.hunters)),
    );
  }

  markBulkListed(payload: BulkListedPayload) {
    return this.http
      .patch<{ products: Product[] }>(`${environment.apiUrl}/products/bulk-listed`, payload)
      .pipe(
        map((response) => response.products),
        tap(() => this.invalidateProductCaches()),
      );
  }

  rejectProduct(id: string, rejectionReason: string) {
    return this.http
      .patch<{ product: Product }>(`${environment.apiUrl}/products/${id}/reject`, { rejectionReason })
      .pipe(
        map((response) => response.product),
        tap(() => this.invalidateProductCaches()),
      );
  }

  private invalidateProductCaches(): void {
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products);
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.assignedHunters);
  }
}
