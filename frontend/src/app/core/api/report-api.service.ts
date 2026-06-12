import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CACHE_NAMESPACE, CACHE_TTL, makeCacheKey } from '../config/cache';
import {
  AccountReportDetails,
  AccountReportRow,
  ActivityReportRow,
  ActivityReportSummary,
  CategoryReportRow,
  ExecutiveReport,
  HrReportBundle,
  MarketplaceReportRow,
  OrderReportDetails,
  OrderReportRow,
  PagedReportResult,
  ProductReportDetails,
  ProductReportRow,
  ReportEventPayload,
  ReportFilters,
  ReportSummary,
  TeamReportRow,
  UserReportRow,
} from '../models/report.models';
import { AdminStats, SuperAdminStats } from '../services/admin.service';
import { RequestCacheService } from '../state/request-cache.service';

const buildParams = (filters: ReportFilters = {}) => {
  let params = new HttpParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params = params.set(key, String(value));
    }
  });

  return params;
};

@Injectable({ providedIn: 'root' })
export class ReportApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly requestCache: RequestCacheService,
  ) {}

  getSummary(filters: ReportFilters = {}): Observable<ReportSummary> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'summary', ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ summary: ReportSummary }>(`${environment.apiUrl}/reports/summary`, {
            params: buildParams(filters),
          })
          .pipe(map((response) => response.summary)),
    );
  }

  getExecutive(filters: ReportFilters = {}): Observable<ExecutiveReport> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'executive', ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ executive: ExecutiveReport }>(`${environment.apiUrl}/reports/executive`, {
            params: buildParams(filters),
          })
          .pipe(map((response) => response.executive)),
    );
  }

  listUsers(filters: ReportFilters = {}): Observable<PagedReportResult<UserReportRow>> {
    return this.listPaged<UserReportRow>('users', filters);
  }

  getUser(id: string, filters: ReportFilters = {}): Observable<UserReportRow> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'users', id, ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ user: UserReportRow }>(`${environment.apiUrl}/reports/users/${id}`, {
            params: buildParams(filters),
          })
          .pipe(map((response) => response.user)),
    );
  }

  listHunters(filters: ReportFilters = {}): Observable<PagedReportResult<UserReportRow>> {
    return this.listPaged<UserReportRow>('hunters', filters);
  }

  getHunter(id: string, filters: ReportFilters = {}): Observable<UserReportRow> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'hunters', id, ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ hunter: UserReportRow }>(`${environment.apiUrl}/reports/hunters/${id}`, {
            params: buildParams(filters),
          })
          .pipe(map((response) => response.hunter)),
    );
  }

  listListers(filters: ReportFilters = {}): Observable<PagedReportResult<UserReportRow>> {
    return this.listPaged<UserReportRow>('listers', filters);
  }

  getLister(id: string, filters: ReportFilters = {}): Observable<UserReportRow> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'listers', id, ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ lister: UserReportRow }>(`${environment.apiUrl}/reports/listers/${id}`, {
            params: buildParams(filters),
          })
          .pipe(map((response) => response.lister)),
    );
  }

  listOrderProcessors(filters: ReportFilters = {}): Observable<PagedReportResult<UserReportRow>> {
    return this.listPaged<UserReportRow>('order-processors', filters);
  }

  getOrderProcessor(id: string, filters: ReportFilters = {}): Observable<UserReportRow> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'order-processors', id, ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ orderProcessor: UserReportRow }>(`${environment.apiUrl}/reports/order-processors/${id}`, {
            params: buildParams(filters),
          })
          .pipe(map((response) => response.orderProcessor)),
    );
  }

  listAdmins(filters: ReportFilters = {}): Observable<PagedReportResult<UserReportRow>> {
    return this.listPaged<UserReportRow>('admins', filters);
  }

  getAdmin(id: string, filters: ReportFilters = {}): Observable<UserReportRow> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'admins', id, ...filters }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ admin: UserReportRow }>(`${environment.apiUrl}/reports/admins/${id}`, {
            params: buildParams(filters),
          })
          .pipe(map((response) => response.admin)),
    );
  }

  listAccounts(filters: ReportFilters = {}): Observable<PagedReportResult<AccountReportRow>> {
    return this.listPaged<AccountReportRow>('accounts', filters);
  }

  getAccount(id: string): Observable<AccountReportDetails> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'accounts', id }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ account: AccountReportDetails }>(`${environment.apiUrl}/reports/accounts/${id}`)
          .pipe(map((response) => response.account)),
    );
  }

  listProducts(filters: ReportFilters = {}): Observable<PagedReportResult<ProductReportRow>> {
    return this.listPaged<ProductReportRow>('products', filters);
  }

  getProduct(id: string): Observable<ProductReportDetails> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'products', id }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<{ product: ProductReportDetails }>(`${environment.apiUrl}/reports/products/${id}`)
          .pipe(map((response) => response.product)),
    );
  }

  listOrders(filters: ReportFilters = {}): Observable<PagedReportResult<OrderReportRow>> {
    return this.listPaged<OrderReportRow>('orders', filters);
  }

  getOrder(id: string): Observable<OrderReportDetails> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'orders', id }),
      CACHE_TTL.medium,
      () =>
        this.http
          .get<OrderReportDetails>(`${environment.apiUrl}/reports/orders/${id}`)
          .pipe(map((response) => response)),
    );
  }

  getHr(filters: ReportFilters = {}): Observable<HrReportBundle> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'hr', ...filters }),
      CACHE_TTL.short,
      () =>
        this.http
          .get<{ hr: HrReportBundle }>(`${environment.apiUrl}/reports/hr`, {
            params: buildParams(filters),
          })
          .pipe(map((response) => response.hr)),
    );
  }

  listTeams(filters: ReportFilters = {}): Observable<PagedReportResult<TeamReportRow>> {
    return this.listPaged<TeamReportRow>('teams', filters);
  }

  listCategories(filters: ReportFilters = {}): Observable<PagedReportResult<CategoryReportRow>> {
    return this.listPaged<CategoryReportRow>('categories', filters);
  }

  listMarketplaces(filters: ReportFilters = {}): Observable<PagedReportResult<MarketplaceReportRow>> {
    return this.listPaged<MarketplaceReportRow>('marketplaces', filters);
  }

  listActivity(filters: ReportFilters = {}): Observable<PagedReportResult<ActivityReportRow> & { summary: ActivityReportSummary }> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint: 'activity', ...filters }),
      CACHE_TTL.short,
      () =>
        this.http.get<PagedReportResult<ActivityReportRow> & { summary: ActivityReportSummary }>(
          `${environment.apiUrl}/reports/activity`,
          {
            params: buildParams(filters),
          },
        ),
    );
  }

  trackEvent(payload: ReportEventPayload) {
    return this.http.post(`${environment.apiUrl}/reports/events`, payload).pipe(
      tap(() => this.requestCache.invalidatePrefix(CACHE_NAMESPACE.audit)),
    );
  }

  // Legacy methods kept for existing report/dashboard code paths while the shared reports UI rolls out.
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

  private listPaged<T>(endpoint: string, filters: ReportFilters = {}): Observable<PagedReportResult<T>> {
    return this.requestCache.getOrCreate(
      makeCacheKey(CACHE_NAMESPACE.reports, { endpoint, ...filters }),
      CACHE_TTL.short,
      () =>
        this.http.get<PagedReportResult<T>>(`${environment.apiUrl}/reports/${endpoint}`, {
          params: buildParams(filters),
        }),
    );
  }
}
