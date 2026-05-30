import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { ProductCategory } from '../models/product.models';
import { RequestCacheService } from '../state/request-cache.service';

@Injectable({ providedIn: 'root' })
export class ProductCategoryApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  listCategories(includeInactive = false): Observable<ProductCategory[]> {
    let params = new HttpParams();

    if (includeInactive) {
      params = params.set('includeInactive', 'true');
    }

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.categories, { includeInactive }),
      CACHE_TTL.long,
      () =>
        this.http
          .get<{ categories: ProductCategory[] }>(`${environment.apiUrl}/product-categories`, {
            params,
          })
          .pipe(map((response) => response.categories)),
    );
  }

  createCategory(payload: { name: string; active?: boolean }): Observable<ProductCategory[]> {
    return this.http
      .post<{ categories: ProductCategory[] }>(`${environment.apiUrl}/product-categories`, payload)
      .pipe(
        map((response) => response.categories),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.categories)),
      );
  }

  updateCategory(
    id: string,
    payload: { name?: string; active?: boolean; sortOrder?: number },
  ): Observable<ProductCategory[]> {
    return this.http
      .patch<{ categories: ProductCategory[] }>(
        `${environment.apiUrl}/product-categories/${id}`,
        payload,
      )
      .pipe(
        map((response) => response.categories),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.categories)),
      );
  }

  deleteCategory(id: string): Observable<ProductCategory[]> {
    return this.http
      .delete<{ categories: ProductCategory[] }>(`${environment.apiUrl}/product-categories/${id}`)
      .pipe(
        map((response) => response.categories),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.categories)),
      );
  }
}
