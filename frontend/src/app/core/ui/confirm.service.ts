import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../../shared/confirmation-dialog/confirmation-dialog.component';

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  constructor(private readonly dialog: MatDialog) {}

  async ask(options: ConfirmationDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '440px',
      maxWidth: 'calc(100vw - 28px)',
      panelClass: ['app-dialog-panel', options.tone === 'danger' ? 'app-dialog-panel--danger' : 'app-dialog-panel--default'],
      data: options,
    });

    return Boolean(await firstValueFrom(dialogRef.afterClosed()));
  }
}
