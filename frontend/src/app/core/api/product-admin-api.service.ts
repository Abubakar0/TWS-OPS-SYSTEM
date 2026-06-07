import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import {
  Product,
  ProductFilters,
  ProductOwnershipTransferSummary,
  ProductUpdatePayload,
} from '../models/product.models';
import { RequestCacheService } from '../state/request-cache.service';
import { PageResult } from '../state/query-state.models';

@Injectable({ providedIn: 'root' })
export class ProductAdminApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  listProducts(filters: ProductFilters = {}): Observable<PageResult<Product>> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.products, { admin: true, ...filters }),
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

  softDeleteProducts(productIds: string[], reason: string): Observable<string[]> {
    return this.http
      .patch<{ deletedIds: string[] }>(`${environment.apiUrl}/products/bulk-delete`, {
        productIds,
        reason,
      })
      .pipe(
        map((response) => response.deletedIds),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)),
      );
  }

  bulkUpdateProducts(
    productIds: string[],
    payload: {
      title?: string;
      customLabel?: string;
      category?: string;
      amazonUrl?: string;
      ebayUrl?: string;
    },
  ): Observable<Product[]> {
    return this.http
      .patch<{ products: Product[] }>(`${environment.apiUrl}/products/bulk-update`, {
        productIds,
        ...payload,
      })
      .pipe(
        map((response) => response.products),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)),
      );
  }

  permanentlyDeleteProducts(productIds: string[], reason: string): Observable<string[]> {
    return this.http
      .request<{ deletedIds: string[] }>('delete', `${environment.apiUrl}/products/bulk-delete`, {
        body: {
          productIds,
          reason,
        },
      })
      .pipe(
        map((response) => response.deletedIds),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)),
      );
  }

  restoreProduct(id: string): Observable<Product> {
    return this.http
      .post<{ product: Product }>(`${environment.apiUrl}/products/${id}/restore`, {})
      .pipe(
        map((response) => response.product),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)),
      );
  }

  updateProduct(id: string, payload: ProductUpdatePayload): Observable<Product> {
    return this.http
      .patch<{ product: Product }>(`${environment.apiUrl}/products/${id}`, payload)
      .pipe(
        map((response) => response.product),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)),
      );
  }

  rejectProduct(id: string, rejectionReason: string): Observable<Product> {
    return this.http
      .patch<{ product: Product }>(`${environment.apiUrl}/products/${id}/reject`, { rejectionReason })
      .pipe(
        map((response) => response.product),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)),
      );
  }

  approveListingReview(id: string): Observable<Product> {
    return this.http
      .patch<{ product: Product }>(`${environment.apiUrl}/products/${id}/review/approve`, {})
      .pipe(
        map((response) => response.product),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)),
      );
  }

  rejectListingReview(id: string, rejectionReason: string): Observable<Product> {
    return this.http
      .patch<{ product: Product }>(`${environment.apiUrl}/products/${id}/review/reject`, {
        rejectionReason,
      })
      .pipe(
        map((response) => response.product),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)),
      );
  }

  getOwnershipTransferSummary(hunterId: string): Observable<ProductOwnershipTransferSummary> {
    return this.http.get<ProductOwnershipTransferSummary>(
      `${environment.apiUrl}/products/ownership-transfer/${hunterId}/summary`,
    );
  }

  transferProductOwnership(payload: {
    sourceHunterId: string;
    targetHunterId: string;
    transferMode: 'all' | 'selected';
    productIds?: string[];
  }): Observable<{ transferred: number; sourceHunterId: string; targetHunterId: string }> {
    return this.http
      .post<{ transferred: number; sourceHunterId: string; targetHunterId: string }>(
        `${environment.apiUrl}/products/ownership-transfer`,
        payload,
      )
      .pipe(tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.products)));
  }
}
