import { ValidatorFn } from '@angular/forms';

export const asinValidator: ValidatorFn = (control) => {
  const value = String(control.value || '').trim().toUpperCase();

  if (!value) {
    return { required: true };
  }

  return /^[A-Z0-9]{10}$/.test(value) ? null : { asin: true };
};
