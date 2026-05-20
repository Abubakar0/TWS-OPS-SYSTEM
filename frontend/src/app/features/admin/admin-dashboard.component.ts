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
import { MatTabsModule } from '@angular/material/tabs';

import { HunterAssignment, User, UserRole } from '../../core/models/auth.models';
import { Account, HuntingCriteria } from '../../core/models/product.models';
import { AdminService, AdminStats } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-dashboard',
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
    MatTabsModule,
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  readonly users = signal<User[]>([]);
  readonly assignments = signal<HunterAssignment[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly stats = signal<AdminStats | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly hunters = computed(() => this.users().filter((user) => user.role === 'hunter'));
  readonly listers = computed(() => this.users().filter((user) => user.role === 'lister'));

  readonly userForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('Password123!', { nonNullable: true, validators: [Validators.required] }),
    role: new FormControl<UserRole>('hunter', { nonNullable: true, validators: [Validators.required] }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  readonly criteriaForm = new FormGroup({
    minRoi: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minProfit: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minSoldCount: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    feePercent: new FormControl(21, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    asinRequired: new FormControl(true, { nonNullable: true }),
    minStockCount: new FormControl(8, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minAlternateStockCount: new FormControl(8, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    minRating: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    customLabelRequired: new FormControl(false, { nonNullable: true }),
    watchersRequired: new FormControl(false, { nonNullable: true }),
    minWatcherCount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minSalesLastTwoMonths: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
  });

  readonly accountForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    marketplace: new FormControl('ebay', { nonNullable: true, validators: [Validators.required] }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  readonly reportFilters = new FormGroup({
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
    hunterId: new FormControl('', { nonNullable: true }),
    listerId: new FormControl('', { nonNullable: true }),
  });

  constructor(private readonly adminApi: AdminService) {}

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.listUsers().subscribe({
      next: (users) => this.users.set(users),
      error: (error) => this.error.set(error?.error?.message || 'Could not load users.'),
      complete: () => this.loading.set(false),
    });

    this.adminApi.listAssignments().subscribe((assignments) => this.assignments.set(assignments));
    this.adminApi.listAccounts(true).subscribe((accounts) => this.accounts.set(accounts));
    this.adminApi.getCriteria().subscribe((criteria) => this.criteriaForm.patchValue(criteria));
    this.loadStats();
  }

  loadStats(): void {
    this.adminApi.getAdminStats(this.reportFilters.getRawValue()).subscribe({
      next: (stats) => this.stats.set(stats),
      error: (error) => this.error.set(error?.error?.message || 'Could not load stats.'),
    });
  }

  createUser(): void {
    if (this.userForm.invalid || this.saving()) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.adminApi.createUser(this.userForm.getRawValue()).subscribe({
      next: () => {
        this.userForm.reset({
          name: '',
          email: '',
          password: 'Password123!',
          role: 'hunter',
          isActive: true,
        });
        this.loadAll();
      },
      error: (error) => this.error.set(error?.error?.message || 'Could not create user.'),
      complete: () => this.saving.set(false),
    });
  }

  toggleUser(user: User): void {
    this.adminApi.updateUser(user.id, { isActive: !user.isActive }).subscribe(() => this.loadAll());
  }

  setAssignment(hunterId: string, listerId: string): void {
    this.adminApi.setHunterLister(hunterId, listerId || null).subscribe(() => this.loadAll());
  }

  saveCriteria(): void {
    if (this.criteriaForm.invalid) {
      this.criteriaForm.markAllAsTouched();
      return;
    }

    this.adminApi
      .updateCriteria(this.criteriaForm.getRawValue() as HuntingCriteria)
      .subscribe((criteria) => this.criteriaForm.patchValue(criteria));
  }

  createAccount(): void {
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      return;
    }

    this.adminApi.createAccount(this.accountForm.getRawValue()).subscribe(() => {
      this.accountForm.reset({ name: '', marketplace: 'ebay', isActive: true });
      this.adminApi.listAccounts(true).subscribe((accounts) => this.accounts.set(accounts));
    });
  }

  toggleAccount(account: Account): void {
    this.adminApi
      .updateAccount(account.id, { isActive: !account.isActive })
      .subscribe(() => this.adminApi.listAccounts(true).subscribe((accounts) => this.accounts.set(accounts)));
  }
}
