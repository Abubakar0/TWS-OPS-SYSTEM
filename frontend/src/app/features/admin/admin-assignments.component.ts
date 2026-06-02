import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom, debounceTime, distinctUntilChanged } from 'rxjs';

import { HunterAssignment, User } from '../../core/models/auth.models';
import { AdminService } from '../../core/services/admin.service';
import { ExportService } from '../../core/services/export.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { GridSortState, sortRecords } from '../../shared/grid/grid.utils';

@Component({
  selector: 'app-admin-assignments',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './admin-assignments.component.html',
  styleUrl: './admin-assignments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAssignmentsComponent implements OnInit {
  readonly pageSizeOptions = [10, 25, 50];
  readonly assignments = signal<HunterAssignment[]>([]);
  readonly total = signal(0);
  readonly listers = signal<User[]>([]);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly searchTerm = signal('');
  readonly sortState = signal<GridSortState>({ active: 'hunterName', direction: 'asc' });
  readonly pageIndex = signal(0);
  readonly pageSize = signal(this.pageSizeOptions[1]);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl<'all' | 'assigned' | 'unassigned'>('all', { nonNullable: true });
  readonly listerFilter = new FormControl('', { nonNullable: true });

  readonly assignedCount = computed(() => this.assignments().filter((assignment) => Boolean(assignment.listerId)).length);
  readonly unassignedCount = computed(() => this.assignments().filter((assignment) => !assignment.listerId).length);
  readonly sortedAssignments = computed(() =>
    sortRecords(this.assignments(), this.sortState(), (assignment, key) => {
      switch (key) {
        case 'listerName':
          return (assignment.listerName || 'Unassigned').toLowerCase();
        case 'status':
          return assignment.listerId ? 'assigned' : 'unassigned';
        case 'hunterName':
        default:
          return assignment.hunterName.toLowerCase();
      }
    }),
  );
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly pageLabel = computed(() => {
    const total = this.total();

    if (!total) {
      return 'No assignments to show';
    }

    const start = this.pageIndex() * this.pageSize() + 1;
    const end = Math.min(total, start + this.sortedAssignments().length - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  private readonly destroyRef = inject(DestroyRef);
  private listersSubscribed = false;

  constructor(
    private readonly adminApi: AdminService,
    private readonly exportService: ExportService,
    private readonly referenceData: ReferenceDataService,
    private readonly toast: ToastService,
  ) {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.searchTerm.set(value.trim().toLowerCase());
        this.pageIndex.set(0);
        this.loadData();
      });

    this.statusFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.pageIndex.set(0);
      this.loadData();
    });
    this.listerFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.pageIndex.set(0);
      this.loadData();
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.listAssignments(this.buildFilters()).subscribe({
      next: (page) => {
        this.assignments.set(page.items);
        this.total.set(page.total);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load assignments.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });

    if (!this.listersSubscribed) {
      this.listersSubscribed = true;

      this.referenceData
        .getUsers('lister')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (users) => this.listers.set(users),
          error: (error) => this.error.set(error?.error?.message || 'Could not load listers.'),
        });
    }
  }

  setAssignment(hunterId: string, listerId: string): void {
    this.adminApi.setHunterLister(hunterId, listerId || null).subscribe({
      next: () => {
        const nextLister = this.listers().find((lister) => lister.id === listerId) || null;
        this.assignments.update((assignments) =>
          assignments.map((assignment) =>
            assignment.hunterId === hunterId
              ? {
                  ...assignment,
                  listerId: nextLister?.id || null,
                  listerName: nextLister?.name || null,
                  listerEmail: nextLister?.email || null,
                  listerActive: nextLister?.isActive || null,
                }
              : assignment,
          ),
        );
        this.toast.success('Assignment updated.');
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not update assignment.'),
    });
  }

  exportAssignments(): void {
    void this.exportAllAssignments();
  }

  resetFilters(): void {
    this.searchControl.setValue('', { emitEvent: true });
    this.statusFilter.setValue('all');
    this.listerFilter.setValue('');
  }

  toggleSort(active: GridSortState['active']): void {
    const current = this.sortState();

    this.sortState.set({
      active,
      direction: current.active === active && current.direction === 'asc' ? 'desc' : 'asc',
    });
    this.pageIndex.set(0);
  }

  isSortedBy(active: GridSortState['active']): boolean {
    return this.sortState().active === active;
  }

  sortIcon(active: GridSortState['active']): string {
    const current = this.sortState();

    if (current.active !== active) {
      return 'unfold_more';
    }

    return current.direction === 'asc' ? 'north' : 'south';
  }

  previousPage(): void {
    this.pageIndex.update((pageIndex) => Math.max(pageIndex - 1, 0));
    this.loadData();
  }

  nextPage(): void {
    this.pageIndex.update((pageIndex) => Math.min(pageIndex + 1, this.pageCount() - 1));
    this.loadData();
  }

  setPageSize(value: string): void {
    this.pageSize.set(Number(value));
    this.pageIndex.set(0);
    this.loadData();
  }

  private buildFilters() {
    return {
      search: this.searchTerm() || undefined,
      status: this.statusFilter.value === 'all' ? undefined : this.statusFilter.value,
      listerId: this.listerFilter.value || undefined,
      page: this.pageIndex() + 1,
      limit: this.pageSize(),
    };
  }

  private async exportAllAssignments(): Promise<void> {
    this.exporting.set(true);

    try {
      const filters = this.buildFilters();
      const firstPage = await firstValueFrom(
        this.adminApi.listAssignments({
          ...filters,
          page: 1,
          limit: 100,
        }),
      );
      const rows = [...firstPage.items];
      const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.limit));

      for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await firstValueFrom(
          this.adminApi.listAssignments({
            ...filters,
            page,
            limit: 100,
          }),
        );
        rows.push(...nextPage.items);
      }

      const dateStamp = new Date().toISOString().slice(0, 10);

      this.exportService.exportAsExcelTable({
        filename: `assignments-${dateStamp}.xlsx`,
        sheetName: 'Assignments',
        rows,
        columns: [
          { header: 'Hunter Name', value: (assignment) => assignment.hunterName },
          { header: 'Hunter Email', value: (assignment) => assignment.hunterEmail },
          { header: 'Hunter Status', value: (assignment) => (assignment.hunterActive ? 'Enabled' : 'Disabled') },
          { header: 'Lister Name', value: (assignment) => assignment.listerName || 'Unassigned' },
          { header: 'Lister Email', value: (assignment) => assignment.listerEmail || '' },
          { header: 'Lister Status', value: (assignment) => (assignment.listerActive ? 'Enabled' : 'Disabled') },
        ],
      });
      this.toast.success('Assignments exported.');
    } catch (error) {
      this.error.set('Could not export assignments.');
    } finally {
      this.exporting.set(false);
    }
  }
}
