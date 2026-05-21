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
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { HunterAssignment, User } from '../../core/models/auth.models';
import { AdminService } from '../../core/services/admin.service';
import { ExportService } from '../../core/services/export.service';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { GridSortState, paginateRecords, sortRecords } from '../../shared/grid/grid.utils';

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
  readonly pageSizeOptions = [8, 16, 32];
  readonly assignments = signal<HunterAssignment[]>([]);
  readonly listers = signal<User[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly searchTerm = signal('');
  readonly sortState = signal<GridSortState>({ active: 'hunterName', direction: 'asc' });
  readonly pageIndex = signal(0);
  readonly pageSize = signal(this.pageSizeOptions[0]);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl<'all' | 'assigned' | 'unassigned'>('all', { nonNullable: true });
  readonly listerFilter = new FormControl('', { nonNullable: true });

  readonly assignedCount = computed(() => this.assignments().filter((assignment) => Boolean(assignment.listerId)).length);
  readonly unassignedCount = computed(() => this.assignments().filter((assignment) => !assignment.listerId).length);
  readonly filteredAssignments = computed(() => {
    const term = this.searchTerm();
    const status = this.statusFilter.value;
    const listerId = this.listerFilter.value;
    const filtered = this.assignments().filter((assignment) => {
      const matchesStatus =
        status === 'all' ||
        (status === 'assigned' && Boolean(assignment.listerId)) ||
        (status === 'unassigned' && !assignment.listerId);
      const matchesLister = !listerId ? true : (assignment.listerId || '') === listerId;

      if (!matchesStatus || !matchesLister) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [
        assignment.hunterName,
        assignment.hunterEmail,
        assignment.listerName || '',
        assignment.listerEmail || '',
        assignment.listerId ? 'assigned' : 'unassigned',
      ].some((value) => value.toLowerCase().includes(term));
    });

    return sortRecords(filtered, this.sortState(), (assignment, key) => {
      switch (key) {
        case 'listerName':
          return (assignment.listerName || 'Unassigned').toLowerCase();
        case 'status':
          return assignment.listerId ? 'assigned' : 'unassigned';
        case 'hunterName':
        default:
          return assignment.hunterName.toLowerCase();
      }
    });
  });
  readonly pagedAssignments = computed(() =>
    paginateRecords(this.filteredAssignments(), this.pageIndex(), this.pageSize()),
  );
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredAssignments().length / this.pageSize())));
  readonly pageLabel = computed(() => {
    const total = this.filteredAssignments().length;

    if (!total) {
      return 'No assignments to show';
    }

    const start = this.pageIndex() * this.pageSize() + 1;
    const end = Math.min(total, start + this.pageSize() - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  private readonly destroyRef = inject(DestroyRef);
  private listersSubscribed = false;

  constructor(
    private readonly adminApi: AdminService,
    private readonly exportService: ExportService,
    private readonly referenceData: ReferenceDataService,
    private readonly workspaceSync: WorkspaceSyncService,
    private readonly toast: ToastService,
  ) {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.searchTerm.set(value.trim().toLowerCase());
        this.pageIndex.set(0);
      });

    this.statusFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.pageIndex.set(0));
    this.listerFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.pageIndex.set(0));
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.listAssignments().subscribe({
      next: (assignments) => {
        this.assignments.set(assignments);
        this.pageIndex.set(0);
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
        this.loadData();
        this.workspaceSync.notifyProductsChanged();
        this.workspaceSync.notifyUsersChanged();
        this.toast.success('Assignment updated.');
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not update assignment.'),
    });
  }

  exportAssignments(): void {
    const dateStamp = new Date().toISOString().slice(0, 10);

    this.exportService.exportAsExcelTable({
      filename: `assignments-${dateStamp}.xlsx`,
      sheetName: 'Assignments',
      rows: this.filteredAssignments(),
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

  setPageSize(value: string): void {
    this.pageSize.set(Number(value));
    this.pageIndex.set(0);
  }

  previousPage(): void {
    this.pageIndex.update((pageIndex) => Math.max(pageIndex - 1, 0));
  }

  nextPage(): void {
    this.pageIndex.update((pageIndex) => Math.min(pageIndex + 1, this.pageCount() - 1));
  }
}
