import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AsinCheckResult,
  AssignedHunter,
  BulkListedPayload,
  Product,
  ProductCreatePayload,
  ProductFilters,
} from '../models/product.models';

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(private readonly http: HttpClient) {}

  listProducts(filters: ProductFilters = {}) {
    const params = Object.entries(filters).reduce((acc, [key, value]) => {
      if (value) {
        acc.set(key, String(value));
      }

      return acc;
    }, new URLSearchParams());

    const query = params.toString();
    return this.http
      .get<{ products: Product[] }>(`${environment.apiUrl}/products${query ? `?${query}` : ''}`)
      .pipe(map((response) => response.products));
  }

  createProduct(payload: ProductCreatePayload) {
    return this.http
      .post<{ product: Product }>(`${environment.apiUrl}/products`, payload)
      .pipe(map((response) => response.product));
  }

  checkAsin(asin: string) {
    const params = new URLSearchParams();
    params.set('asin', asin);

    return this.http.get<AsinCheckResult>(`${environment.apiUrl}/products/check-asin?${params.toString()}`);
  }

  listAssignedHunters() {
    return this.http
      .get<{ hunters: AssignedHunter[] }>(`${environment.apiUrl}/products/assigned-hunters`)
      .pipe(map((response) => response.hunters));
  }

  markBulkListed(payload: BulkListedPayload) {
    return this.http
      .patch<{ products: Product[] }>(`${environment.apiUrl}/products/bulk-listed`, payload)
      .pipe(map((response) => response.products));
  }

  rejectProduct(id: string, rejectionReason: string) {
    return this.http
      .patch<{ product: Product }>(`${environment.apiUrl}/products/${id}/reject`, { rejectionReason })
      .pipe(map((response) => response.product));
  }
}
