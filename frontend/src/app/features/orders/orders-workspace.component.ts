import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import { OrderManagementFacade, OrderWorkspaceMode, ProcessorWorkspaceView } from '../../core/facades/order-management.facade';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-orders-workspace',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    EmptyStateComponent,
  ],
  templateUrl: './orders-workspace.component.html',
  styleUrl: './orders-workspace.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [OrderManagementFacade],
})
export class OrdersWorkspaceComponent {
  readonly mode = input.required<OrderWorkspaceMode>();
  readonly processorView = input<ProcessorWorkspaceView>('orders');
  readonly focusOrderId = input('');
  readonly facade = inject(OrderManagementFacade);

  readonly pageVm = computed(() => {
    const mode = this.mode();

    if (mode === 'hunter') {
      return {
        title: 'Orders',
        subtitle: 'Track order status, account usage, and product performance tied to your hunts.',
        showCreate: false,
        showExport: false,
        showProcessingBar: false,
        emptyTitle: 'No orders found',
        emptyMessage: 'Orders linked to your products will appear here.',
      };
    }

    if (mode === 'lister') {
      return {
        title: 'Orders',
        subtitle: 'Read-only order visibility for products connected to your listings.',
        showCreate: false,
        showExport: false,
        showProcessingBar: false,
        emptyTitle: 'No related orders yet',
        emptyMessage: 'Orders tied to your listed products will show up here.',
      };
    }

    if (mode === 'processor') {
      const processorView = this.processorView();

      if (processorView === 'new') {
        return {
          title: 'Add Order',
          subtitle: 'Capture the minimum order details first and update placement or tracking later.',
          showCreate: true,
          showExport: this.facade.canExport(),
          showProcessingBar: true,
          emptyTitle: 'No orders yet',
          emptyMessage: 'Create the first order to start the queue.',
        };
      }

      if (processorView === 'issues') {
        return {
          title: 'Order Issues',
          subtitle: 'Review issue orders, add context, and coordinate matched product fixes quickly.',
          showCreate: true,
          showExport: this.facade.canExport(),
          showProcessingBar: true,
          emptyTitle: 'No issue orders',
          emptyMessage: 'Issue orders will appear here when follow-up is needed.',
        };
      }

      if (processorView === 'detail') {
        return {
          title: 'Order Details',
          subtitle: 'Inspect a single order and update placement or issue status from the side panel.',
          showCreate: true,
          showExport: this.facade.canExport(),
          showProcessingBar: true,
          emptyTitle: 'No order found',
          emptyMessage: 'Pick another order from the list to continue.',
        };
      }

      return {
        title: 'Orders',
        subtitle: 'Track orders you created, update statuses, and keep placement moving without extra steps.',
        showCreate: true,
        showExport: this.facade.canExport(),
        showProcessingBar: true,
        emptyTitle: 'No orders need action',
        emptyMessage: 'The queue is clear for the current filters.',
      };
    }

    return {
      title: 'Orders',
      subtitle: 'Company-wide order management with linked product, hunter, account, and placement details.',
      showCreate: true,
      showExport: this.facade.canExport(),
      showProcessingBar: false,
      emptyTitle: 'No orders found',
      emptyMessage: 'Adjust the filters or create the first order.',
    };
  });

  constructor() {
    effect(() => {
      this.facade.configure(this.mode(), {
        processorView: this.processorView(),
        focusOrderId: this.focusOrderId(),
      });
    });
  }
}
