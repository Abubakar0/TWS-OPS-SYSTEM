import { inject, Injectable } from '@angular/core';

import { LoadingService } from './loading.service';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  private readonly loading = inject(LoadingService);
  readonly isVisible = this.loading.isVisible;

  beginRequest(scope?: string): void {
    this.loading.beginRequest(scope);
  }

  endRequest(scope?: string): void {
    this.loading.endRequest(scope);
  }

  beginNavigation(): void {
    this.loading.beginNavigation();
  }

  endNavigation(): void {
    this.loading.endNavigation();
  }
}
