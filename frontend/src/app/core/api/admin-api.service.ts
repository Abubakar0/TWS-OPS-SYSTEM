import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { LoginResponse, User, UserPermissions, UserRole } from '../models/auth.models';
import { HuntingCriteria } from '../models/product.models';
import { PageResult } from '../state/query-state.models';
import { AuditLogEntry, PermissionMatrixRow, UserFilters } from '../services/admin.service';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  constructor(private readonly http: HttpClient) {}

  listUsers(
    role?: UserRole,
    filters: UserFilters & { status?: string; page?: number; limit?: number } = {},
  ): Observable<PageResult<User>> {
    let params = new HttpParams();

    if (role) {
      params = params.set('role', role);
    }

    if (filters.search) {
      params = params.set('search', filters.search);
    }

    if (filters.includeDeleted) {
      params = params.set('includeDeleted', 'true');
    }

    if (filters.status) {
      params = params.set('status', filters.status);
    }

    if (filters.page) {
      params = params.set('page', String(filters.page));
    }

    if (filters.limit) {
      params = params.set('limit', String(filters.limit));
    }

    return this.http
      .get<{ users: User[]; page: number; limit: number; total: number; hasMore: boolean }>(
        `${environment.apiUrl}/users`,
        { params },
      )
      .pipe(
        map((response) => ({
          items: response.users,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.hasMore,
        })),
      );
  }

  createUser(payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    isActive: boolean;
    permissions?: Partial<UserPermissions>;
  }): Observable<User> {
    return this.http
      .post<{ user: User }>(`${environment.apiUrl}/users`, payload)
      .pipe(map((response) => response.user));
  }

  updateUser(id: string, payload: Partial<User> & { password?: string }): Observable<User> {
    return this.http
      .patch<{ user: User }>(`${environment.apiUrl}/users/${id}`, payload)
      .pipe(map((response) => response.user));
  }

  resetUserPassword(id: string, password?: string): Observable<User> {
    return this.http
      .post<{ user: User }>(`${environment.apiUrl}/users/${id}/reset-password`, { password })
      .pipe(map((response) => response.user));
  }

  impersonateUser(id: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/users/${id}/impersonate`, {});
  }

  listAuditLogs(filters: { action?: string; actorUserId?: string; actorRole?: string; targetType?: string; search?: string; from?: string; to?: string; page?: number; limit?: number } = {}): Observable<PageResult<AuditLogEntry>> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.http
      .get<{ logs: AuditLogEntry[]; page: number; limit: number; total: number; hasMore: boolean }>(
        `${environment.apiUrl}/users/audit`,
        { params },
      )
      .pipe(
        map((response) => ({
          items: response.logs,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.hasMore,
        })),
      );
  }

  getPermissionMatrix(): Observable<PermissionMatrixRow[]> {
    return this.http
      .get<{ matrix: PermissionMatrixRow[] }>(`${environment.apiUrl}/users/permissions/matrix`)
      .pipe(map((response) => response.matrix));
  }

  getCriteria(): Observable<HuntingCriteria> {
    return this.http
      .get<{ criteria: HuntingCriteria }>(`${environment.apiUrl}/criteria`)
      .pipe(map((response) => response.criteria));
  }

  updateCriteria(payload: HuntingCriteria): Observable<HuntingCriteria> {
    return this.http
      .put<{ criteria: HuntingCriteria }>(`${environment.apiUrl}/criteria`, payload)
      .pipe(map((response) => response.criteria));
  }
}
