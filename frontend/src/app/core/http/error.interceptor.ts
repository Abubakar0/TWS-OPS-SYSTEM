import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { GlobalErrorService } from '../ui/global-error.service';
import { SILENT_HTTP_ERROR } from './http-context.tokens';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const globalErrors = inject(GlobalErrorService);
  const isLoginRequest = req.url.endsWith('/auth/login');
  const isSilent = req.context.get(SILENT_HTTP_ERROR);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const message = globalErrors.mapHttpError(error);
      const isAuthFailure =
        error.status === 401 ||
        (error.status === 403 && String(error.error?.message || '').toLowerCase().includes('disabled'));

      if (isAuthFailure && !isLoginRequest) {
        auth.expireSession(window.location.pathname + window.location.search);
      }

      if (!isSilent && !isLoginRequest && (req.method !== 'GET' || error.status >= 500 || error.status === 0)) {
        globalErrors.notifyHttpError(error, error.status === 403 ? 'warning' : 'error');
      }

      return throwError(() => error);
    }),
  );
};
