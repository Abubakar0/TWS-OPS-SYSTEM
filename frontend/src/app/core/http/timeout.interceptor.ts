import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { timeout, throwError } from 'rxjs';

const REQUEST_TIMEOUT_MS = 15000;

export const timeoutInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    timeout({
      first: REQUEST_TIMEOUT_MS,
      with: () =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: 0,
              statusText: 'Request Timeout',
              url: req.url,
              error: {
                message:
                  'The server did not respond in time. Please verify that the backend is running and reachable.',
              },
            }),
        ),
    }),
  );
