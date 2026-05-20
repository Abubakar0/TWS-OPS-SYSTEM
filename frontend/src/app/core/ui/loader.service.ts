import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  private readonly requestCount = signal(0);
  private readonly navigationCount = signal(0);

  readonly isVisible = computed(() => this.requestCount() > 0 || this.navigationCount() > 0);

  beginRequest(): void {
    this.requestCount.update((count) => count + 1);
  }

  endRequest(): void {
    this.requestCount.update((count) => Math.max(0, count - 1));
  }

  beginNavigation(): void {
    this.navigationCount.update((count) => count + 1);
  }

  endNavigation(): void {
    this.navigationCount.update((count) => Math.max(0, count - 1));
  }
}
