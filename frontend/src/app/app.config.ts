import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { loadingInterceptor } from './core/http/loading.interceptor';
import { retryInterceptor } from './core/http/retry.interceptor';
import { timeoutInterceptor } from './core/http/timeout.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    importProvidersFrom(MatDialogModule, MatSnackBarModule),
    provideHttpClient(
      withInterceptors([loadingInterceptor, retryInterceptor, timeoutInterceptor, authInterceptor, errorInterceptor]),
    ),
    provideRouter(routes)
  ]
};
