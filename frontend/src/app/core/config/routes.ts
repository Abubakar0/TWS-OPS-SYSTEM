export const APP_ROUTES = {
  login: '/login',
  hunter: {
    dashboard: '/hunter/dashboard',
    submission: '/hunter/submission',
    products: '/hunter/products',
  },
  lister: {
    dashboard: '/lister/dashboard',
    products: '/lister/products',
  },
  admin: {
    dashboard: '/admin/dashboard',
    users: '/admin/users',
    assignments: '/admin/assignments',
    settings: '/admin/settings',
    reports: '/admin/reports',
    accounts: '/admin/accounts',
    activity: '/admin/activity',
  },
  superAdmin: {
    dashboard: '/superadmin/dashboard',
    admins: '/superadmin/admins',
    users: '/superadmin/users',
    reports: '/superadmin/reports',
    settings: '/superadmin/settings',
    audit: '/superadmin/audit',
    system: '/superadmin/system',
    permissions: '/superadmin/permissions',
  },
} as const;
