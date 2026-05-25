import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SystemApiService } from '../../core/api/system-api.service';
import { AllowedIpEntry, IpRestrictionSettings } from '../../core/models/system.models';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-superadmin-security',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './superadmin-security.component.html',
  styleUrl: './superadmin-security.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminSecurityComponent {
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly currentIp = signal('');
  readonly warning = signal('');
  readonly ipRestriction = signal<IpRestrictionSettings>({
    enabled: false,
    allowedIps: [],
  });

  readonly ipForm = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ip: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor(
    private readonly systemApi: SystemApiService,
    private readonly toast: ToastService,
  ) {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loading.set(true);
    this.error.set('');

    this.systemApi.getSettings().subscribe({
      next: (settings) => {
        this.ipRestriction.set(settings.ipRestriction);
        this.currentIp.set(settings.currentIp);
        this.warning.set(settings.ipRestrictionWarning);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load security settings.');
        this.loading.set(false);
      },
    });
  }

  toggleEnabled(enabled: boolean): void {
    this.ipRestriction.update((current) => ({ ...current, enabled }));
  }

  addCurrentIp(): void {
    if (!this.currentIp()) {
      return;
    }

    this.ipForm.patchValue({
      ip: this.currentIp(),
      label: this.ipForm.controls.label.value || 'Current Network',
    });
  }

  addIp(): void {
    if (this.ipForm.invalid) {
      this.ipForm.markAllAsTouched();
      return;
    }

    const nextEntry: AllowedIpEntry = {
      id: crypto.randomUUID(),
      label: this.ipForm.controls.label.value.trim(),
      ip: this.ipForm.controls.ip.value.trim(),
      active: true,
    };

    this.ipRestriction.update((current) => ({
      ...current,
      allowedIps: [...current.allowedIps, nextEntry],
    }));
    this.ipForm.reset({ label: '', ip: '' });
  }

  toggleIpActive(entryId: string): void {
    this.ipRestriction.update((current) => ({
      ...current,
      allowedIps: current.allowedIps.map((entry) =>
        entry.id === entryId ? { ...entry, active: !entry.active } : entry,
      ),
    }));
  }

  removeIp(entryId: string): void {
    this.ipRestriction.update((current) => ({
      ...current,
      allowedIps: current.allowedIps.filter((entry) => entry.id !== entryId),
    }));
  }

  save(): void {
    this.saving.set(true);
    this.error.set('');

    this.systemApi.updateIpRestriction(this.ipRestriction()).subscribe({
      next: (settings) => {
        this.ipRestriction.set(settings);
        this.toast.success('Security settings saved.');
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not save security settings.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }
}
