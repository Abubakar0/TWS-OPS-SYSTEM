import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Product, ProductCreatePayload } from '../models/product.models';

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(private readonly http: HttpClient) {}

  listProducts() {
    return this.http
      .get<{ products: Product[] }>(`${environment.apiUrl}/products`)
      .pipe(map((response) => response.products));
  }

  createProduct(payload: ProductCreatePayload) {
    return this.http
      .post<{ product: Product }>(`${environment.apiUrl}/products`, payload)
      .pipe(map((response) => response.product));
  }
}
