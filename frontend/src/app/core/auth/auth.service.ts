import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { LoginResponse, User, UserRole } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'tws_ops_token';
  private readonly userKey = 'tws_ops_user';
  private readonly userSignal = signal<User | null>(this.readStoredUser());

  readonly currentUser = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.token() && this.currentUser()));

  constructor(private readonly http: HttpClient) {}

  login(email: string, password: string) {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      tap((response) => {
        localStorage.setItem(this.tokenKey, response.token);
        localStorage.setItem(this.userKey, JSON.stringify(response.user));
        this.userSignal.set(response.user);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.userSignal.set(null);
  }

  token(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  homeForRole(role?: UserRole): string {
    if (role === 'admin') {
      return '/admin';
    }

    if (role === 'lister') {
      return '/lister';
    }

    return '/hunter';
  }

  private readStoredUser(): User | null {
    const value = localStorage.getItem(this.userKey);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as User;
    } catch (error) {
      localStorage.removeItem(this.userKey);
      return null;
    }
  }
}
