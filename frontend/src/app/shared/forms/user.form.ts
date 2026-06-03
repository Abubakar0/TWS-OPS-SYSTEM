import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { UserRole } from '../../core/models/auth.models';

export type UserForm = FormGroup<{
  name: FormControl<string>;
  email: FormControl<string>;
  password: FormControl<string>;
  roles: FormControl<UserRole[]>;
  isActive: FormControl<boolean>;
  canProcessOrders: FormControl<boolean>;
  canViewAllOrders: FormControl<boolean>;
}>;

const rolesValidator = (control: AbstractControl<UserRole[]>): ValidationErrors | null => {
  const roles = control.value || [];

  if (!roles.length) {
    return { required: true };
  }

  if (roles.includes('admin') && roles.includes('super_admin')) {
    return { invalidCombination: true };
  }

  return null;
};

export const createUserForm = (): UserForm =>
  new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.minLength(8)],
    }),
    roles: new FormControl<UserRole[]>(['hunter'], {
      nonNullable: true,
      validators: [rolesValidator],
    }),
    isActive: new FormControl(true, { nonNullable: true }),
    canProcessOrders: new FormControl(false, { nonNullable: true }),
    canViewAllOrders: new FormControl(false, { nonNullable: true }),
  });
