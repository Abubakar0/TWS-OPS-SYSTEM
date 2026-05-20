import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';

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
})
export class DashboardLayoutComponent {
  private readonly auth = inject(AuthService);
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

  readonly primaryNavItems = computed<NavItem[]>(() => {
    const user = this.user();

    if (!user) {
      return [];
    }

    if (user.role === 'hunter') {
      return this.hunterTabs;
    }

    const items: NavItem[] = [];

    if (user.role === 'admin') {
      items.push({ label: 'Hunter Workspace', route: '/hunter/dashboard', exact: false });
      items.push({ label: 'Lister Workspace', route: '/lister', exact: true });
      items.push({ label: 'Admin Console', route: '/admin', exact: true });
      return items;
    }

    return [{ label: 'Listing Queue', route: '/lister', exact: true }];
  });
  readonly showHunterTabs = computed(() => {
    const user = this.user();
    return user?.role === 'admin' && this.currentUrl().startsWith('/hunter');
  });
  readonly workspaceLabel = computed(() => {
    const url = this.currentUrl();

    if (url.startsWith('/admin')) {
      return 'Admin workspace';
    }

    if (url.startsWith('/lister')) {
      return 'Lister workspace';
    }

    return 'Hunter workspace';
  });

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
