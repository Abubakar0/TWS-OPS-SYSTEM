import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { Account, AssignedHunter, BulkListedPayload, Product, ProductFilters } from '../models/product.models';
import { RequestCacheService } from '../state/request-cache.service';
import { PageResult } from '../state/query-state.models';

@Injectable({ providedIn: 'root' })
export class ListerApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  listQueueProducts(filters: ProductFilters = {}): Observable<PageResult<Product>> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.products, { queue: true, ...filters }),
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

  listAssignedHunters(): Observable<AssignedHunter[]> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.assignedHunters),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ hunters: AssignedHunter[] }>(`${environment.apiUrl}/products/assigned-hunters`)
          .pipe(map((response) => response.hunters)),
    );
  }

  markBulkListed(payload: BulkListedPayload): Observable<Product[]> {
    return this.http
      .patch<{ products: Product[] }>(`${environment.apiUrl}/products/bulk-listed`, payload)
      .pipe(
        map((response) => response.products),
        tap(() => this.invalidateListingCaches()),
      );
  }

  rejectProduct(id: string, rejectionReason: string): Observable<Product> {
    return this.http
      .patch<{ product: Product }>(`${environment.apiUrl}/products/${id}/reject`, { rejectionReason })
      .pipe(
        map((response) => response.product),
        tap(() => this.invalidateListingCaches()),
      );
  }

  private invalidateListingCaches(): void {
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products);
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.assignedHunters);
  }
}
