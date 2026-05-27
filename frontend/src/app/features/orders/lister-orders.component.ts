import { ChangeDetectionStrategy, Component } from '@angular/core';

import { OrdersWorkspaceComponent } from './orders-workspace.component';

@Component({
  selector: 'app-lister-orders',
  standalone: true,
  imports: [OrdersWorkspaceComponent],
  template: `<app-orders-workspace [mode]="'lister'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListerOrdersComponent {}
