import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, take } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ListerApiService } from '../api/lister-api.service';
import { SystemApiService } from '../api/system-api.service';
import { AuthService } from '../auth/auth.service';
import { User, userHasRole } from '../models/auth.models';
import { AssignedHunter, HuntingCriteria, Account } from '../models/product.models';
import { ApiLimitSettings, IpRestrictionSettings } from '../models/system.models';
import { ReferenceDataService } from './reference-data.service';

interface SessionSnapshot {
  userId: string;
  role: string;
  assignedHunters: AssignedHunter[];
  assignedAccounts: Account[];
  criteria: HuntingCriteria | null;
  apiLimits: ApiLimitSettings | null;
  ipRestriction: IpRestrictionSettings | null;
  dashboardPreferences: Record<string, string>;
}

const SESSION_CACHE_KEY = 'tws_session_context';

@Injectable({ providedIn: 'root' })
export class SessionCacheService {
  private readonly auth = inject(AuthService);
  private readonly referenceData = inject(ReferenceDataService);
  private readonly listerApi = inject(ListerApiService);
  private readonly systemApi = inject(SystemApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly hydratedUserId = signal('');
  private readonly assignedHuntersSignal = signal<AssignedHunter[]>([]);
  private readonly assignedAccountsSignal = signal<Account[]>([]);
  private readonly criteriaSignal = signal<HuntingCriteria | null>(null);
  private readonly apiLimitsSignal = signal<ApiLimitSettings | null>(null);
  private readonly ipRestrictionSignal = signal<IpRestrictionSettings | null>(null);
  private readonly dashboardPreferencesSignal = signal<Record<string, string>>({});

  readonly assignedHunters = this.assignedHuntersSignal.asReadonly();
  readonly assignedAccounts = this.assignedAccountsSignal.asReadonly();
  readonly criteria = this.criteriaSignal.asReadonly();
  readonly apiLimits = this.apiLimitsSignal.asReadonly();
  readonly ipRestriction = this.ipRestrictionSignal.asReadonly();
  readonly dashboardPreferences = this.dashboardPreferencesSignal.asReadonly();
  readonly hydrated = computed(
    () => Boolean(this.auth.currentUser()) && this.hydratedUserId() === this.auth.currentUser()?.id,
  );

  constructor() {
    const snapshot = this.readSnapshot();

    if (snapshot) {
      this.hydratedUserId.set(snapshot.userId);
      this.assignedHuntersSignal.set(snapshot.assignedHunters);
      this.assignedAccountsSignal.set(snapshot.assignedAccounts);
      this.criteriaSignal.set(snapshot.criteria);
      this.apiLimitsSignal.set(snapshot.apiLimits);
      this.ipRestrictionSignal.set(snapshot.ipRestriction);
      this.dashboardPreferencesSignal.set(snapshot.dashboardPreferences);
    }
  }

  hydrate(): void {
    const user = this.auth.currentUser();

    if (!user) {
      this.clear();
      return;
    }

    if (this.hydratedUserId() === user.id) {
      return;
    }

    const shouldLoadCriteria = userHasRole(user, 'hunter') || userHasRole(user, 'admin') || userHasRole(user, 'super_admin');
    const shouldLoadAccounts =
      userHasRole(user, 'lister') ||
      userHasRole(user, 'order_processor') ||
      userHasRole(user, 'admin') ||
      userHasRole(user, 'super_admin');
    const includeInactiveAccounts = userHasRole(user, 'admin') || userHasRole(user, 'super_admin');
    const shouldLoadSystem = userHasRole(user, 'admin') || userHasRole(user, 'super_admin');
    const assignedHunters$ =
      userHasRole(user, 'lister') ? this.listerApi.listAssignedHunters() : of([] as AssignedHunter[]);
    const systemSettings$ = shouldLoadSystem
      ? this.systemApi.getSettings().pipe(catchError(() => of(null)))
      : of(null);
    const criteria$ = shouldLoadCriteria
      ? this.referenceData.loadCriteriaOnce().pipe(take(1), catchError(() => of(null)))
      : of(null);
    const accounts$ = shouldLoadAccounts
      ? this.referenceData
          .getAccounts(includeInactiveAccounts)
          .pipe(take(1), catchError(() => of([] as Account[])))
      : of([] as Account[]);

    forkJoin({
      criteria: criteria$,
      accounts: accounts$,
      assignedHunters: assignedHunters$.pipe(take(1), catchError(() => of([] as AssignedHunter[]))),
      systemSettings: systemSettings$,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ criteria, accounts, assignedHunters, systemSettings }) => {
        this.hydratedUserId.set(user.id);
        this.criteriaSignal.set(criteria);
        this.assignedAccountsSignal.set(accounts);
        this.assignedHuntersSignal.set(assignedHunters);
        this.apiLimitsSignal.set(systemSettings?.apiLimits || null);
        this.ipRestrictionSignal.set(systemSettings?.ipRestriction || null);
        this.writeSnapshot(user);
      });
  }

  clear(): void {
    this.hydratedUserId.set('');
    this.assignedHuntersSignal.set([]);
    this.assignedAccountsSignal.set([]);
    this.criteriaSignal.set(null);
    this.apiLimitsSignal.set(null);
    this.ipRestrictionSignal.set(null);
    this.dashboardPreferencesSignal.set({});
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  }

  setDashboardPreference(key: string, value: string): void {
    const next = { ...this.dashboardPreferencesSignal(), [key]: value };
    this.dashboardPreferencesSignal.set(next);

    const user = this.auth.currentUser();

    if (user) {
      this.writeSnapshot(user);
    }
  }

  getDashboardPreference(key: string): string | null {
    return this.dashboardPreferencesSignal()[key] || null;
  }

  private writeSnapshot(user: User): void {
    const snapshot: SessionSnapshot = {
      userId: user.id,
      role: user.role,
      assignedHunters: this.assignedHuntersSignal(),
      assignedAccounts: this.assignedAccountsSignal(),
      criteria: this.criteriaSignal(),
      apiLimits: this.apiLimitsSignal(),
      ipRestriction: this.ipRestrictionSignal(),
      dashboardPreferences: this.dashboardPreferencesSignal(),
    };

    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(snapshot));
  }

  private readSnapshot(): SessionSnapshot | null {
    const value = sessionStorage.getItem(SESSION_CACHE_KEY);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as SessionSnapshot;
    } catch {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
  }
}
