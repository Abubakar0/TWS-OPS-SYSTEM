import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Team } from '../models/team.models';

@Injectable({ providedIn: 'root' })
export class TeamApiService {
  constructor(private readonly http: HttpClient) {}

  listTeams(search = '') {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http
      .get<{ teams: Team[] }>(`${environment.apiUrl}/teams`, { params })
      .pipe(map((response) => response.teams));
  }

  createTeam(payload: { name: string; description?: string | null; memberIds: string[] }) {
    return this.http
      .post<{ team: Team }>(`${environment.apiUrl}/teams`, payload)
      .pipe(map((response) => response.team));
  }

  updateTeam(id: string, payload: { name: string; description?: string | null; memberIds: string[] }) {
    return this.http
      .patch<{ team: Team }>(`${environment.apiUrl}/teams/${id}`, payload)
      .pipe(map((response) => response.team));
  }

  deleteTeam(id: string) {
    return this.http.delete(`${environment.apiUrl}/teams/${id}`);
  }
}
