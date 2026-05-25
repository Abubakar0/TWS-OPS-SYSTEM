import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { HunterApiService } from '../../core/api/hunter-api.service';
import { WeeklyReviewApiService } from '../../core/api/weekly-review-api.service';
import { WeeklyReviewStatus } from '../../core/models/product.models';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-hunter-review',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './hunter-review.component.html',
  styleUrl: './hunter-review.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterReviewComponent {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly status = signal<WeeklyReviewStatus | null>(null);
  readonly activeProducts = signal(0);
  readonly notesControl = new FormControl('', { nonNullable: true });
  readonly summaryText = computed(() => {
    const status = this.status();

    if (!status) {
      return 'Checking review status.';
    }

    if (!status.isReviewDay) {
      return 'Weekly review opens on Saturday. You can keep hunting normally today.';
    }

    if (status.completed) {
      return 'This week is already reviewed. Hunting is unlocked again.';
    }

    return 'Review your live products, log any requested changes, and then confirm the review here.';
  });

  constructor(
    private readonly weeklyReviewApi: WeeklyReviewApiService,
    private readonly hunterApi: HunterApiService,
    private readonly toast: ToastService,
  ) {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.weeklyReviewApi.getStatus().subscribe({
      next: (status) => this.status.set(status),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load review status.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });

    this.hunterApi.listProducts({ page: 1, limit: 1, deletedState: 'active' as never }).subscribe({
      next: (page) => this.activeProducts.set(page.total),
    });
  }

  markReviewed(): void {
    if (!this.status()?.required || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.weeklyReviewApi.completeReview(this.notesControl.value.trim()).subscribe({
      next: () => {
        this.toast.success('Weekly review completed.');
        this.notesControl.reset('');
        this.load();
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not complete the review.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }
}
