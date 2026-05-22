import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth/auth.service';
import { BRANDING } from '../../../core/config/branding';

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
export class LoginComponent implements OnInit {
  readonly branding = BRANDING;
  readonly loading = signal(false);
  readonly redirecting = signal(false);
  readonly error = signal('');
  readonly passwordHidden = signal(true);
  readonly ecosystemCards = BRANDING.platforms.filter((platform) => platform.key !== 'operations');

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
  readonly fieldErrors = computed(() => ({
    email: this.resolveFieldError('email'),
    password: this.resolveFieldError('password'),
  }));
  readonly loginVm = computed(() => ({
    loading: this.loading(),
    redirecting: this.redirecting(),
    error: this.error(),
    passwordHidden: this.passwordHidden(),
    fieldErrors: this.fieldErrors(),
    submitLabel: this.redirecting() ? 'Opening Workspace' : 'Sign In',
    ecosystemCards: this.ecosystemCards,
  }));

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    if (!this.auth.hasActiveSession()) {
      return;
    }

    this.redirecting.set(true);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const destination = this.auth.resolvePostLoginDestination(
      this.auth.currentUser()?.role,
      returnUrl,
    );

    void this.router
      .navigateByUrl(destination)
      .then((navigated) => {
        if (navigated) {
          return;
        }

        return this.router
          .navigateByUrl(this.auth.homeForRole(this.auth.currentUser()?.role))
          .then((fallbackNavigated) => {
            if (!fallbackNavigated) {
              this.redirecting.set(false);
              this.error.set('Your session is active, but the workspace could not be opened.');
            }
          });
      })
      .catch(() => {
        this.redirecting.set(false);
        this.error.set('Your session is active, but the workspace could not be opened.');
      });
  }

  private resolveFieldError(name: 'email' | 'password'): string {
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

  togglePasswordVisibility(): void {
    this.passwordHidden.update((value) => !value);
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
        const destination = this.auth.resolvePostLoginDestination(response.user.role, returnUrl);

        try {
          const navigated = await this.router.navigateByUrl(destination);

          if (!navigated) {
            const fallbackNavigated = await this.router.navigateByUrl(
              this.auth.homeForRole(response.user.role),
            );

            if (!fallbackNavigated) {
              this.error.set('Sign-in worked, but the workspace could not be opened.');
              this.loading.set(false);
              this.redirecting.set(false);
            }
          }
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
