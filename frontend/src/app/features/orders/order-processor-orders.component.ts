import { ChangeDetectionStrategy, Component } from '@angular/core';

import { OrdersWorkspaceComponent } from './orders-workspace.component';

@Component({
  selector: 'app-order-processor-orders',
  standalone: true,
  imports: [OrdersWorkspaceComponent],
  template: `<app-orders-workspace [mode]="'processor'" [processorView]="'orders'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderProcessorOrdersComponent {}
