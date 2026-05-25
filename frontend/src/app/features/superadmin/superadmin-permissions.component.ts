import { CommonModule, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { UserPermissionKey } from '../../core/models/auth.models';
import { AdminService, PermissionMatrixRow } from '../../core/services/admin.service';

@Component({
  selector: 'app-superadmin-permissions',
  imports: [CommonModule, TitleCasePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './superadmin-permissions.component.html',
  styleUrl: './superadmin-permissions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminPermissionsComponent implements OnInit {
  readonly matrix = signal<PermissionMatrixRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly permissionKeys = computed<UserPermissionKey[]>(
    () => Object.keys(this.matrix()[0]?.permissions || {}) as UserPermissionKey[],
  );

  constructor(private readonly adminApi: AdminService) {}

  ngOnInit(): void {
    this.loadMatrix();
  }

  loadMatrix(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.getPermissionMatrix().subscribe({
      next: (matrix) => this.matrix.set(matrix),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load permission matrix.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
