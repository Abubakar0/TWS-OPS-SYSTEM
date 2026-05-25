import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ChangeRequestApiService } from '../../core/api/change-request-api.service';
import { ChangeRequest, ChangeRequestSummary } from '../../core/models/product.models';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-hunter-changes',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './hunter-changes.component.html',
  styleUrl: './hunter-changes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HunterChangesComponent {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly summary = signal<ChangeRequestSummary>({ total: 0, pending: 0, completed: 0 });
  readonly requests = signal<ChangeRequest[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = 10;

  readonly createForm = new FormGroup({
    asin: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    requestedChanges: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(5)] }),
  });

  readonly filtersForm = new FormGroup({
    status: new FormControl<'pending' | 'completed' | ''>('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private readonly changeRequestApi: ChangeRequestApiService,
    private readonly toast: ToastService,
  ) {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.changeRequestApi.getSummary().subscribe({
      next: (summary) => this.summary.set(summary),
    });

    this.changeRequestApi
      .listChangeRequests({
        status: this.filtersForm.controls.status.value,
        search: this.filtersForm.controls.search.value.trim(),
        page: this.pageIndex() + 1,
        limit: this.pageSize,
      })
      .subscribe({
        next: (page) => {
          this.requests.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load product change requests.');
          this.loading.set(false);
        },
      });
  }

  createRequest(): void {
    if (this.createForm.invalid || this.saving()) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.changeRequestApi.createChangeRequest(this.createForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success('Change request sent to the lister.');
        this.createForm.reset({ asin: '', requestedChanges: '' });
        this.pageIndex.set(0);
        this.load();
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not create change request.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }

  applyFilters(): void {
    this.pageIndex.set(0);
    this.load();
  }

  nextPage(): void {
    this.pageIndex.update((value) => value + 1);
    this.load();
  }

  previousPage(): void {
    this.pageIndex.update((value) => Math.max(0, value - 1));
    this.load();
  }
}
