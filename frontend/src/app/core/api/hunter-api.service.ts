import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AsinCheckResult, Product, ProductCreatePayload, ProductFilters } from '../models/product.models';

@Injectable({ providedIn: 'root' })
export class HunterApiService {
  constructor(private readonly http: HttpClient) {}

  createProduct(payload: ProductCreatePayload): Observable<Product> {
    return this.http
      .post<{ product: Product }>(`${environment.apiUrl}/products`, payload)
      .pipe(map((response) => response.product));
  }

  checkAsin(asin: string): Observable<AsinCheckResult> {
    const params = new HttpParams().set('asin', asin);
    return this.http.get<AsinCheckResult>(`${environment.apiUrl}/products/check-asin`, { params });
  }

  listProducts(filters: ProductFilters = {}): Observable<Product[]> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.http
      .get<{ products: Product[] }>(`${environment.apiUrl}/products`, { params })
      .pipe(map((response) => response.products));
  }
}
