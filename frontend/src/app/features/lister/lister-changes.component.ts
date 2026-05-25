import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ChangeRequestApiService } from '../../core/api/change-request-api.service';
import { ListerApiService } from '../../core/api/lister-api.service';
import { ChangeRequest, ChangeRequestSummary } from '../../core/models/product.models';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-lister-changes',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './lister-changes.component.html',
  styleUrl: './lister-changes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListerChangesComponent {
  readonly loading = signal(true);
  readonly savingId = signal('');
  readonly error = signal('');
  readonly summary = signal<ChangeRequestSummary>({ total: 0, pending: 0, completed: 0 });
  readonly requests = signal<ChangeRequest[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = 10;
  readonly completionNotes = signal<Record<string, string>>({});

  readonly filtersForm = new FormGroup({
    status: new FormControl<'pending' | 'completed' | ''>('pending', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    hunterId: new FormControl('', { nonNullable: true }),
  });

  readonly hunters = signal<Array<{ id: string; name: string }>>([]);

  constructor(
    private readonly changeRequestApi: ChangeRequestApiService,
    private readonly listerApi: ListerApiService,
    private readonly toast: ToastService,
  ) {
    this.listerApi.listAssignedHunters().subscribe({
      next: (hunters) => this.hunters.set(hunters.map((hunter) => ({ id: hunter.id, name: hunter.name }))),
    });
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
        hunterId: this.filtersForm.controls.hunterId.value || undefined,
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
          this.error.set(error?.error?.message || 'Could not load change requests.');
          this.loading.set(false);
        },
      });
  }

  applyFilters(): void {
    this.pageIndex.set(0);
    this.load();
  }

  setCompletionNotes(id: string, value: string): void {
    this.completionNotes.update((current) => ({ ...current, [id]: value }));
  }

  completeRequest(id: string): void {
    this.savingId.set(id);
    this.changeRequestApi
      .completeChangeRequest(id, { completionNotes: this.completionNotes()[id] || '' })
      .subscribe({
        next: () => {
          this.toast.success('Change request marked as completed.');
          this.savingId.set('');
          this.load();
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not complete this change request.');
          this.savingId.set('');
        },
      });
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
