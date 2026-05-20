import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { User, UserRole } from '../../core/models/auth.models';
import { AdminService } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-users',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss',
})
export class AdminUsersComponent implements OnInit {
  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly adminCount = computed(() => this.users().filter((user) => user.role === 'admin').length);
  readonly hunterCount = computed(() => this.users().filter((user) => user.role === 'hunter').length);
  readonly listerCount = computed(() => this.users().filter((user) => user.role === 'lister').length);

  readonly userForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('Password123!', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    role: new FormControl<UserRole>('hunter', { nonNullable: true, validators: [Validators.required] }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  constructor(
    private readonly adminApi: AdminService,
    private readonly snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.listUsers().subscribe({
      next: (users) => this.users.set(users),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load users.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  createUser(): void {
    if (this.userForm.invalid || this.saving()) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.adminApi.createUser(this.userForm.getRawValue()).subscribe({
      next: () => {
        this.userForm.reset({
          name: '',
          email: '',
          password: 'Password123!',
          role: 'hunter',
          isActive: true,
        });
        this.loadUsers();
        this.snackBar.open('User created.', 'Close', { duration: 2600 });
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not create user.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }

  toggleUser(user: User): void {
    this.adminApi.updateUser(user.id, { isActive: !user.isActive }).subscribe({
      next: () => {
        this.loadUsers();
        this.snackBar.open(user.isActive ? 'User disabled.' : 'User enabled.', 'Close', { duration: 2600 });
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not update user status.'),
    });
  }

  fieldError(name: 'name' | 'email' | 'password'): string {
    const control = this.userForm.controls[name];

    if (!control.touched && !control.dirty) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required.';
    }

    if (control.hasError('email')) {
      return 'Enter a valid email address.';
    }

    if (control.hasError('minlength')) {
      return 'Password must be at least 8 characters.';
    }

    return '';
  }
}
