import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Meta } from '@angular/platform-browser';
import { filter, map, startWith } from 'rxjs';

import { SystemApiService } from '../../core/api/system-api.service';
import { TeamApiService } from '../../core/api/team-api.service';
import { HrApiService } from '../../core/api/hr-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { BRANDING } from '../../core/config/branding';
import { MyHrProfile } from '../../core/models/hr.models';
import { AnnouncementBarSettings } from '../../core/models/system.models';
import { WorkspaceSyncService } from '../../core/state/workspace-sync.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { isTrainingHunterUser, userHasRole } from '../../core/models/auth.models';
import { Title } from '@angular/platform-browser';

interface NavItem {
  label: string;
  route: string;
  exact: boolean;
  icon: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SHARED_TEAM_ITEM: NavItem = {
  label: 'Team',
  route: '/team',
  exact: true,
  icon: 'groups',
};

const ORDER_PROCESSING_ITEM: NavItem = {
  label: 'Processing Queue',
  route: '/orders/processing',
  exact: true,
  icon: 'bolt',
};

const ORDER_PROCESSOR_ISSUES_ITEM: NavItem = {
  label: 'Issues',
  route: '/order-processor/issues',
  exact: true,
  icon: 'error_outline',
};

const MY_HR_ITEM: NavItem = {
  label: 'My Profile',
  route: '/my-hr',
  exact: true,
  icon: 'badge',
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
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly systemApi = inject(SystemApiService);
  private readonly teamApi = inject(TeamApiService);
  private readonly hrApi = inject(HrApiService);
  private readonly workspaceSync = inject(WorkspaceSyncService);
  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly user = this.auth.currentUser;
  readonly announcement = signal<AnnouncementBarSettings | null>(null);
  readonly birthdayProfile = signal<MyHrProfile | null>(null);
  readonly birthdaySaving = signal(false);
  readonly teamName = signal('');
  readonly sidebarOpen = signal(false);
  readonly sidebarCollapsed = signal(this.readSidebarCollapsed());
  readonly branding = BRANDING;
  readonly footerPlatforms = BRANDING.platforms.filter((platform) => platform.key !== 'operations');
  readonly hunterTabs: NavItem[] = [
    { label: 'Dashboard', route: '/hunter/dashboard', exact: true, icon: 'space_dashboard' },
    { label: 'Product Submission', route: '/hunter/submission', exact: true, icon: 'playlist_add' },
    { label: 'Product List', route: '/hunter/products', exact: true, icon: 'inventory_2' },
    { label: 'Orders', route: '/hunter/orders', exact: true, icon: 'receipt_long' },
    { label: 'Order Issues', route: '/hunter/order-issues', exact: true, icon: 'error_outline' },
    { label: 'Change Requests', route: '/hunter/changes', exact: true, icon: 'edit_note' },
    { label: 'Weekly Review', route: '/hunter/review', exact: true, icon: 'assignment_turned_in' },
    { label: 'Hunting Rules', route: '/hunter/rules', exact: true, icon: 'rule' },
    { label: 'My Training Progress', route: '/hunter/training-progress', exact: true, icon: 'school' },
    SHARED_TEAM_ITEM,
  ];
  readonly listerTabs: NavItem[] = [
    { label: 'Dashboard', route: '/lister/dashboard', exact: true, icon: 'space_dashboard' },
    { label: 'Listing Queue', route: '/lister/products', exact: true, icon: 'view_kanban' },
    { label: 'Listing Review Queue', route: '/lister/listing-reviews', exact: true, icon: 'fact_check' },
    { label: 'Orders', route: '/lister/orders', exact: true, icon: 'receipt_long' },
    { label: 'Change Requests', route: '/lister/changes', exact: true, icon: 'fact_check' },
    { label: 'Account Usage', route: '/lister/account-usage', exact: true, icon: 'storefront' },
    SHARED_TEAM_ITEM,
  ];
  readonly adminTabs: NavItem[] = [
    { label: 'Dashboard', route: '/admin/dashboard', exact: true, icon: 'grid_view' },
    { label: 'Users', route: '/admin/users', exact: true, icon: 'group' },
    { label: 'Assignments', route: '/admin/assignments', exact: true, icon: 'swap_horiz' },
    { label: 'Products', route: '/admin/products', exact: true, icon: 'inventory_2' },
    { label: 'Listing Reviews', route: '/admin/listing-reviews', exact: true, icon: 'fact_check' },
    { label: 'Orders', route: '/admin/orders', exact: true, icon: 'receipt_long' },
    { label: 'Order Issues', route: '/admin/order-issues', exact: true, icon: 'error_outline' },
    { label: 'Change Requests', route: '/admin/change-requests', exact: true, icon: 'fact_check' },
    { label: 'Settings', route: '/admin/settings', exact: true, icon: 'tune' },
    { label: 'Reports', route: '/admin/reports', exact: true, icon: 'insert_chart' },
    { label: 'Accounts', route: '/admin/accounts', exact: true, icon: 'storefront' },
    { label: 'Activity Feed', route: '/admin/activity', exact: true, icon: 'history' },
    SHARED_TEAM_ITEM,
  ];
  readonly orderProcessorTabs: NavItem[] = [
    {
      label: 'Dashboard',
      route: '/order-processor/dashboard',
      exact: true,
      icon: 'space_dashboard',
    },
    { label: 'Orders', route: '/order-processor/orders', exact: true, icon: 'receipt_long' },
    { label: 'Add Order', route: '/order-processor/orders/new', exact: true, icon: 'add_circle' },
    ORDER_PROCESSOR_ISSUES_ITEM,
  ];
  readonly hrTabs: NavItem[] = [
    { label: 'HR Dashboard', route: '/hr/dashboard', exact: true, icon: 'monitoring' },
    { label: 'Employees', route: '/hr/employees', exact: true, icon: 'badge' },
    { label: 'Attendance', route: '/hr/attendance', exact: true, icon: 'event_available' },
    { label: 'Leaves', route: '/hr/leaves', exact: true, icon: 'event_busy' },
    { label: 'Payroll', route: '/hr/payroll', exact: true, icon: 'payments' },
    { label: 'Expenses', route: '/hr/expenses', exact: true, icon: 'receipt' },
    { label: 'Performance', route: '/hr/performance', exact: true, icon: 'leaderboard' },
    { label: 'Warnings', route: '/hr/warnings', exact: true, icon: 'warning_amber' },
    { label: 'Documents', route: '/hr/documents', exact: true, icon: 'folder_copy' },
    { label: 'Reports', route: '/hr/reports', exact: true, icon: 'query_stats' },
  ];
  readonly superAdminTabs: NavItem[] = [
    { label: 'Dashboard', route: '/superadmin/dashboard', exact: true, icon: 'monitoring' },
    { label: 'Admins', route: '/superadmin/admins', exact: true, icon: 'shield_person' },
    { label: 'Users', route: '/superadmin/users', exact: true, icon: 'manage_accounts' },
    { label: 'Products', route: '/superadmin/products', exact: true, icon: 'inventory_2' },
    { label: 'Listing Reviews', route: '/superadmin/listing-reviews', exact: true, icon: 'fact_check' },
    { label: 'Reports', route: '/superadmin/reports', exact: true, icon: 'query_stats' },
    { label: 'Orders', route: '/superadmin/orders', exact: true, icon: 'receipt_long' },
    { label: 'Product Transfers', route: '/superadmin/product-transfers', exact: true, icon: 'swap_horiz' },
    { label: 'Settings', route: '/superadmin/settings', exact: true, icon: 'settings' },
    { label: 'System', route: '/superadmin/system', exact: true, icon: 'dns' },
    { label: 'Security', route: '/superadmin/security', exact: true, icon: 'lan' },
    { label: 'Audit', route: '/superadmin/audit', exact: true, icon: 'history' },
    SHARED_TEAM_ITEM,
  ];

  readonly sidebarSections = computed<NavSection[]>(() => {
    const user = this.user();

    if (!user) {
      return [];
    }

    const canProcessOrders =
      userHasRole(user, 'admin') ||
      userHasRole(user, 'super_admin') ||
      userHasRole(user, 'order_processor') ||
      Boolean(user.permissions?.canProcessOrders);
    const sections: NavSection[] = [];

    if (userHasRole(user, 'super_admin')) {
      sections.push({ label: 'Super Admin', items: [...this.superAdminTabs] });
    }

    if (userHasRole(user, 'admin')) {
      const adminItems = [...this.adminTabs];

      if (canProcessOrders) {
        adminItems.push(ORDER_PROCESSING_ITEM);
      }

      sections.push({ label: 'Admin', items: adminItems });
    }

    if (userHasRole(user, 'hr') || userHasRole(user, 'super_admin')) {
      sections.push({ label: 'HR', items: [...this.hrTabs] });
    }

    if (userHasRole(user, 'hunter')) {
      const hunterItems = isTrainingHunterUser(user)
        ? this.hunterTabs.filter((item) =>
            (user.trainingRulesAcknowledgedAt
              ? ['/hunter/submission', '/hunter/products', '/hunter/rules', '/hunter/training-progress']
              : ['/hunter/products', '/hunter/rules', '/hunter/training-progress']
            ).includes(item.route),
          )
        : this.hunterTabs;

      sections.push({ label: 'Hunter', items: [...hunterItems, MY_HR_ITEM] });
    }

    if (userHasRole(user, 'lister')) {
      sections.push({ label: 'Lister', items: [...this.listerTabs, MY_HR_ITEM] });
    }

    if (userHasRole(user, 'order_processor')) {
      sections.push({ label: 'Order Processor', items: [...this.orderProcessorTabs, MY_HR_ITEM] });
    }

    if (!sections.length) {
      sections.push({ label: 'Workspace', items: [MY_HR_ITEM] });
    }

    return sections;
  });
  readonly roleLabel = computed(() => {
    const user = this.user();
    const role = user?.role;

    if (!role) {
      return '';
    }

    if (userHasRole(user, 'admin') && userHasRole(user, 'hr')) {
      return 'Admin + HR';
    }

    if (userHasRole(user, 'super_admin') && userHasRole(user, 'hr')) {
      return 'Super Admin + HR';
    }

    return role === 'super_admin'
      ? 'Super Admin'
      : role === 'hr'
        ? 'HR'
        : role === 'order_processor'
          ? 'Order Processor'
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
      navSections: this.sidebarSections(),
      userName: user?.name || this.branding.productName,
      userEmail: user?.email || 'workspace@trendwavesolutions.com',
      roleLabel,
      userInitials: this.userInitials(),
      teamName: this.teamName(),
      roleBadges: user?.roles?.length ? user.roles : user?.role ? [user.role] : [],
      footerPlatforms: this.footerPlatforms,
      version: this.branding.version,
      environmentLabel: this.branding.environmentLabel,
      homeRoute: user ? this.homeRouteForRole(user.role) : '/login',
    };
  });
  private birthdayCheckedUserId = '';

