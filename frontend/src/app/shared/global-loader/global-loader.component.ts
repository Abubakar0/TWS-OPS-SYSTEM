import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LoaderService } from '../../core/ui/loader.service';

@Component({
  selector: 'app-global-loader',
  imports: [CommonModule],
  template: `
    @if (loader.isVisible()) {
      <div class="global-loader" aria-live="polite" aria-label="Loading"></div>
    }
  `,
  styleUrl: './global-loader.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalLoaderComponent {
  readonly loader = inject(LoaderService);
}
