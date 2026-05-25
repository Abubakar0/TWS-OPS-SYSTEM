import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Product, ProductFilters } from '../models/product.models';
import { PageResult } from '../state/query-state.models';

@Injectable({ providedIn: 'root' })
export class ProductAdminApiService {
  constructor(private readonly http: HttpClient) {}

  listProducts(filters: ProductFilters = {}): Observable<PageResult<Product>> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.http
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
      );
  }

  softDeleteProducts(productIds: string[], reason: string): Observable<string[]> {
    return this.http
      .patch<{ deletedIds: string[] }>(`${environment.apiUrl}/products/bulk-delete`, {
        productIds,
        reason,
      })
      .pipe(map((response) => response.deletedIds));
  }

  permanentlyDeleteProducts(productIds: string[], reason: string): Observable<string[]> {
    return this.http
      .request<{ deletedIds: string[] }>('delete', `${environment.apiUrl}/products/bulk-delete`, {
        body: {
          productIds,
          reason,
        },
      })
      .pipe(map((response) => response.deletedIds));
  }

  restoreProduct(id: string): Observable<Product> {
    return this.http
      .post<{ product: Product }>(`${environment.apiUrl}/products/${id}/restore`, {})
      .pipe(map((response) => response.product));
  }
}
