import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

const shouldRetry = (error: HttpErrorResponse): boolean => error.status === 0 || error.status >= 500;

export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') {
    return next(req);
  }

  return next(req).pipe(
    retry({
      count: 1,
      resetOnSuccess: true,
      delay: (error) =>
        shouldRetry(error as HttpErrorResponse) ? timer(300) : throwError(() => error),
    }),
  );
};
