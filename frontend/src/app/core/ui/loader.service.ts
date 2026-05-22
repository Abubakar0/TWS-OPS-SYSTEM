import { Injectable } from '@angular/core';

import { LoadingService } from './loading.service';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  readonly isVisible = this.loading.isVisible;

  constructor(private readonly loading: LoadingService) {}

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
