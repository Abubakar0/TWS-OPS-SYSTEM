import { Routes } from '@angular/router';
import {
  authGuard,
  dashboardRedirectGuard,
  permissionGuard,
  roleGuard,
} from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/marketing/marketing-home.component').then(
        (m) => m.MarketingHomeComponent,
      ),
  },
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
          {
            path: 'orders',
            loadComponent: () =>
              import('./features/orders/hunter-orders.component').then(
                (m) => m.HunterOrdersComponent,
              ),
          },
          {
            path: 'order-issues',
            loadComponent: () =>
              import('./features/hunter/hunter-order-issues.component').then(
                (m) => m.HunterOrderIssuesComponent,
              ),
          },
          {
            path: 'changes',
            loadComponent: () =>
              import('./features/hunter/hunter-changes.component').then(
                (m) => m.HunterChangesComponent,
              ),
          },
          {
            path: 'review',
            loadComponent: () =>
              import('./features/hunter/hunter-review.component').then(
                (m) => m.HunterReviewComponent,
              ),
          },
          {
            path: 'rules',
            loadComponent: () =>
              import('./features/hunter/hunter-rules.component').then(
                (m) => m.HunterRulesComponent,
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
          {
            path: 'orders',
            loadComponent: () =>
              import('./features/orders/lister-orders.component').then(
                (m) => m.ListerOrdersComponent,
              ),
          },
          {
            path: 'changes',
            loadComponent: () =>
              import('./features/lister/lister-changes.component').then(
                (m) => m.ListerChangesComponent,
              ),
          },
          {
            path: 'account-usage',
            loadComponent: () =>
              import('./features/lister/lister-account-usage.component').then(
                (m) => m.ListerAccountUsageComponent,
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
              import('./features/admin/admin-users.component').then((m) => m.AdminUsersComponent),
          },
          {
            path: 'assignments',
            loadComponent: () =>
              import('./features/admin/admin-assignments.component').then(
                (m) => m.AdminAssignmentsComponent,
              ),
          },
          {
            path: 'products',
            loadComponent: () =>
              import('./features/admin/admin-products.component').then(
                (m) => m.AdminProductsComponent,
              ),
          },
          {
            path: 'orders',
            loadComponent: () =>
              import('./features/orders/admin-orders.component').then(
                (m) => m.AdminOrdersComponent,
              ),
          },
          {
            path: 'order-issues',
            loadComponent: () =>
              import('./features/admin/admin-order-issues.component').then(
                (m) => m.AdminOrderIssuesComponent,
              ),
          },
          {
            path: 'change-requests',
            loadComponent: () =>
              import('./features/admin/admin-change-requests.component').then(
                (m) => m.AdminChangeRequestsComponent,
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
          {
            path: 'accounts',
            loadComponent: () =>
              import('./features/admin/admin-accounts.component').then(
                (m) => m.AdminAccountsComponent,
              ),
          },
          {
            path: 'activity',
            loadComponent: () =>
              import('./features/admin/admin-activity.component').then(
                (m) => m.AdminActivityComponent,
              ),
          },
        ],
      },
      {
        path: 'team',
        loadComponent: () =>
          import('./features/team/team-directory.component').then((m) => m.TeamDirectoryComponent),
      },
      {
        path: 'orders/processing',
        canActivate: [permissionGuard],
        data: { permissions: ['canProcessOrders'] },
        loadComponent: () =>
          import('./features/orders/order-processing.component').then(
            (m) => m.OrderProcessingComponent,
          ),
      },
      {
        path: 'order-processor',
        canActivate: [roleGuard],
        data: { roles: ['order_processor', 'admin', 'super_admin'] },
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'dashboard',
          },
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./features/orders/order-processor-dashboard.component').then(
                (m) => m.OrderProcessorDashboardComponent,
              ),
          },
          {
            path: 'orders',
            loadComponent: () =>
              import('./features/orders/order-processor-orders.component').then(
                (m) => m.OrderProcessorOrdersComponent,
              ),
          },
          {
            path: 'orders/new',
            loadComponent: () =>
              import('./features/orders/order-processor-new-order.component').then(
                (m) => m.OrderProcessorNewOrderComponent,
              ),
          },
          {
            path: 'orders/:id',
            loadComponent: () =>
              import('./features/orders/order-processor-order-detail.component').then(
                (m) => m.OrderProcessorOrderDetailComponent,
              ),
          },
          {
            path: 'issues',
            loadComponent: () =>
              import('./features/orders/order-processor-issues.component').then(
                (m) => m.OrderProcessorIssuesComponent,
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
            path: 'orders',
            loadComponent: () =>
              import('./features/orders/superadmin-orders.component').then(
                (m) => m.SuperAdminOrdersComponent,
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
            path: 'security',
            loadComponent: () =>
              import('./features/superadmin/superadmin-security.component').then(
                (m) => m.SuperAdminSecurityComponent,
              ),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