  constructor() {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.loadAnnouncement();

    effect(() => {
      const version = this.workspaceSync.settingsVersion();

      if (version > 0) {
        this.loadAnnouncement(true);
      }
    });

    effect(() => {
      const currentUrl = this.currentUrl();
      this.title.setTitle(`${this.resolvePageTitle(currentUrl)} | ${this.branding.productName}`);
    });

    effect(() => {
      const user = this.user();

      if (!user) {
        this.teamName.set('');
        this.birthdayProfile.set(null);
        this.birthdayCheckedUserId = '';
        return;
      }

      this.teamApi.listTeams().subscribe({
        next: (teams) => {
          const currentTeam = teams.find((team) =>
            team.members.some((member) => member.id === user.id),
          );
          this.teamName.set(currentTeam?.name || '');
        },
        error: () => {
          this.teamName.set('');
        },
      });
    });

    effect(() => {
      const user = this.user();

      if (!user) {
        this.birthdayProfile.set(null);
        this.birthdayCheckedUserId = '';
        return;
      }

      if (this.birthdayCheckedUserId === user.id) {
        return;
      }

      this.birthdayCheckedUserId = user.id;
      this.checkBirthdayPopup();
    });
  }

  private homeRouteForRole(role?: string): string {
    if (isTrainingHunterUser(this.user())) {
      return '/hunter/rules';
    }

    switch (role) {
      case 'hunter':
        return '/hunter/dashboard';
      case 'lister':
        return '/lister/dashboard';
      case 'hr':
        return '/hr/dashboard';
      case 'super_admin':
        return '/superadmin/dashboard';
      case 'order_processor':
        return '/order-processor/dashboard';
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

  dismissBirthdayModal(): void {
    if (this.birthdaySaving()) {
      return;
    }

    this.birthdaySaving.set(true);
    this.hrApi.markBirthdayPopupShown().subscribe({
      next: (profile) => {
        this.birthdayProfile.set(profile.showBirthdayModal ? profile : null);
        this.birthdaySaving.set(false);
      },
      error: () => {
        this.birthdayProfile.set(null);
        this.birthdaySaving.set(false);
      },
    });
  }

  private readSidebarCollapsed(): boolean {
    try {
      return JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) || 'false') === true;
    } catch (error) {
      return false;
    }
  }

  private loadAnnouncement(bypassCache = false): void {
    this.systemApi.getAnnouncement(bypassCache).subscribe({
      next: (announcement) => {
        this.announcement.set(announcement.enabled && announcement.message ? announcement : null);
      },
      error: () => {
        this.announcement.set(null);
      },
    });
  }

  private checkBirthdayPopup(): void {
    this.hrApi.getMyHr().subscribe({
      next: (profile) => {
        this.birthdayProfile.set(profile.showBirthdayModal ? profile : null);
      },
      error: () => {
        this.birthdayProfile.set(null);
      },
    });
  }

  private resolvePageTitle(url: string): string {
    const path = (url || '').split('?')[0];
    const navTitle =
      this.sidebarSections()
        .flatMap((section) => section.items)
        .find((item) => (item.exact ? item.route === path : path.startsWith(item.route)))?.label ||
      '';

    if (navTitle) {
      return navTitle;
    }

    if (path.startsWith('/my-hr')) {
      return 'My HR';
    }

    if (path.startsWith('/team')) {
      return 'Team';
    }

    if (path.startsWith('/login')) {
      return 'Sign In';
    }

    return 'Workspace';
  }
}
