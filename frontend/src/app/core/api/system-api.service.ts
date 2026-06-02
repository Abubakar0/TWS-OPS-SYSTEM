import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { ApiLimitSettings, IpRestrictionSettings, SystemSettingsResponse } from '../models/system.models';
import { RequestCacheService } from '../state/request-cache.service';

@Injectable({ providedIn: 'root' })
export class SystemApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  getSettings(bypassCache = false): Observable<SystemSettingsResponse> {
    const request$ = this.http.get<SystemSettingsResponse>(`${environment.apiUrl}/system/settings`);

    if (bypassCache) {
      this.requestCache.invalidatePrefix(CACHE_NAMESPACE.system);
      return request$;
    }

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.system, 'settings'),
      CACHE_TTL.long,
      () => request$,
    );
  }

  updateApiLimits(payload: ApiLimitSettings): Observable<ApiLimitSettings> {
    return this.http
      .put<{ apiLimits: ApiLimitSettings }>(`${environment.apiUrl}/system/api-limits`, payload)
      .pipe(
        map((response) => response.apiLimits),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.system)),
      );
  }

  updateIpRestriction(payload: IpRestrictionSettings): Observable<IpRestrictionSettings> {
    return this.http
      .put<{ ipRestriction: IpRestrictionSettings }>(`${environment.apiUrl}/system/ip-restriction`, payload)
      .pipe(
        map((response) => response.ipRestriction),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.system)),
      );
  }
}
