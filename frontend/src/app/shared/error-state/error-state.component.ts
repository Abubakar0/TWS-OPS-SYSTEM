import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-error-state',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="error-shell">
      <div class="error-shell__copy">
        <mat-icon>error_outline</mat-icon>
        <div>
          <strong>{{ title }}</strong>
          <p>{{ message }}</p>
        </div>
      </div>

      @if (actionLabel) {
        <button mat-stroked-button type="button" (click)="action.emit()">
          <mat-icon>refresh</mat-icon>
          <span>{{ actionLabel }}</span>
        </button>
      }
    </div>
  `,
  styleUrl: './error-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorStateComponent {
  @Input() title = 'Something went wrong';
  @Input() message = 'The data could not be loaded right now.';
  @Input() actionLabel = '';
  @Output() readonly action = new EventEmitter<void>();
}
