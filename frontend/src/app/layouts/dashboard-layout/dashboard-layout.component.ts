import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ConfirmService } from '../../core/ui/confirm.service';

interface NavItem {
  label: string;
  route: string;
  exact: boolean;
}

@Component({
  selector: 'app-dashboard-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule],
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
  readonly hunterTabs: NavItem[] = [
    { label: 'Dashboard', route: '/hunter/dashboard', exact: true },
    { label: 'Product Submission', route: '/hunter/submission', exact: true },
    { label: 'Product List', route: '/hunter/products', exact: true },
  ];
  readonly listerTabs: NavItem[] = [
    { label: 'Dashboard', route: '/lister/dashboard', exact: true },
    { label: 'Hunter Products', route: '/lister/products', exact: true },
  ];
  readonly adminTabs: NavItem[] = [
    { label: 'Dashboard', route: '/admin/dashboard', exact: true },
    { label: 'Users', route: '/admin/users', exact: true },
    { label: 'Assignments', route: '/admin/assignments', exact: true },
    { label: 'Settings', route: '/admin/settings', exact: true },
    { label: 'Reports', route: '/admin/reports', exact: true },
  ];
  readonly superAdminTabs: NavItem[] = [
    { label: 'Dashboard', route: '/superadmin/dashboard', exact: true },
    { label: 'Admins', route: '/superadmin/admins', exact: true },
    { label: 'Users', route: '/superadmin/users', exact: true },
    { label: 'Reports', route: '/superadmin/reports', exact: true },
    { label: 'Settings', route: '/superadmin/settings', exact: true },
    { label: 'Audit', route: '/superadmin/audit', exact: true },
    { label: 'System', route: '/superadmin/system', exact: true },
    { label: 'Permissions', route: '/superadmin/permissions', exact: true },
  ];

  readonly primaryNavItems = computed<NavItem[]>(() => {
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

    const items: NavItem[] = [];

    if (user.role === 'admin') {
      items.push({ label: 'Hunter Workspace', route: '/hunter/dashboard', exact: false });
      items.push({ label: 'Lister Workspace', route: '/lister/dashboard', exact: false });
      items.push({ label: 'Admin Console', route: '/admin/dashboard', exact: false });
      return items;
    }

    return [];
  });
  readonly secondaryNavItems = computed<NavItem[]>(() => {
    const user = this.user();

    if (user?.role !== 'admin') {
      return [];
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
