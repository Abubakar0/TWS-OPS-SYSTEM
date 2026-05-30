import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ListerApiService } from '../../core/api/lister-api.service';
import { DashboardService, ListerHunterAccountUsage } from '../../core/services/dashboard.service';
import { SessionCacheService } from '../../core/state/session-cache.service';

@Component({
  selector: 'app-lister-account-usage',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './lister-account-usage.component.html',
  styleUrl: './lister-account-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListerAccountUsageComponent {
  readonly loading = signal(true);
  readonly error = signal('');
  readonly hunters = signal<Array<{ id: string; name: string }>>([]);
  readonly rows = signal<ListerHunterAccountUsage[]>([]);
  readonly filtersForm = new FormGroup({
    hunterId: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private readonly listerApi: ListerApiService,
    private readonly dashboardApi: DashboardService,
    private readonly sessionCache: SessionCacheService,
  ) {
    const cachedHunters = this.sessionCache
      .assignedHunters()
      .map((hunter) => ({ id: hunter.id, name: hunter.name }));

    if (cachedHunters.length) {
      this.hunters.set(cachedHunters);
      this.filtersForm.controls.hunterId.setValue(cachedHunters[0].id);
      this.load();
    }

    this.listerApi.listAssignedHunters().subscribe({
      next: (hunters) => {
        const options = hunters.map((hunter) => ({ id: hunter.id, name: hunter.name }));
        this.hunters.set(options);

        if (!this.filtersForm.controls.hunterId.value && options[0]) {
          this.filtersForm.controls.hunterId.setValue(options[0].id);
        } else {
          this.load();
        }
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load assigned hunters.');
        this.loading.set(false);
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.dashboardApi
      .getListerHunterAccountUsage({ hunterId: this.filtersForm.controls.hunterId.value || undefined })
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load account usage.');
          this.loading.set(false);
        },
      });
  }
}
