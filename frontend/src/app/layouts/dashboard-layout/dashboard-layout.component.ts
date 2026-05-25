import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { BRANDING } from '../../core/config/branding';
import { ConfirmService } from '../../core/ui/confirm.service';

interface NavItem {
  label: string;
  route: string;
  exact: boolean;
  icon: string;
}

const SHARED_TEAM_ITEM: NavItem = {
  label: 'Team',
  route: '/team',
  exact: true,
  icon: 'groups',
};

const SIDEBAR_COLLAPSED_KEY = 'tws_sidebar_collapsed';

@Component({
  selector: 'app-dashboard-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatBadgeModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly user = this.auth.currentUser;
  readonly sidebarOpen = signal(false);
  readonly sidebarCollapsed = signal(this.readSidebarCollapsed());
  readonly branding = BRANDING;
  readonly footerPlatforms = BRANDING.platforms.filter((platform) => platform.key !== 'operations');
  readonly hunterTabs: NavItem[] = [
    { label: 'Dashboard', route: '/hunter/dashboard', exact: true, icon: 'space_dashboard' },
    { label: 'Product Submission', route: '/hunter/submission', exact: true, icon: 'playlist_add' },
    { label: 'Product List', route: '/hunter/products', exact: true, icon: 'inventory_2' },
    { label: 'Change Requests', route: '/hunter/changes', exact: true, icon: 'edit_note' },
    { label: 'Weekly Review', route: '/hunter/review', exact: true, icon: 'assignment_turned_in' },
    { label: 'Hunting Rules', route: '/hunter/rules', exact: true, icon: 'rule' },
    SHARED_TEAM_ITEM,
  ];
  readonly listerTabs: NavItem[] = [
    { label: 'Dashboard', route: '/lister/dashboard', exact: true, icon: 'space_dashboard' },
    { label: 'Listing Queue', route: '/lister/products', exact: true, icon: 'view_kanban' },
    { label: 'Change Requests', route: '/lister/changes', exact: true, icon: 'fact_check' },
    { label: 'Account Usage', route: '/lister/account-usage', exact: true, icon: 'storefront' },
    SHARED_TEAM_ITEM,
  ];
  readonly adminTabs: NavItem[] = [
    { label: 'Dashboard', route: '/admin/dashboard', exact: true, icon: 'grid_view' },
    { label: 'Users', route: '/admin/users', exact: true, icon: 'group' },
    { label: 'Assignments', route: '/admin/assignments', exact: true, icon: 'swap_horiz' },
    { label: 'Products', route: '/admin/products', exact: true, icon: 'inventory_2' },
    { label: 'Settings', route: '/admin/settings', exact: true, icon: 'tune' },
    { label: 'Reports', route: '/admin/reports', exact: true, icon: 'insert_chart' },
    { label: 'Accounts', route: '/admin/accounts', exact: true, icon: 'storefront' },
    { label: 'Activity Feed', route: '/admin/activity', exact: true, icon: 'history' },
    SHARED_TEAM_ITEM,
  ];
  readonly superAdminTabs: NavItem[] = [
    { label: 'Dashboard', route: '/superadmin/dashboard', exact: true, icon: 'monitoring' },
    { label: 'Admins', route: '/superadmin/admins', exact: true, icon: 'shield_person' },
    { label: 'Users', route: '/superadmin/users', exact: true, icon: 'manage_accounts' },
    { label: 'Reports', route: '/superadmin/reports', exact: true, icon: 'query_stats' },
    { label: 'Settings', route: '/superadmin/settings', exact: true, icon: 'settings' },
    { label: 'Audit', route: '/superadmin/audit', exact: true, icon: 'history' },
    { label: 'System', route: '/superadmin/system', exact: true, icon: 'dns' },
    { label: 'Security', route: '/superadmin/security', exact: true, icon: 'lan' },
    { label: 'Permissions', route: '/superadmin/permissions', exact: true, icon: 'admin_panel_settings' },
    SHARED_TEAM_ITEM,
  ];

  readonly sidebarNavItems = computed<NavItem[]>(() => {
    const user = this.user();

    if (!user) {
      return [];
    }

    if (user.role === 'hunter') {
      return this.hunterTabs;
    }

    if (user.role === 'lister') {
      return this.listerTabs;
    }

    if (user.role === 'super_admin') {
      return this.superAdminTabs;
    }

    if (user.role === 'admin') {
      return this.adminTabs;
    }

    return [];
  });
  readonly roleLabel = computed(() => {
    const role = this.user()?.role;

    if (!role) {
      return '';
    }

    return role === 'super_admin'
      ? 'Super Admin'
      : role.charAt(0).toUpperCase() + role.slice(1);
  });
  readonly userInitials = computed(() => {
    const name = this.user()?.name?.trim();

    if (!name) {
      return 'TW';
    }

    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
  });
  readonly shellVm = computed(() => {
    const user = this.user();
    const roleLabel = this.roleLabel();
    const sidebarOpen = this.sidebarOpen();
    const sidebarCollapsed = this.sidebarCollapsed();

    return {
      sidebarOpen,
      sidebarCollapsed,
      navItems: this.sidebarNavItems(),
      userName: user?.name || this.branding.productName,
      userEmail: user?.email || 'workspace@trendwavesolutions.com',
      roleLabel,
      userInitials: this.userInitials(),
      footerPlatforms: this.footerPlatforms,
      version: this.branding.version,
      environmentLabel: this.branding.environmentLabel,
      homeRoute: user ? this.homeRouteForRole(user.role) : '/login',
    };
  });

  private homeRouteForRole(role?: string): string {
    switch (role) {
      case 'hunter':
        return '/hunter/dashboard';
      case 'lister':
        return '/lister/dashboard';
      case 'super_admin':
        return '/superadmin/dashboard';
      case 'admin':
        return '/admin/dashboard';
      default:
        return '/login';
    }
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((value) => !value);
  }

  toggleSidebarCollapsed(): void {
    this.sidebarCollapsed.update((value) => {
      const next = !value;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(next));
      return next;
    });
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  async logout(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Log out?',
      message: 'Your current session will be cleared on this device.',
      confirmText: 'Log out',
    });

    if (!confirmed) {
      return;
    }

    this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  private readSidebarCollapsed(): boolean {
    try {
      return JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) || 'false') === true;
    } catch (error) {
      return false;
    }
  }
}
