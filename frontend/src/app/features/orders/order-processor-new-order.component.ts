import { ChangeDetectionStrategy, Component } from '@angular/core';

import { OrdersWorkspaceComponent } from './orders-workspace.component';

@Component({
  selector: 'app-order-processor-new-order',
  standalone: true,
  imports: [OrdersWorkspaceComponent],
  template: `<app-orders-workspace [mode]="'processor'" [processorView]="'new'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderProcessorNewOrderComponent {}
