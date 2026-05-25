import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface HunterDashboardFilters {
  from?: string;
  to?: string;
}

export interface HunterAccountStat {
  accountId: string;
  accountName: string;
  listedCount: number;
}

export interface HunterAccountListingStat {
  hunterId: string;
  hunterName: string;
  accountId: string;
  accountName: string;
  listedCount: number;
}

export interface HunterListerStat {
  listerId: string;
  listerName: string;
  productCount: number;
}

export interface HunterDashboardStats {
  totalHunted: number;
  approved: number;
  pending: number;
  rejected: number;
  listed: number;
  excellent: number;
  good: number;
  average: number;
  byAccount: HunterAccountStat[];
  byLister: HunterListerStat[];
}

export interface ListerHunterStat {
  hunterId: string;
  hunterName: string;
  listedCount: number;
  rejectedCount?: number;
}

export interface ListerDashboardStats {
  totalListed: number;
  rejected: number;
  byHunter: ListerHunterStat[];
  byAccount: HunterAccountStat[];
}

export interface ListerHunterAccountUsage {
  accountId: string;
  accountName: string;
  hunterId: string;
  hunterName: string;
  listedCount: number;
  lastListedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private readonly http: HttpClient) {}

  getHunterStats(filters: HunterDashboardFilters = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.http
      .get<{ stats: HunterDashboardStats }>(`${environment.apiUrl}/dashboard/hunter`, { params })
      .pipe(map((response) => response.stats));
  }

  getListerStats(filters: HunterDashboardFilters = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.http
      .get<{ stats: ListerDashboardStats }>(`${environment.apiUrl}/dashboard/lister`, { params })
      .pipe(map((response) => response.stats));
  }

  getListerHunterAccountUsage(filters: { hunterId?: string; listerId?: string } = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.http
      .get<{ rows: ListerHunterAccountUsage[] }>(`${environment.apiUrl}/dashboard/lister-account-usage`, {
        params,
      })
      .pipe(map((response) => response.rows));
  }
}
