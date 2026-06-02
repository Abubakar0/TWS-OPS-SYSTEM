import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { OrdersWorkspaceComponent } from './orders-workspace.component';

@Component({
  selector: 'app-order-processor-order-detail',
  standalone: true,
  imports: [OrdersWorkspaceComponent],
  template: `<app-orders-workspace [mode]="'processor'" [processorView]="'detail'" [focusOrderId]="orderId()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderProcessorOrderDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });

  readonly orderId = computed(() => this.params().get('id') || '');
}
