import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { WeeklyReviewStatus } from '../models/product.models';

@Injectable({ providedIn: 'root' })
export class WeeklyReviewApiService {
  constructor(private readonly http: HttpClient) {}

  getStatus() {
    return this.http
      .get<{ status: WeeklyReviewStatus }>(`${environment.apiUrl}/weekly-review/status`)
      .pipe(map((response) => response.status));
  }

  completeReview(notes = '') {
    return this.http
      .post<{ review: WeeklyReviewStatus['review'] }>(`${environment.apiUrl}/weekly-review/complete`, {
        notes,
      })
      .pipe(map((response) => response.review));
  }
}
