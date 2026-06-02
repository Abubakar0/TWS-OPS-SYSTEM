import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { AdminStats, SuperAdminStats } from '../services/admin.service';
import { RequestCacheService } from '../state/request-cache.service';

@Injectable({ providedIn: 'root' })
export class ReportApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  getAdminStats(filters: { from?: string; to?: string; hunterId?: string; listerId?: string } = {}): Observable<AdminStats> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { scope: 'admin', ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ stats: AdminStats }>(`${environment.apiUrl}/dashboard/admin`, { params })
          .pipe(map((response) => response.stats)),
    );
  }

  getSuperAdminStats(filters: { from?: string; to?: string } = {}): Observable<SuperAdminStats> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { scope: 'super-admin', ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ stats: SuperAdminStats }>(`${environment.apiUrl}/dashboard/super-admin`, { params })
          .pipe(map((response) => response.stats)),
    );
  }
}
