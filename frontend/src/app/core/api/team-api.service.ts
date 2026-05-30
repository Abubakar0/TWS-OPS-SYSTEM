import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { Team } from '../models/team.models';
import { RequestCacheService } from '../state/request-cache.service';

@Injectable({ providedIn: 'root' })
export class TeamApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  listTeams(search = '') {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.teams, { search }),
      search ? CACHE_TTL.short : CACHE_TTL.medium,
      () =>
        this.http
          .get<{ teams: Team[] }>(`${environment.apiUrl}/teams`, { params })
          .pipe(map((response) => response.teams)),
    );
  }

  createTeam(payload: { name: string; description?: string | null; memberIds: string[] }) {
    return this.http
      .post<{ team: Team }>(`${environment.apiUrl}/teams`, payload)
      .pipe(
        map((response) => response.team),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.teams)),
      );
  }

  updateTeam(id: string, payload: { name: string; description?: string | null; memberIds: string[] }) {
    return this.http
      .patch<{ team: Team }>(`${environment.apiUrl}/teams/${id}`, payload)
      .pipe(
        map((response) => response.team),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.teams)),
      );
  }

  deleteTeam(id: string) {
    return this.http
      .delete(`${environment.apiUrl}/teams/${id}`)
      .pipe(tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.teams)));
  }
}
