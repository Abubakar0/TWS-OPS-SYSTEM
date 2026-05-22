import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Account, AssignedHunter, BulkListedPayload, Product, ProductFilters } from '../models/product.models';

@Injectable({ providedIn: 'root' })
export class ListerApiService {
  constructor(private readonly http: HttpClient) {}

  listQueueProducts(filters: ProductFilters = {}): Observable<Product[]> {
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

  listAssignedHunters(): Observable<AssignedHunter[]> {
    return this.http
      .get<{ hunters: AssignedHunter[] }>(`${environment.apiUrl}/products/assigned-hunters`)
      .pipe(map((response) => response.hunters));
  }

  markBulkListed(payload: BulkListedPayload): Observable<Product[]> {
    return this.http
      .patch<{ products: Product[] }>(`${environment.apiUrl}/products/bulk-listed`, payload)
      .pipe(map((response) => response.products));
  }

  rejectProduct(id: string, rejectionReason: string): Observable<Product> {
    return this.http
      .patch<{ product: Product }>(`${environment.apiUrl}/products/${id}/reject`, { rejectionReason })
      .pipe(map((response) => response.product));
  }
}
