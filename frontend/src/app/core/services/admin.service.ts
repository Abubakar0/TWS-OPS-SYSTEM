import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import { HunterAssignment, LoginResponse, User, UserDetails, UserPermissions, UserRole } from '../models/auth.models';
import { OrderStats } from '../models/order.models';
import { Account, HuntingCriteria } from '../models/product.models';
import { RequestCacheService } from '../state/request-cache.service';
import { PageResult } from '../state/query-state.models';

export interface AdminStats {
  hunted: number;
  ready: number;
  rejected: number;
  listed: number;
  averageRoi: number;
  totalProfit: number;
  byHunter: Array<{ id: string; name: string; hunted: number; listed: number }>;
  byLister: Array<{ id: string; name: string; listed: number; rejected: number; assignedHunters: number }>;
  byAccount: Array<{ id: string; name: string; listed: number }>;
  byHunterAccount: Array<{
    hunterId: string;
    hunterName: string;
    accountId: string;
    accountName: string;
    listedCount: number;
  }>;
  daily: Array<{ date: string; hunted: number; listed: number; rejected: number; profit: number; roi: number }>;
  orderStats?: OrderStats;
}

export interface SuperAdminStats {
  totalAdmins: number;
  totalListers: number;
  totalHunters: number;
  activeUsers: number;
  disabledUsers: number;
  deletedUsers: number;
  totalListings: number;
  totalHunting: number;
  rejectedProducts: number;
  systemActivity: number;
  byHunter: Array<{ id: string; name: string; hunted: number; listed: number }>;
  byLister: Array<{ id: string; name: string; listed: number; assignedHunters: number }>;
  byAccount: Array<{ id: string; name: string; listed: number }>;
  orderStats?: OrderStats;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole?: string | null;
  targetName: string | null;
  targetEmail: string | null;
  targetRole?: string | null;
  productTitle?: string | null;
  productAsin?: string | null;
  orderCode?: string | null;
  orderEbayId?: string | null;
  orderProductTitle?: string | null;
  accountName?: string | null;
  details?: Record<string, unknown> | null;
}

export interface PermissionMatrixRow {
  role: UserRole;
  permissions: UserPermissions;
}

