import { ChangeDetectionStrategy, Component } from '@angular/core';

import { OrdersWorkspaceComponent } from './orders-workspace.component';

@Component({
  selector: 'app-order-processor-issues',
  standalone: true,
  imports: [OrdersWorkspaceComponent],
  template: `<app-orders-workspace [mode]="'processor'" [processorView]="'issues'" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderProcessorIssuesComponent {}
