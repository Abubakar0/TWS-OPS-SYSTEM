import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';

import { LoaderService } from '../ui/loader.service';
import { SKIP_GLOBAL_LOADER } from './http-context.tokens';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loader = inject(LoaderService);

  if (req.context.get(SKIP_GLOBAL_LOADER)) {
    return next(req);
  }

  loader.beginRequest();

  return next(req).pipe(finalize(() => loader.endRequest()));
};
