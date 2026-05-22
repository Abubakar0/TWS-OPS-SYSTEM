import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { AdminActivityFacade } from '../../core/facades/admin-activity.facade';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-admin-activity',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './admin-activity.component.html',
  styleUrl: './admin-activity.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AdminActivityFacade],
})
export class AdminActivityComponent {
  readonly facade = inject(AdminActivityFacade);
}
