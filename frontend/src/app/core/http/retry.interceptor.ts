import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

import { HTTP_RETRY_COUNT } from './http-context.tokens';

const shouldRetry = (error: HttpErrorResponse): boolean =>
  error.status === 0 || [502, 503, 504].includes(error.status);

export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  const retryCount = Math.max(0, Number(req.context.get(HTTP_RETRY_COUNT) || 0));

  if (req.method !== 'GET' || retryCount === 0) {
    return next(req);
  }

  return next(req).pipe(
    retry({
      count: retryCount,
      resetOnSuccess: true,
      delay: (error) =>
        shouldRetry(error as HttpErrorResponse) ? timer(300) : throwError(() => error),
    }),
  );
};
