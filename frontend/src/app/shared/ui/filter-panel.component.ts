import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <section class="filter-panel-card">
      <button type="button" class="filter-panel-card__summary" (click)="toggle()">
        <div class="filter-panel__title">
          <span class="filter-panel-card__icon">
            <mat-icon>{{ icon() }}</mat-icon>
          </span>
          <div>
            <span class="filter-panel-card__heading">{{ title() }}</span>
            @if (summary()) {
              <p>{{ summary() }}</p>
            }
          </div>
        </div>

        <div class="filter-panel__meta">
          @if (badge()) {
            <span class="count-badge">{{ badge() }}</span>
          }
          <span>{{ expanded() ? hideLabel() : showLabel() }}</span>
          <span class="filter-panel__chevron" [class.is-open]="expanded()">
            <mat-icon>expand_more</mat-icon>
          </span>
        </div>
      </button>

      @if (expanded()) {
        <div class="filter-panel__content">
          <ng-content />
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .filter-panel-card {
      border: 1px solid rgba(226, 232, 240, 0.96);
      border-radius: var(--tws-radius-lg);
      background: rgba(248, 250, 252, 0.55);
    }

    .filter-panel-card__summary {
      width: 100%;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 13px 15px;
      border: 0;
      border-radius: inherit;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }

    .filter-panel-card__summary:hover {
      background: rgba(81, 146, 229, 0.04);
    }

    .filter-panel-card__icon {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 12px;
      background: rgba(81, 146, 229, 0.08);
      color: var(--tws-primary-strong);
      flex: 0 0 auto;
    }

    .filter-panel-card__heading {
      display: block;
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--tws-text);
    }

    .filter-panel__title {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-width: 0;
    }

    .filter-panel__meta {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      min-width: 0;
      color: var(--tws-muted);
      font-size: 0.82rem;
      font-weight: 600;
      text-align: right;
    }

    .filter-panel-card__summary p {
      margin-top: 4px;
      color: var(--tws-muted);
      font-size: 0.78rem;
      font-weight: 500;
    }

    .filter-panel__chevron {
      display: inline-flex;
      transition: transform 0.18s ease;
    }

    .filter-panel__chevron.is-open {
      transform: rotate(180deg);
    }

    @media (max-width: 760px) {
      .filter-panel-card__summary {
        align-items: flex-start;
      }

      .filter-panel__meta {
        justify-content: flex-start;
        text-align: left;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterPanelComponent implements OnInit {
  readonly title = input.required<string>();
  readonly summary = input('');
  readonly icon = input('filter_list');
  readonly storageKey = input('');
  readonly badge = input('');
  readonly showLabel = input('Show Filters');
  readonly hideLabel = input('Hide Filters');
  readonly defaultExpanded = input(false);

  private readonly expandedState = signal(false);
  readonly expanded = computed(() => this.expandedState());

  ngOnInit(): void {
    this.expandedState.set(this.readState());
  }

  toggle(): void {
    const next = !this.expandedState();
    this.expandedState.set(next);
    this.writeState(next);
  }

  private readState(): boolean {
    const key = this.storageKey();

    if (!key) {
      return this.defaultExpanded();
    }

    try {
      return (
        JSON.parse(localStorage.getItem(key) || JSON.stringify(this.defaultExpanded())) === true
      );
    } catch {
      return this.defaultExpanded();
    }
  }

  private writeState(value: boolean): void {
    const key = this.storageKey();

    if (!key) {
      return;
    }

    localStorage.setItem(key, JSON.stringify(value));
  }
}