export interface UserFilters {
  search?: string;
  includeDeleted?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  listUsers(role?: UserRole, filters: UserFilters = {}) {
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

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.users, { legacy: true, role, ...filters }),
      filters.search ? CACHE_TTL.short : CACHE_TTL.long,
      () =>
        this.http
          .get<{ users: User[] }>(`${environment.apiUrl}/users`, { params })
          .pipe(map((response) => response.users)),
    );
  }

  createUser(payload: {
    name: string;
    email: string;
    password: string;
    roles: UserRole[];
    isActive: boolean;
    permissions?: Partial<UserPermissions>;
  }) {
    return this.http
      .post<{ user: User }>(`${environment.apiUrl}/users`, payload)
      .pipe(
        map((response) => response.user),
        tap(() => this.invalidateUserCaches()),
      );
  }

  updateUser(id: string, payload: Partial<User> & { password?: string }) {
    return this.http
      .patch<{ user: User }>(`${environment.apiUrl}/users/${id}`, payload)
      .pipe(
        map((response) => response.user),
        tap(() => this.invalidateUserCaches()),
      );
  }

  deleteUser(id: string) {
    return this.http
      .delete<{ user: User }>(`${environment.apiUrl}/users/${id}`)
      .pipe(
        map((response) => response.user),
        tap(() => this.invalidateUserCaches()),
      );
  }

  restoreUser(id: string) {
    return this.http
      .post<{ user: User }>(`${environment.apiUrl}/users/${id}/restore`, {})
      .pipe(
        map((response) => response.user),
        tap(() => this.invalidateUserCaches()),
      );
  }

  resetUserPassword(id: string, password?: string) {
    return this.http
      .post<{ user: User }>(`${environment.apiUrl}/users/${id}/reset-password`, { password })
      .pipe(
        map((response) => response.user),
        tap(() => this.invalidateUserCaches()),
      );
  }

  unlockUser(id: string) {
    return this.http
      .post<{ user: User }>(`${environment.apiUrl}/users/${id}/unlock`, {})
      .pipe(
        map((response) => response.user),
        tap(() => this.invalidateUserCaches()),
      );
  }

  getUserDetails(id: string) {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.users, { details: id, legacy: true }),
      CACHE_TTL.short,
      () => this.http.get<UserDetails>(`${environment.apiUrl}/users/${id}/details`),
    );
  }

  impersonateUser(id: string) {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/users/${id}/impersonate`, {})
      .pipe(map((response) => response));
  }

  listAuditLogs(filters: { action?: string; actorUserId?: string; actorRole?: string; targetType?: string; search?: string; from?: string; to?: string } = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.audit, { legacy: true, ...filters }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ logs: AuditLogEntry[] }>(`${environment.apiUrl}/users/audit`, { params })
          .pipe(map((response) => response.logs)),
    );
  }

  getPermissionMatrix() {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.users, 'permission-matrix-legacy'),
      CACHE_TTL.long,
      () =>
        this.http
          .get<{ matrix: PermissionMatrixRow[] }>(`${environment.apiUrl}/users/permissions/matrix`)
          .pipe(map((response) => response.matrix)),
    );
  }

  listAssignments(filters: {
    search?: string;
    status?: 'assigned' | 'unassigned';
    listerId?: string;
    page?: number;
    limit?: number;
  } = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, String(value));
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.users, { assignments: true, ...filters }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ assignments: HunterAssignment[]; page: number; limit: number; total: number; hasMore: boolean }>(
            `${environment.apiUrl}/users/assignments`,
            { params },
          )
          .pipe(
            map(
              (response): PageResult<HunterAssignment> => ({
                items: response.assignments,
                page: response.page,
                limit: response.limit,
                total: response.total,
                hasMore: response.hasMore,
              }),
            ),
          ),
    );
  }

  setHunterLister(hunterId: string, listerId: string | null) {
    return this.http
      .put(`${environment.apiUrl}/users/${hunterId}/lister`, { listerId })
      .pipe(tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.users)));
  }

  listAccounts(includeInactive = false) {
    const params = includeInactive ? new HttpParams().set('includeInactive', 'true') : undefined;
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.accounts, { legacy: true, includeInactive }),
      CACHE_TTL.long,
      () =>
        this.http
          .get<{ accounts: Account[] }>(`${environment.apiUrl}/accounts`, { params })
          .pipe(map((response) => response.accounts)),
    );
  }

  createAccount(payload: { name: string; marketplace: string; isActive: boolean }) {
    return this.http
      .post<{ account: Account }>(`${environment.apiUrl}/accounts`, payload)
      .pipe(
        map((response) => response.account),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.accounts)),
      );
  }

  updateAccount(id: string, payload: Partial<Account>) {
    return this.http
      .patch<{ account: Account }>(`${environment.apiUrl}/accounts/${id}`, payload)
      .pipe(
        map((response) => response.account),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.accounts)),
      );
  }

  setAccountListers(id: string, listerIds: string[]) {
    return this.http
      .put<{ account: Account }>(`${environment.apiUrl}/accounts/${id}/listers`, { listerIds })
      .pipe(
        map((response) => response.account),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.accounts)),
      );
  }

  getCriteria() {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.criteria, 'legacy'),
      CACHE_TTL.long,
      () =>
        this.http
          .get<{ criteria: HuntingCriteria }>(`${environment.apiUrl}/criteria`)
          .pipe(map((response) => response.criteria)),
    );
  }

  updateCriteria(payload: HuntingCriteria) {
    return this.http
      .put<{ criteria: HuntingCriteria }>(`${environment.apiUrl}/criteria`, payload)
      .pipe(
        map((response) => response.criteria),
        tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.criteria)),
      );
  }

  getAdminStats(filters: { from?: string; to?: string; hunterId?: string; listerId?: string; category?: string } = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { legacy: 'admin', ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ stats: AdminStats }>(`${environment.apiUrl}/dashboard/admin`, { params })
          .pipe(map((response) => response.stats)),
    );
  }

  getSuperAdminStats(filters: { from?: string; to?: string } = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { legacy: 'super-admin', ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ stats: SuperAdminStats }>(`${environment.apiUrl}/dashboard/super-admin`, { params })
          .pipe(map((response) => response.stats)),
    );
  }

  private invalidateUserCaches(): void {
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.users);
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.audit);
    this.requestCache.invalidatePrefix(CACHE_NAMESPACE.reports);
  }
}
