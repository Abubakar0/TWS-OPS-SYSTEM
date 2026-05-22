import { computed, Injectable, signal } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import { ReportApiService } from '../api/report-api.service';
import { AdminStats, SuperAdminStats } from '../services/admin.service';

@Injectable({ providedIn: 'root' })
export class ReportFacade {
  private readonly adminStatsCache = new Map<string, Observable<AdminStats>>();
  private readonly superAdminStatsCache = new Map<string, Observable<SuperAdminStats>>();

  readonly adminStats = signal<AdminStats | null>(null);
  readonly superAdminStats = signal<SuperAdminStats | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly hasAdminStats = computed(() => Boolean(this.adminStats()));
  readonly hasSuperAdminStats = computed(() => Boolean(this.superAdminStats()));

  constructor(private readonly reportsApi: ReportApiService) {}

  loadAdminStats(filters: { from?: string; to?: string; hunterId?: string; listerId?: string } = {}): Observable<AdminStats> {
    const key = JSON.stringify(filters);
    const existing = this.adminStatsCache.get(key);

    if (existing) {
      return existing;
    }

    const request$ = this.reportsApi.getAdminStats(filters).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.adminStatsCache.set(key, request$);
    return request$;
  }

  loadSuperAdminStats(filters: { from?: string; to?: string } = {}): Observable<SuperAdminStats> {
    const key = JSON.stringify(filters);
    const existing = this.superAdminStatsCache.get(key);

    if (existing) {
      return existing;
    }

    const request$ = this.reportsApi
      .getSuperAdminStats(filters)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.superAdminStatsCache.set(key, request$);
    return request$;
  }

  clearCache(): void {
    this.adminStatsCache.clear();
    this.superAdminStatsCache.clear();
  }
}
