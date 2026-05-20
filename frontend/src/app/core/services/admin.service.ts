import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { HunterAssignment, User, UserRole } from '../models/auth.models';
import { Account, HuntingCriteria } from '../models/product.models';

export interface AdminStats {
  hunted: number;
  ready: number;
  rejected: number;
  listed: number;
  averageRoi: number;
  totalProfit: number;
  byHunter: Array<{ id: string; name: string; hunted: number; listed: number }>;
  byLister: Array<{ id: string; name: string; listed: number; assignedHunters: number }>;
  byAccount: Array<{ id: string; name: string; listed: number }>;
  daily: Array<{ date: string; hunted: number; listed: number }>;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private readonly http: HttpClient) {}

  listUsers(role?: UserRole) {
    const params = role ? new HttpParams().set('role', role) : undefined;
    return this.http
      .get<{ users: User[] }>(`${environment.apiUrl}/users`, { params })
      .pipe(map((response) => response.users));
  }

  createUser(payload: { name: string; email: string; password: string; role: UserRole; isActive: boolean }) {
    return this.http
      .post<{ user: User }>(`${environment.apiUrl}/users`, payload)
      .pipe(map((response) => response.user));
  }

  updateUser(id: string, payload: Partial<User> & { password?: string }) {
    return this.http
      .patch<{ user: User }>(`${environment.apiUrl}/users/${id}`, payload)
      .pipe(map((response) => response.user));
  }

  listAssignments() {
    return this.http
      .get<{ assignments: HunterAssignment[] }>(`${environment.apiUrl}/users/assignments`)
      .pipe(map((response) => response.assignments));
  }

  setHunterLister(hunterId: string, listerId: string | null) {
    return this.http.put(`${environment.apiUrl}/users/${hunterId}/lister`, { listerId });
  }

  listAccounts(includeInactive = false) {
    const params = includeInactive ? new HttpParams().set('includeInactive', 'true') : undefined;
    return this.http
      .get<{ accounts: Account[] }>(`${environment.apiUrl}/accounts`, { params })
      .pipe(map((response) => response.accounts));
  }

  createAccount(payload: { name: string; marketplace: string; isActive: boolean }) {
    return this.http
      .post<{ account: Account }>(`${environment.apiUrl}/accounts`, payload)
      .pipe(map((response) => response.account));
  }

  updateAccount(id: string, payload: Partial<Account>) {
    return this.http
      .patch<{ account: Account }>(`${environment.apiUrl}/accounts/${id}`, payload)
      .pipe(map((response) => response.account));
  }

  getCriteria() {
    return this.http
      .get<{ criteria: HuntingCriteria }>(`${environment.apiUrl}/criteria`)
      .pipe(map((response) => response.criteria));
  }

  updateCriteria(payload: HuntingCriteria) {
    return this.http
      .put<{ criteria: HuntingCriteria }>(`${environment.apiUrl}/criteria`, payload)
      .pipe(map((response) => response.criteria));
  }

  getAdminStats(filters: { from?: string; to?: string; hunterId?: string; listerId?: string } = {}) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.http
      .get<{ stats: AdminStats }>(`${environment.apiUrl}/dashboard/admin`, { params })
      .pipe(map((response) => response.stats));
  }
}
