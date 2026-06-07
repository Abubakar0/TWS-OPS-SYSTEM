import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { UserPermissionKey, UserRole, isTrainingHunterUser, userHasAnyRole } from '../models/auth.models';

const createLoginRedirect = (router: Router, returnUrl: string) =>
  {
    const browserUrl = `${window.location.pathname}${window.location.search}`;
    const resolvedReturnUrl =
      returnUrl && returnUrl !== '/' && returnUrl !== '/login'
        ? returnUrl
        : browserUrl && browserUrl !== '/' && !browserUrl.startsWith('/login')
          ? browserUrl
          : returnUrl;

    return router.createUrlTree(['/login'], {
      queryParams:
        resolvedReturnUrl && resolvedReturnUrl !== '/login' ? { returnUrl: resolvedReturnUrl } : undefined,
    });
  };

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.hasActiveSession()) {
    return true;
  }

  return createLoginRedirect(router, state.url);
};

export const roleGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const roles = route.data['roles'] as UserRole[];

  if (!auth.hasActiveSession()) {
    return createLoginRedirect(router, state.url);
  }

  if (auth.hasRole(roles)) {
    return true;
  }

  return router.createUrlTree([auth.homeForRole(auth.currentUser()?.role)]);
};

export const dashboardRedirectGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.hasActiveSession()) {
    return createLoginRedirect(router, state.url);
  }

  return router.createUrlTree([auth.homeForRole(auth.currentUser()?.role)]);
};

export const permissionGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const permissions = (route.data['permissions'] || []) as UserPermissionKey[];

  if (!auth.hasActiveSession()) {
    return createLoginRedirect(router, state.url);
  }

  if (permissions.every((permission) => auth.hasPermission(permission))) {
    return true;
  }

  return router.createUrlTree([auth.homeForRole(auth.currentUser()?.role)]);
};

export const trainingHunterGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser();
  const allowTraining = route.data['allowTraining'] !== false;

  if (!auth.hasActiveSession()) {
    return createLoginRedirect(router, state.url);
  }

  if (!isTrainingHunterUser(user) || userHasAnyRole(user, ['admin', 'super_admin'])) {
    return true;
  }

  if (state.url.startsWith('/hunter/submission') && !user?.trainingRulesAcknowledgedAt) {
    return router.createUrlTree(['/hunter/rules']);
  }

  if (allowTraining) {
    return true;
  }

  return router.createUrlTree(['/hunter/rules']);
};
