import { ChangeDetectionStrategy, Component } from '@angular/core';

import { OrdersWorkspaceComponent } from './orders-workspace.component';

@Component({
  selector: 'app-hunter-orders',
  standalone: true,
  imports: [OrdersWorkspaceComponent],
  template: `<app-orders-workspace [mode]="'hunter'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterOrdersComponent {}
