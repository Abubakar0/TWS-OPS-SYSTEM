import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly loading = signal(false);
  readonly redirecting = signal(false);
  readonly error = signal('');

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  fieldError(name: 'email' | 'password'): string {
    const control = this.form.controls[name];

    if (!control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return name === 'email' ? 'Email is required.' : 'Password is required.';
    }

    if (control.hasError('email')) {
      return 'Enter a valid email address.';
    }

    return '';
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading() || this.redirecting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.redirecting.set(false);
    this.error.set('');

    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: async (response) => {
        this.redirecting.set(true);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const destination =
          returnUrl && returnUrl !== '/' ? returnUrl : this.auth.homeForRole(response.user.role);

        try {
          await this.router.navigateByUrl(destination);
        } catch {
          this.error.set('Sign-in worked, but the workspace could not be opened.');
          this.loading.set(false);
          this.redirecting.set(false);
        }
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Login failed.');
        this.loading.set(false);
        this.redirecting.set(false);
      },
    });
  }
}
