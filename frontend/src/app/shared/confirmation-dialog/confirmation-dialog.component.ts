import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmationDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
}

@Component({
  selector: 'app-confirmation-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="app-dialog">
      <div class="app-dialog__icon" [class.app-dialog__icon--danger]="data.tone === 'danger'">
        <mat-icon>{{ data.tone === 'danger' ? 'warning_amber' : 'help_outline' }}</mat-icon>
      </div>

      <div class="app-dialog__body">
        <h2>{{ data.title }}</h2>
        <p>{{ data.message }}</p>
      </div>

      <div class="app-dialog__actions">
        <button mat-stroked-button type="button" (click)="close(false)">
          {{ data.cancelText || 'Cancel' }}
        </button>
        <button
          mat-flat-button
          [color]="data.tone === 'danger' ? 'warn' : 'primary'"
          type="button"
          (click)="close(true)"
        >
          {{ data.confirmText || 'Confirm' }}
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationDialogComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<ConfirmationDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) readonly data: ConfirmationDialogData,
  ) {}

  close(confirmed: boolean): void {
    this.dialogRef.close(confirmed);
  }
}
