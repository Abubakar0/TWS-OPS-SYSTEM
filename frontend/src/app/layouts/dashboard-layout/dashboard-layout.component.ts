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
  readonly branding = BRANDING;
  readonly footerPlatforms = BRANDING.platforms.filter((platform) => platform.key !== 'operations');
  readonly hunterTabs: NavItem[] = [
    { label: 'Dashboard', route: '/hunter/dashboard', exact: true, icon: 'space_dashboard' },
    { label: 'Product Submission', route: '/hunter/submission', exact: true, icon: 'playlist_add' },
    { label: 'Product List', route: '/hunter/products', exact: true, icon: 'inventory_2' },
  ];
  readonly listerTabs: NavItem[] = [
    { label: 'Dashboard', route: '/lister/dashboard', exact: true, icon: 'space_dashboard' },
    { label: 'Listing Queue', route: '/lister/products', exact: true, icon: 'view_kanban' },
  ];
  readonly adminTabs: NavItem[] = [
    { label: 'Dashboard', route: '/admin/dashboard', exact: true, icon: 'grid_view' },
    { label: 'Users', route: '/admin/users', exact: true, icon: 'group' },
    { label: 'Assignments', route: '/admin/assignments', exact: true, icon: 'swap_horiz' },
    { label: 'Settings', route: '/admin/settings', exact: true, icon: 'tune' },
    { label: 'Reports', route: '/admin/reports', exact: true, icon: 'insert_chart' },
    { label: 'Accounts', route: '/admin/accounts', exact: true, icon: 'storefront' },
    { label: 'Activity Feed', route: '/admin/activity', exact: true, icon: 'history' },
  ];
  readonly superAdminTabs: NavItem[] = [
    { label: 'Dashboard', route: '/superadmin/dashboard', exact: true, icon: 'monitoring' },
    { label: 'Admins', route: '/superadmin/admins', exact: true, icon: 'shield_person' },
    { label: 'Users', route: '/superadmin/users', exact: true, icon: 'manage_accounts' },
    { label: 'Reports', route: '/superadmin/reports', exact: true, icon: 'query_stats' },
    { label: 'Settings', route: '/superadmin/settings', exact: true, icon: 'settings' },
    { label: 'Audit', route: '/superadmin/audit', exact: true, icon: 'history' },
    { label: 'System', route: '/superadmin/system', exact: true, icon: 'dns' },
    { label: 'Permissions', route: '/superadmin/permissions', exact: true, icon: 'admin_panel_settings' },
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

    return {
      sidebarOpen,
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
}
