import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

type ToastTone = 'success' | 'error' | 'warning' | 'info';

@Injectable({ providedIn: 'root' })
export class ToastService {
  constructor(private readonly snackBar: MatSnackBar) {}

  success(message: string): void {
    this.open(message, 'success');
  }

  error(message: string): void {
    this.open(message, 'error');
  }

  warning(message: string): void {
    this.open(message, 'warning');
  }

  info(message: string): void {
    this.open(message, 'info');
  }

  private open(message: string, tone: ToastTone): void {
    this.snackBar.open(message, undefined, {
      duration: 2600,
      panelClass: [`toast-${tone}`],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }
}
