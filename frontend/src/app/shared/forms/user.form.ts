import { FormControl, FormGroup, Validators } from '@angular/forms';

import { UserRole } from '../../core/models/auth.models';

export type UserForm = FormGroup<{
  name: FormControl<string>;
  email: FormControl<string>;
  password: FormControl<string>;
  role: FormControl<UserRole>;
  isActive: FormControl<boolean>;
}>;

export const createUserForm = (): UserForm =>
  new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.minLength(8)],
    }),
    role: new FormControl<UserRole>('hunter', { nonNullable: true, validators: [Validators.required] }),
    isActive: new FormControl(true, { nonNullable: true }),
  });
