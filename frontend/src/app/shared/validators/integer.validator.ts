import { ValidatorFn } from '@angular/forms';

export const integerValidator: ValidatorFn = (control) => {
  if (control.value === null || control.value === undefined || control.value === '') {
    return null;
  }

  return Number.isInteger(Number(control.value)) ? null : { integer: true };
};
