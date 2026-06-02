import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WorkspaceSyncService {
  readonly productsVersion = signal(0);
  readonly settingsVersion = signal(0);
  readonly usersVersion = signal(0);
  readonly ordersVersion = signal(0);
  readonly changeRequestsVersion = signal(0);

  notifyProductsChanged(): void {
    this.productsVersion.update((value) => value + 1);
  }

  notifySettingsChanged(): void {
    this.settingsVersion.update((value) => value + 1);
  }

  notifyUsersChanged(): void {
    this.usersVersion.update((value) => value + 1);
  }

  notifyOrdersChanged(): void {
    this.ordersVersion.update((value) => value + 1);
  }

  notifyChangeRequestsChanged(): void {
    this.changeRequestsVersion.update((value) => value + 1);
  }
}
