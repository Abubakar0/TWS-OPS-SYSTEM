import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  template: `
    <div class="empty-shell">
      <mat-icon>{{ icon }}</mat-icon>
      <div>
        <strong>{{ title }}</strong>
        <p>{{ message }}</p>
      </div>
    </div>
  `,
  styleUrl: './empty-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  @Input() title = 'Nothing to show';
  @Input() message = 'There is no data for this view yet.';
  @Input() icon = 'inbox';
}
