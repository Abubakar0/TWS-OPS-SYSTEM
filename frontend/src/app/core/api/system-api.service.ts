import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiLimitSettings, IpRestrictionSettings, SystemSettingsResponse } from '../models/system.models';

@Injectable({ providedIn: 'root' })
export class SystemApiService {
  constructor(private readonly http: HttpClient) {}

  getSettings(): Observable<SystemSettingsResponse> {
    return this.http.get<SystemSettingsResponse>(`${environment.apiUrl}/system/settings`);
  }

  updateApiLimits(payload: ApiLimitSettings): Observable<ApiLimitSettings> {
    return this.http
      .put<{ apiLimits: ApiLimitSettings }>(`${environment.apiUrl}/system/api-limits`, payload)
      .pipe(map((response) => response.apiLimits));
  }

  updateIpRestriction(payload: IpRestrictionSettings): Observable<IpRestrictionSettings> {
    return this.http
      .put<{ ipRestriction: IpRestrictionSettings }>(`${environment.apiUrl}/system/ip-restriction`, payload)
      .pipe(map((response) => response.ipRestriction));
  }
}
