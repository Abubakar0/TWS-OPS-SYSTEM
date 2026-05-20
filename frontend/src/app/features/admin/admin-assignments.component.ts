import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { HunterAssignment, User } from '../../core/models/auth.models';
import { AdminService } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-assignments',
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './admin-assignments.component.html',
  styleUrl: './admin-assignments.component.scss',
})
export class AdminAssignmentsComponent implements OnInit {
  readonly assignments = signal<HunterAssignment[]>([]);
  readonly listers = signal<User[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly assignedCount = computed(() => this.assignments().filter((assignment) => Boolean(assignment.listerId)).length);
  readonly unassignedCount = computed(() => this.assignments().filter((assignment) => !assignment.listerId).length);

  constructor(private readonly adminApi: AdminService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.listAssignments().subscribe({
      next: (assignments) => this.assignments.set(assignments),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load assignments.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });

    this.adminApi.listUsers('lister').subscribe({
      next: (users) => this.listers.set(users),
      error: (error) => this.error.set(error?.error?.message || 'Could not load listers.'),
    });
  }

  setAssignment(hunterId: string, listerId: string): void {
    this.adminApi.setHunterLister(hunterId, listerId || null).subscribe({
      next: () => this.loadData(),
      error: (error) => this.error.set(error?.error?.message || 'Could not update assignment.'),
    });
  }
}
