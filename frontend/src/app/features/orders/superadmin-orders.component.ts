import { ChangeDetectionStrategy, Component } from '@angular/core';

import { OrdersWorkspaceComponent } from './orders-workspace.component';

@Component({
  selector: 'app-superadmin-orders',
  standalone: true,
  imports: [OrdersWorkspaceComponent],
  template: `<app-orders-workspace [mode]="'admin'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminOrdersComponent {}
