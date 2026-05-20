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
        data: { roles: ['admin', 'super_admin'] },
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'dashboard',
          },
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./features/admin/admin-dashboard.component').then(
                (m) => m.AdminDashboardComponent,
              ),
          },
          {
            path: 'users',
            loadComponent: () =>
              import('./features/admin/admin-users.component').then(
                (m) => m.AdminUsersComponent,
              ),
          },
          {
            path: 'assignments',
            loadComponent: () =>
              import('./features/admin/admin-assignments.component').then(
                (m) => m.AdminAssignmentsComponent,
              ),
          },
          {
            path: 'settings',
            loadComponent: () =>
              import('./features/admin/admin-settings.component').then(
                (m) => m.AdminSettingsComponent,
              ),
          },
          {
            path: 'reports',
            loadComponent: () =>
              import('./features/admin/admin-reports.component').then(
                (m) => m.AdminReportsComponent,
              ),
          },
        ],
      },
      {
        path: 'superadmin',
        canActivate: [roleGuard],
        data: { roles: ['super_admin'] },
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'dashboard',
          },
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./features/superadmin/superadmin-dashboard.component').then(
                (m) => m.SuperAdminDashboardComponent,
              ),
          },
          {
            path: 'admins',
            loadComponent: () =>
              import('./features/superadmin/superadmin-admins.component').then(
                (m) => m.SuperAdminAdminsComponent,
              ),
          },
          {
            path: 'users',
            loadComponent: () =>
              import('./features/superadmin/superadmin-users.component').then(
                (m) => m.SuperAdminUsersComponent,
              ),
          },
          {
            path: 'reports',
            loadComponent: () =>
              import('./features/superadmin/superadmin-reports.component').then(
                (m) => m.SuperAdminReportsComponent,
              ),
          },
          {
            path: 'settings',
            loadComponent: () =>
              import('./features/superadmin/superadmin-settings.component').then(
                (m) => m.SuperAdminSettingsComponent,
              ),
          },
          {
            path: 'audit',
            loadComponent: () =>
              import('./features/superadmin/superadmin-audit.component').then(
                (m) => m.SuperAdminAuditComponent,
              ),
          },
          {
            path: 'system',
            loadComponent: () =>
              import('./features/superadmin/superadmin-system.component').then(
                (m) => m.SuperAdminSystemComponent,
              ),
          },
          {
            path: 'permissions',
            loadComponent: () =>
              import('./features/superadmin/superadmin-permissions.component').then(
                (m) => m.SuperAdminPermissionsComponent,
              ),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
