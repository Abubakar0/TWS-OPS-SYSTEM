import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';

import { LoadingService } from '../ui/loading.service';
import { SKIP_GLOBAL_LOADER } from './http-context.tokens';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loader = inject(LoadingService);

  if (req.context.get(SKIP_GLOBAL_LOADER)) {
    return next(req);
  }

  loader.beginRequest('http');

  return next(req).pipe(finalize(() => loader.endRequest('http')));
};
