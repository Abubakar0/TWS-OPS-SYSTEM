import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, of, tap } from 'rxjs';

import { APP_ROUTES } from '../config/routes';
import { LoginResponse, User, UserRole, normalizeUserRoles, userHasAnyRole, userHasRole } from '../models/auth.models';
import { AuthApiService } from '../api/auth-api.service';

interface JwtPayload {
  exp?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly tokenKey = 'tws_ops_token';
  private readonly userKey = 'tws_ops_user';
  private readonly tokenSignal = signal<string | null>(this.readStoredToken());
  private readonly userSignal = signal<User | null>(this.readStoredUser());
  private readonly initializedSignal = signal(false);

  readonly currentUser = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.tokenSignal() && this.userSignal() && !this.isTokenExpired(this.tokenSignal())));
  readonly sessionInitialized = this.initializedSignal.asReadonly();

  constructor(private readonly authApi: AuthApiService) {}

  login(email: string, password: string) {
    return this.authApi.login(email, password).pipe(
      tap((response) => this.persistSession(response.token, response.user)),
    );
  }

  initializeSession(): void {
    if (this.initializedSignal()) {
      return;
    }

    const token = this.tokenSignal();
    const user = this.userSignal();

    if (!token || !user || this.isTokenExpired(token)) {
      this.clearSession();
      this.initializedSignal.set(true);
      return;
    }

    this.authApi
      .getCurrentUser()
      .pipe(catchError(() => of(null)))
      .subscribe((sessionUser) => {
        if (sessionUser) {
          this.persistSession(token, sessionUser);
        } else {
          this.clearSession();
        }

        this.initializedSignal.set(true);
      });
  }

  logout(): void {
    this.clearSession();
  }

  expireSession(returnUrl?: string): void {
    this.clearSession();

    const destination = returnUrl || this.router.url;
    const queryParams = destination && destination !== '/login' ? { returnUrl: destination } : undefined;

    void this.router.navigate([APP_ROUTES.login], { queryParams });
  }

  token(): string | null {
    const token = this.tokenSignal();

    if (!token) {
      if (this.userSignal()) {
        this.clearSession();
      }

      return null;
    }

    if (this.isTokenExpired(token)) {
      this.clearSession();
      return null;
    }

    return token;
  }

  hasActiveSession(): boolean {
    return Boolean(this.token() && this.userSignal());
  }

  hasRole(roles: readonly UserRole[]): boolean {
    return userHasAnyRole(this.userSignal(), roles);
  }

  hasPermission(permission: keyof NonNullable<User['permissions']>): boolean {
    return Boolean(this.userSignal()?.permissions?.[permission]);
  }

  acceptSession(response: LoginResponse): void {
    this.persistSession(response.token, response.user);
  }

  canAccessUrl(role: UserRole | undefined, url: string | null | undefined): boolean {
    const user = this.userSignal();

    if (!role || !url || !user) {
      return false;
    }

    const path = url.split('?')[0];

    if (!path || path === '/' || path === '/login') {
      return false;
    }

    if (userHasRole(user, 'super_admin')) {
      return (
        path.startsWith('/superadmin') ||
        path.startsWith('/admin') ||
        path.startsWith('/hr') ||
        path.startsWith('/order-processor') ||
        path.startsWith('/hunter') ||
        path.startsWith('/lister') ||
        path.startsWith('/my-hr') ||
        path.startsWith('/team')
      );
    }

    if (path.startsWith('/admin')) {
      return userHasRole(user, 'admin');
    }

    if (path.startsWith('/hr')) {
      return userHasRole(user, 'hr');
    }

    if (path.startsWith('/order-processor')) {
      return userHasRole(user, 'order_processor') || userHasRole(user, 'admin');
    }

    if (path.startsWith('/lister')) {
      return userHasRole(user, 'lister') || userHasRole(user, 'admin');
    }

    if (path.startsWith('/hunter')) {
      return userHasRole(user, 'hunter') || userHasRole(user, 'admin');
    }

    if (path.startsWith('/my-hr')) {
      return true;
    }

    if (path.startsWith('/team')) {
      return true;
    }

    return false;
  }

  resolvePostLoginDestination(role: UserRole | undefined, returnUrl?: string | null): string {
    if (returnUrl && this.canAccessUrl(role, returnUrl)) {
      return returnUrl;
    }

    return this.homeForRole(role);
  }

  homeForRole(role?: UserRole): string {
    const user = this.userSignal();

    if (userHasRole(user, 'super_admin') || role === 'super_admin') {
      return '/superadmin/dashboard';
    }

    if (userHasRole(user, 'admin') || role === 'admin') {
      return '/admin/dashboard';
    }

    if (userHasRole(user, 'hr') || role === 'hr') {
      return '/hr/dashboard';
    }

    if (userHasRole(user, 'lister') || role === 'lister') {
      return '/lister/dashboard';
    }

    if (userHasRole(user, 'order_processor') || role === 'order_processor') {
      return '/order-processor/dashboard';
    }

    if (userHasRole(user, 'hunter') || role === 'hunter') {
      return '/hunter/dashboard';
    }

    const normalizedRoles = normalizeUserRoles(user);

    if (normalizedRoles.includes('super_admin')) {
      return '/superadmin/dashboard';
    }

    if (normalizedRoles.includes('admin')) {
      return '/admin/dashboard';
    }

    if (normalizedRoles.includes('hr')) {
      return '/hr/dashboard';
    }

    if (normalizedRoles.includes('lister')) {
      return '/lister/dashboard';
    }

    if (normalizedRoles.includes('order_processor')) {
      return '/order-processor/dashboard';
    }

    return '/hunter/dashboard';
  }

  private persistSession(token: string, user: User): void {
    const normalizedUser: User = {
      ...user,
      roles: normalizeUserRoles(user),
    };

    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(normalizedUser));
    this.tokenSignal.set(token);
    this.userSignal.set(normalizedUser);
    this.initializedSignal.set(true);
  }

  private clearSession(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }

  private readStoredToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  private readStoredUser(): User | null {
    const value = localStorage.getItem(this.userKey);

    if (!value) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as User;
      return {
        ...parsed,
        roles: normalizeUserRoles(parsed),
      };
    } catch (error) {
      localStorage.removeItem(this.userKey);
      return null;
    }
  }

  private isTokenExpired(token: string | null): boolean {
    const payload = this.parseToken(token);

    if (!payload?.exp) {
      return false;
    }

    return Date.now() >= payload.exp * 1000;
  }

  private parseToken(token: string | null): JwtPayload | null {
    if (!token) {
      return null;
    }

    try {
      const [, payload] = token.split('.');

      if (!payload) {
        return null;
      }

      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(normalized)) as JwtPayload;
    } catch (error) {
      return null;
    }
  }
}
