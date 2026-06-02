import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly requestCount = signal(0);
  private readonly navigationCount = signal(0);
  private readonly scopedCounts = signal<Record<string, number>>({});

  readonly isVisible = computed(() => this.requestCount() > 0 || this.navigationCount() > 0);

  beginRequest(scope = 'global'): void {
    this.requestCount.update((count) => count + 1);
    this.bumpScope(scope, 1);
  }

  endRequest(scope = 'global'): void {
    this.requestCount.update((count) => Math.max(0, count - 1));
    this.bumpScope(scope, -1);
  }

  beginNavigation(): void {
    this.navigationCount.update((count) => count + 1);
  }

  endNavigation(): void {
    this.navigationCount.update((count) => Math.max(0, count - 1));
  }

  isScopeLoading(scope: string): boolean {
    return (this.scopedCounts()[scope] ?? 0) > 0;
  }

  private bumpScope(scope: string, delta: number): void {
    this.scopedCounts.update((current) => {
      const next = Math.max(0, (current[scope] ?? 0) + delta);
      return next === 0
        ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== scope))
        : { ...current, [scope]: next };
    });
  }
}
