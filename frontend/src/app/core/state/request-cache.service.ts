import { Injectable } from '@angular/core';
import { Observable, defer, tap, shareReplay } from 'rxjs';

interface CacheEntry<T> {
  expiresAt: number;
  stream$: Observable<T>;
}

@Injectable({ providedIn: 'root' })
export class RequestCacheService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  getOrCreate<T>(key: string, ttlMs: number, factory: () => Observable<T>): Observable<T> {
    const now = Date.now();
    const existing = this.cache.get(key);

    if (existing && existing.expiresAt > now) {
      return existing.stream$ as Observable<T>;
    }

    const stream$ = defer(factory).pipe(
      tap({
        error: () => this.cache.delete(key),
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
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
