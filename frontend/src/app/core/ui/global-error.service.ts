import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class GlobalErrorService {
  constructor(private readonly toast: ToastService) {}

  mapHttpError(error: HttpErrorResponse): string {
    const backendMessage = String(error.error?.message || '').trim();

    if (error.status === 0) {
      return 'Network connection was lost. Please check the server connection and try again.';
    }

    if (backendMessage) {
      return backendMessage;
    }

    switch (error.status) {
      case 400:
        return 'The request could not be processed. Please review the entered values.';
      case 401:
        return 'Your session has expired. Please sign in again.';
      case 403:
        return 'You do not have permission to perform that action.';
      case 404:
        return 'The requested record could not be found.';
      case 409:
        return 'A conflicting record already exists.';
      case 422:
        return 'Please review the highlighted fields and try again.';
      default:
        return 'Something went wrong on the server. Please try again.';
    }
  }

  notifyHttpError(error: HttpErrorResponse, tone: 'error' | 'warning' = 'error'): string {
    const message = this.mapHttpError(error);

    if (tone === 'warning') {
      this.toast.warning(message);
    } else {
      this.toast.error(message);
    }

    return message;
  }
}
