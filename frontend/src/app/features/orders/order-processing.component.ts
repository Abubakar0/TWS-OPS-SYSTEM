import { ChangeDetectionStrategy, Component } from '@angular/core';

import { OrdersWorkspaceComponent } from './orders-workspace.component';

@Component({
  selector: 'app-order-processing',
  standalone: true,
  imports: [OrdersWorkspaceComponent],
  template: `<app-orders-workspace [mode]="'processor'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderProcessingComponent {}
