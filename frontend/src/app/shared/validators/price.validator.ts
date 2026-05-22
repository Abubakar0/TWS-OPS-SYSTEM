import { ValidatorFn } from '@angular/forms';

export const decimalValue = (value: unknown): number | null => {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    return null;
  }

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const decimalValidator: ValidatorFn = (control) => {
  if (!String(control.value ?? '').trim()) {
    return null;
  }

  return decimalValue(control.value) === null ? { decimal: true } : null;
};

export const decimalMinValidator = (min: number): ValidatorFn => (control) => {
  const parsed = decimalValue(control.value);

  if (parsed === null) {
    return null;
  }

  return parsed >= min ? null : { min: { min, actual: parsed } };
};
