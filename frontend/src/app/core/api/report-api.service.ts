import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AdminStats, SuperAdminStats } from '../services/admin.service';

@Injectable({ providedIn: 'root' })
export class ReportApiService {
  constructor(private readonly http: HttpClient) {}

  getAdminStats(filters: { from?: string; to?: string; hunterId?: string; listerId?: string } = {}): Observable<AdminStats> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.http
      .get<{ stats: AdminStats }>(`${environment.apiUrl}/dashboard/admin`, { params })
      .pipe(map((response) => response.stats));
  }

  getSuperAdminStats(filters: { from?: string; to?: string } = {}): Observable<SuperAdminStats> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.http
      .get<{ stats: SuperAdminStats }>(`${environment.apiUrl}/dashboard/super-admin`, { params })
      .pipe(map((response) => response.stats));
  }
}
