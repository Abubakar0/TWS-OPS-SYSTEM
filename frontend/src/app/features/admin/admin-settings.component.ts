import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Account, HuntingCriteria } from '../../core/models/product.models';
import { AdminService } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-settings',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.scss',
})
export class AdminSettingsComponent implements OnInit {
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly criteriaForm = new FormGroup({
    minRoi: new FormControl(30, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minProfit: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minSoldCount: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minStockCount: new FormControl(8, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minAlternateStockCount: new FormControl(8, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    minRating: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minWatcherCount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    minSalesLastTwoMonths: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    feePercent: new FormControl(21, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    asinRequired: new FormControl(true, { nonNullable: true }),
    customLabelRequired: new FormControl(false, { nonNullable: true }),
    watchersRequired: new FormControl(false, { nonNullable: true }),
  });

  readonly accountForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    marketplace: new FormControl('ebay', { nonNullable: true, validators: [Validators.required] }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  constructor(private readonly adminApi: AdminService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.getCriteria().subscribe({
      next: (criteria) => this.criteriaForm.patchValue(criteria),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load settings.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });

    this.adminApi.listAccounts(true).subscribe({
      next: (accounts) => this.accounts.set(accounts),
      error: (error) => this.error.set(error?.error?.message || 'Could not load accounts.'),
    });
  }

  saveCriteria(): void {
    if (this.criteriaForm.invalid || this.saving()) {
      this.criteriaForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.adminApi.updateCriteria(this.criteriaForm.getRawValue() as HuntingCriteria).subscribe({
      next: (criteria) => this.criteriaForm.patchValue(criteria),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not save settings.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }

  createAccount(): void {
    if (this.accountForm.invalid || this.saving()) {
      this.accountForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.adminApi.createAccount(this.accountForm.getRawValue()).subscribe({
      next: () => {
        this.accountForm.reset({ name: '', marketplace: 'ebay', isActive: true });
        this.adminApi.listAccounts(true).subscribe((accounts) => this.accounts.set(accounts));
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not create account.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }

  toggleAccount(account: Account): void {
    this.adminApi.updateAccount(account.id, { isActive: !account.isActive }).subscribe({
      next: () => this.adminApi.listAccounts(true).subscribe((accounts) => this.accounts.set(accounts)),
      error: (error) => this.error.set(error?.error?.message || 'Could not update account.'),
    });
  }
}
