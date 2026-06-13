import { Injectable } from '@angular/core';
import { Observable, defer, tap, shareReplay, throwError } from 'rxjs';

interface CacheEntry<T> {
  expiresAt: number;
  stream$: Observable<T>;
}

interface FailedEntry {
  expiresAt: number;
  error: unknown;
}

@Injectable({ providedIn: 'root' })
export class RequestCacheService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly failedRequests = new Map<string, FailedEntry>();
  private readonly failureCooldownMs = 15_000;

  getOrCreate<T>(key: string, ttlMs: number, factory: () => Observable<T>): Observable<T> {
    const now = Date.now();
    const existing = this.cache.get(key);
    const failed = this.failedRequests.get(key);

    if (failed && failed.expiresAt > now) {
      return throwError(() => failed.error);
    }

    if (failed) {
      this.failedRequests.delete(key);
    }

    if (existing && existing.expiresAt > now) {
      return existing.stream$ as Observable<T>;
    }

    const stream$ = defer(factory).pipe(
      tap({
        next: () => this.failedRequests.delete(key),
        error: (error) => {
          this.cache.delete(key);
          this.failedRequests.set(key, {
            expiresAt: Date.now() + this.failureCooldownMs,
            error,
          });
        },
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.cache.set(key, {
      expiresAt: now + ttlMs,
      stream$,
    });

    return stream$;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
    this.failedRequests.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
    for (const key of this.failedRequests.keys()) {
      if (key.startsWith(prefix)) {
        this.failedRequests.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
    this.failedRequests.clear();
  }
}
