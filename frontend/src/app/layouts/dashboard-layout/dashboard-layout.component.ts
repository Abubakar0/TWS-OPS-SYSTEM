import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';

import { AuthService } from '../../core/auth/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-dashboard-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatToolbarModule],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.scss',
})
export class DashboardLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.currentUser;
  readonly navItems = computed<NavItem[]>(() => {
    const user = this.user();

    if (!user) {
      return [];
    }

    const items: NavItem[] = [];

    if (user.role === 'hunter' || user.role === 'admin') {
      items.push({ label: 'Hunter Queue', icon: 'travel_explore', route: '/hunter' });
    }

    if (user.role === 'lister' || user.role === 'admin') {
      items.push({ label: 'Listing Queue', icon: 'inventory_2', route: '/lister' });
    }

    if (user.role === 'admin') {
      items.push({ label: 'Admin Console', icon: 'admin_panel_settings', route: '/admin' });
    }

    return items;
  });

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
