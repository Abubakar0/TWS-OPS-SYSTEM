import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ConfirmService } from '../../core/ui/confirm.service';

interface NavItem {
  label: string;
  route: string;
  exact: boolean;
  icon: string;
}

interface SupportCard {
  title: string;
  message: string;
  actionLabel: string;
  route: string;
}

@Component({
  selector: 'app-dashboard-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ReactiveFormsModule,
    MatButtonModule,
    MatBadgeModule,
    MatIconModule,
    MatInputModule,
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
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly user = this.auth.currentUser;
  readonly sidebarOpen = signal(false);
  readonly quickSearchControl = new FormControl('', { nonNullable: true });
  private readonly quickSearchQuery = toSignal(this.quickSearchControl.valueChanges.pipe(startWith('')), {
    initialValue: '',
  });
  readonly hunterTabs: NavItem[] = [
    { label: 'Dashboard', route: '/hunter/dashboard', exact: true, icon: 'space_dashboard' },
    { label: 'Submission', route: '/hunter/submission', exact: true, icon: 'playlist_add' },
    { label: 'Products', route: '/hunter/products', exact: true, icon: 'inventory_2' },
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

  readonly workspaceItems = computed<NavItem[]>(() => {
    const user = this.user();

    if (!user) {
      return [];
    }

    if (user.role === 'hunter') {
      return [{ label: 'Hunter', route: '/hunter/dashboard', exact: false, icon: 'travel_explore' }];
    }

    if (user.role === 'lister') {
      return [{ label: 'Lister', route: '/lister/dashboard', exact: false, icon: 'storefront' }];
    }

    if (user.role === 'super_admin') {
      return [
        { label: 'Super Admin', route: '/superadmin/dashboard', exact: false, icon: 'security' },
        { label: 'Admin', route: '/admin/dashboard', exact: false, icon: 'dashboard_customize' },
      ];
    }

    if (user.role === 'admin') {
      return [
        { label: 'Hunter', route: '/hunter/dashboard', exact: false, icon: 'travel_explore' },
        { label: 'Lister', route: '/lister/dashboard', exact: false, icon: 'storefront' },
        { label: 'Admin', route: '/admin/dashboard', exact: false, icon: 'dashboard_customize' },
      ];
    }

    return [];
  });
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

    if (this.currentUrl().startsWith('/hunter')) {
      return this.hunterTabs;
    }

    if (this.currentUrl().startsWith('/lister')) {
      return this.listerTabs;
    }

    if (this.currentUrl().startsWith('/admin')) {
      return this.adminTabs;
    }

    return [];
  });
  readonly searchableItems = computed<NavItem[]>(() => {
    const all = [...this.workspaceItems(), ...this.sidebarNavItems()];
    const deduped = new Map<string, NavItem>();

    all.forEach((item) => deduped.set(item.route, item));

    return [...deduped.values()];
  });
  readonly searchMatches = computed(() => {
    const query = this.quickSearchQuery().trim().toLowerCase();

    if (!query) {
      return [];
    }

    return this.searchableItems()
      .filter((item) => item.label.toLowerCase().includes(query))
      .slice(0, 6);
  });
  readonly headerNavItems = computed(() => this.sidebarNavItems());
  readonly workspaceLabel = computed(() => {
    const url = this.currentUrl();

    if (url.startsWith('/superadmin')) {
      return 'Super Admin workspace';
    }

    if (url.startsWith('/admin')) {
      return 'Admin workspace';
    }

    if (url.startsWith('/lister')) {
      return 'Lister workspace';
    }

    return 'Hunter workspace';
  });
  readonly currentSectionLabel = computed(() => {
    const current = this.sidebarNavItems().find((item) =>
      item.exact ? this.currentUrl() === item.route : this.currentUrl().startsWith(item.route),
    );

    return current?.label || this.workspaceLabel();
  });
  readonly supportCard = computed<SupportCard>(() => {
    const url = this.currentUrl();

    if (url.startsWith('/superadmin')) {
      return {
        title: 'Need oversight?',
        message: 'Review reports, audit history, and system controls from one place.',
        actionLabel: 'Open Reports',
        route: '/superadmin/reports',
      };
    }

    if (url.startsWith('/admin')) {
      return {
        title: 'Quick access',
        message: 'Jump into users, settings, or reports without leaving the workspace.',
        actionLabel: 'Add User',
        route: '/admin/users',
      };
    }

    if (url.startsWith('/lister')) {
      return {
        title: 'Need help?',
        message: 'Keep queue actions moving with the latest listing workspace and filters.',
        actionLabel: 'View Queue',
        route: '/lister/products',
      };
    }

    return {
      title: 'Need help?',
      message: 'Review current rules and keep submissions aligned with approval settings.',
      actionLabel: 'New Submission',
      route: '/hunter/submission',
    };
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

  toggleSidebar(): void {
    this.sidebarOpen.update((value) => !value);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  async openSearchResult(route: string): Promise<void> {
    this.quickSearchControl.setValue('', { emitEvent: true });
    this.closeSidebar();
    await this.router.navigateByUrl(route);
  }

  async submitQuickSearch(): Promise<void> {
    const match = this.searchMatches()[0];

    if (!match) {
      return;
    }

    await this.openSearchResult(match.route);
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
