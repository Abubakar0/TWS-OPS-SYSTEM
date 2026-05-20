import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { ToastService } from '../ui/toast.service';
import { SILENT_HTTP_ERROR } from './http-context.tokens';

const mapErrorMessage = (error: HttpErrorResponse): string => {
  const backendMessage = String(error.error?.message || '').trim();

  if (error.status === 0) {
    return 'Network connection was lost. Please check the server connection and try again.';
  }

  if (backendMessage) {
    return backendMessage;
  }

  switch (error.status) {
    case 400:
      return 'The request could not be processed. Please review the entered values.';
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return 'You do not have permission to perform that action.';
    case 404:
      return 'The requested record could not be found.';
    case 409:
      return 'A conflicting record already exists.';
    case 422:
      return 'Please review the highlighted fields and try again.';
    default:
      return 'Something went wrong on the server. Please try again.';
  }
};

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const isLoginRequest = req.url.endsWith('/auth/login');
  const isSilent = req.context.get(SILENT_HTTP_ERROR);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const message = mapErrorMessage(error);
      const isAuthFailure =
        error.status === 401 ||
        (error.status === 403 && String(error.error?.message || '').toLowerCase().includes('disabled'));

      if (isAuthFailure && !isLoginRequest) {
        auth.expireSession(window.location.pathname + window.location.search);
      }

      if (!isSilent && !isLoginRequest && (req.method !== 'GET' || error.status >= 500 || error.status === 0)) {
        if (error.status === 403) {
          toast.warning(message);
        } else {
          toast.error(message);
        }
      }

      return throwError(() => error);
    }),
  );
};
