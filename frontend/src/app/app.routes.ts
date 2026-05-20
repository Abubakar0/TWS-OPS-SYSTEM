import { Routes } from '@angular/router';
import { authGuard, dashboardRedirectGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/dashboard-layout/dashboard-layout.component').then(
        (m) => m.DashboardLayoutComponent,
      ),
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [dashboardRedirectGuard],
        loadComponent: () =>
          import('./features/hunter/hunter-dashboard.component').then(
            (m) => m.HunterDashboardComponent,
          ),
      },
      {
        path: 'hunter',
        canActivate: [roleGuard],
        data: { roles: ['hunter', 'admin'] },
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'dashboard',
          },
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./features/hunter/hunter-dashboard.component').then(
                (m) => m.HunterDashboardComponent,
              ),
          },
          {
            path: 'submission',
            loadComponent: () =>
              import('./features/hunter/hunter-submission.component').then(
                (m) => m.HunterSubmissionComponent,
              ),
          },
          {
            path: 'products',
            loadComponent: () =>
              import('./features/hunter/hunter-products.component').then(
                (m) => m.HunterProductsComponent,
              ),
          },
        ],
      },
      {
        path: 'lister',
        canActivate: [roleGuard],
        data: { roles: ['lister', 'admin'] },
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'dashboard',
          },
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./features/lister/lister-dashboard.component').then(
                (m) => m.ListerDashboardComponent,
              ),
          },
          {
            path: 'products',
            loadComponent: () =>
              import('./features/lister/lister-products.component').then(
                (m) => m.ListerProductsComponent,
              ),
          },
        ],
      },
      {
        path: 'admin',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./features/admin/admin-dashboard.component').then(
            (m) => m.AdminDashboardComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
