import { Routes } from '@angular/router';
import {
  authGuard,
  dashboardRedirectGuard,
  permissionGuard,
  roleGuard,
  trainingHunterGuard,
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
        canActivate: [roleGuard, trainingHunterGuard],
        data: { roles: ['hunter', 'admin'] },
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'dashboard',
          },
          {
            path: 'dashboard',
            canActivate: [trainingHunterGuard],
            data: { allowTraining: false },
            loadComponent: () =>
              import('./features/hunter/hunter-dashboard.component').then(
                (m) => m.HunterDashboardComponent,
              ),
          },
          {
            path: 'submission',
            canActivate: [trainingHunterGuard],
            data: { allowTraining: true },
            loadComponent: () =>
              import('./features/hunter/hunter-submission.component').then(
                (m) => m.HunterSubmissionComponent,
              ),
          },
          {
            path: 'products',
            canActivate: [trainingHunterGuard],
            data: { allowTraining: true },
            loadComponent: () =>
              import('./features/hunter/hunter-products.component').then(
                (m) => m.HunterProductsComponent,
              ),
          },
          {
            path: 'training-progress',
            canActivate: [trainingHunterGuard],
            data: { allowTraining: true },
            loadComponent: () =>
              import('./features/hunter/hunter-training-progress.component').then(
                (m) => m.HunterTrainingProgressComponent,
              ),
          },
          {
            path: 'orders',
            canActivate: [trainingHunterGuard],
            data: { allowTraining: false },
            loadComponent: () =>
              import('./features/orders/hunter-orders.component').then(
                (m) => m.HunterOrdersComponent,
              ),
          },
          {
            path: 'order-issues',
            canActivate: [trainingHunterGuard],
            data: { allowTraining: false },
            loadComponent: () =>
              import('./features/hunter/hunter-order-issues.component').then(
                (m) => m.HunterOrderIssuesComponent,
              ),
          },
          {
            path: 'changes',
            canActivate: [trainingHunterGuard],
            data: { allowTraining: false },
            loadComponent: () =>
              import('./features/hunter/hunter-changes.component').then(
                (m) => m.HunterChangesComponent,
              ),
          },
          {
            path: 'review',
            canActivate: [trainingHunterGuard],
            data: { allowTraining: false },
            loadComponent: () =>
              import('./features/hunter/hunter-review.component').then(
                (m) => m.HunterReviewComponent,
              ),
          },
          {
            path: 'rules',
            canActivate: [trainingHunterGuard],
            data: { allowTraining: true },
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
          {
            path: 'listing-reviews',
            loadComponent: () =>
              import('./features/products/listing-review-queue.component').then(
                (m) => m.ListingReviewQueueComponent,
              ),
            data: {
              reviewScope: 'lister',
              title: 'Listing Review Queue',
              subtitle: 'Approve or reject listed products that still need final review.',
            },
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
            path: 'listing-reviews',
            loadComponent: () =>
              import('./features/products/listing-review-queue.component').then(
                (m) => m.ListingReviewQueueComponent,
              ),
            data: {
              reviewScope: 'admin',
              title: 'Listing Reviews',
              subtitle: 'Review listed products before they become final listed records.',
            },
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
              import('./features/reports/reports-hub.component').then(
                (m) => m.ReportsHubComponent,
              ),
            data: { reportScope: 'admin' },
          },
          {
            path: 'reports/:section',
            loadComponent: () =>
              import('./features/reports/report-detail.component').then(
                (m) => m.ReportDetailComponent,
              ),
            data: { reportScope: 'admin' },
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
        path: 'account/change-password',
        loadComponent: () =>
          import('./features/account/change-password.component').then(
            (m) => m.ChangePasswordComponent,
          ),
      },
      {
        path: 'my-hr',
        loadComponent: () =>
          import('./features/hr/my-hr.component').then((m) => m.MyHrComponent),
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
              import('./features/admin/admin-users.component').then(
                (m) => m.AdminUsersComponent,
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
            path: 'listing-reviews',
            loadComponent: () =>
              import('./features/products/listing-review-queue.component').then(
                (m) => m.ListingReviewQueueComponent,
              ),
            data: {
              reviewScope: 'superadmin',
              title: 'Listing Reviews',
              subtitle: 'Review and control self-listed products across the whole workspace.',
            },
          },
          {
            path: 'reports',
            loadComponent: () =>
              import('./features/reports/reports-hub.component').then(
                (m) => m.ReportsHubComponent,
              ),
            data: { reportScope: 'superadmin' },
          },
          {
            path: 'reports/:section',
            loadComponent: () =>
              import('./features/reports/report-detail.component').then(
                (m) => m.ReportDetailComponent,
              ),
            data: { reportScope: 'superadmin' },
          },
          {
            path: 'orders',
            loadComponent: () =>
              import('./features/orders/superadmin-orders.component').then(
                (m) => m.SuperAdminOrdersComponent,
              ),
          },
          {
            path: 'product-transfers',
            loadComponent: () =>
              import('./features/superadmin/superadmin-product-transfers.component').then(
                (m) => m.SuperadminProductTransfersComponent,
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
      {
        path: 'hr',
        canActivate: [roleGuard],
        data: { roles: ['hr', 'super_admin'] },
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'dashboard',
          },
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./features/hr/hr-dashboard.component').then((m) => m.HrDashboardComponent),
          },
          {
            path: 'employees',
            loadComponent: () =>
              import('./features/hr/hr-employees.component').then((m) => m.HrEmployeesComponent),
          },
          {
            path: 'attendance',
            loadComponent: () =>
              import('./features/hr/hr-attendance.component').then((m) => m.HrAttendanceComponent),
          },
          {
            path: 'leaves',
            loadComponent: () =>
              import('./features/hr/hr-leaves.component').then((m) => m.HrLeavesComponent),
          },
          {
            path: 'payroll',
            loadComponent: () =>
              import('./features/hr/hr-payroll.component').then((m) => m.HrPayrollComponent),
          },
          {
            path: 'expenses',
            loadComponent: () =>
              import('./features/hr/hr-expenses.component').then((m) => m.HrExpensesComponent),
          },
          {
            path: 'performance',
            loadComponent: () =>
              import('./features/hr/hr-performance.component').then((m) => m.HrPerformanceComponent),
          },
          {
            path: 'warnings',
            loadComponent: () =>
              import('./features/hr/hr-warnings.component').then((m) => m.HrWarningsComponent),
          },
          {
            path: 'documents',
            loadComponent: () =>
              import('./features/hr/hr-documents.component').then((m) => m.HrDocumentsComponent),
          },
          {
            path: 'reports',
            loadComponent: () =>
              import('./features/reports/reports-hub.component').then(
                (m) => m.ReportsHubComponent,
              ),
            data: { reportScope: 'hr' },
          },
          {
            path: 'reports/:section',
            loadComponent: () =>
              import('./features/reports/report-detail.component').then(
                (m) => m.ReportDetailComponent,
              ),
            data: { reportScope: 'hr' },
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
