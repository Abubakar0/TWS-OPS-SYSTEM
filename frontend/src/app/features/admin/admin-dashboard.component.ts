import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AdminService, AdminStats } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  readonly stats = signal<AdminStats | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly topHunters = computed(() => this.stats()?.byHunter.slice(0, 5) ?? []);
  readonly topListers = computed(() => this.stats()?.byLister.slice(0, 5) ?? []);
  readonly topAccounts = computed(() => this.stats()?.byAccount.slice(0, 5) ?? []);
  readonly recentDays = computed(() => this.stats()?.daily.slice(0, 7) ?? []);
  readonly activityFeed = computed(() => {
    const feed: Array<{ icon: string; tone: 'success' | 'warning' | 'danger' | 'info'; title: string; meta: string }> = [];
    const [leadHunter] = this.topHunters();
    const [leadLister] = this.topListers();
    const [leadAccount] = this.topAccounts();

    if (leadLister) {
      feed.push({
        icon: 'check_circle',
        tone: 'success',
        title: `${leadLister.name} completed ${leadLister.listed} listings`,
        meta: `${leadLister.assignedHunters} hunters assigned`,
      });
    }

    if (leadHunter) {
      feed.push({
        icon: 'travel_explore',
        tone: 'info',
        title: `${leadHunter.name} hunted ${leadHunter.hunted} products`,
        meta: `${leadHunter.listed} reached listed status`,
      });
    }

    if (leadAccount) {
      feed.push({
        icon: 'storefront',
        tone: 'warning',
        title: `${leadAccount.name} leads with ${leadAccount.listed} listings`,
        meta: 'Current top account output',
      });
    }

    if ((this.stats()?.rejected ?? 0) > 0) {
      feed.push({
        icon: 'error',
        tone: 'danger',
        title: `${this.stats()?.rejected || 0} products were rejected`,
        meta: 'Review pipeline quality and criteria fit',
      });
    }

    return feed;
  });

  constructor(private readonly adminApi: AdminService) {}

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminApi.getAdminStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load admin dashboard stats.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
