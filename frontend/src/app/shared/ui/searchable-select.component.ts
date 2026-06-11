import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime, distinctUntilChanged } from 'rxjs';

export interface SearchableSelectOption<T = string> {
  value: T;
  label: string;
  description?: string | null;
  disabled?: boolean;
}

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchableSelectComponent),
      multi: true,
    },
  ],
  template: `
    <mat-form-field appearance="outline" class="searchable-select-field">
      <mat-label>{{ label() }}</mat-label>

      <mat-select
        [multiple]="multiple()"
        [disabled]="resolvedDisabled()"
        [value]="selectedValue()"
        (selectionChange)="handleSelectionChange($event.value)"
        (openedChange)="handleOpenedChange($event)"
      >
        <mat-select-trigger>
          {{ triggerLabel() }}
        </mat-select-trigger>

        <div
          class="searchable-select__panel-tools"
          (click)="stopOverlayEvent($event)"
          (keydown)="stopOverlayEvent($event)"
        >
          <mat-icon>search</mat-icon>
          <input
            #searchInput
            matInput
            [placeholder]="searchPlaceholder()"
            [formControl]="searchControl"
            autocomplete="off"
          />
          @if (searchQuery()) {
            <button
              mat-icon-button
              type="button"
              class="searchable-select__panel-clear"
              (click)="clearSearch($event)"
              aria-label="Clear option search"
            >
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>

        @if (loading()) {
          <div class="searchable-select__status">
            <mat-spinner diameter="18"></mat-spinner>
            <span>{{ loadingLabel() }}</span>
          </div>
        } @else if (!filteredOptions().length) {
          <div class="searchable-select__status searchable-select__status--empty">
            <mat-icon>search_off</mat-icon>
            <span>{{ emptyLabel() }}</span>
          </div>
        } @else {
          @for (option of filteredOptions(); track option.label + '' + option.value) {
            <mat-option [value]="option.value" [disabled]="option.disabled">
              <div class="searchable-select__option">
                <span>{{ option.label }}</span>
                @if (option.description) {
                  <small>{{ option.description }}</small>
                }
              </div>
            </mat-option>
          }
        }

        @if (hasMore() && !loading()) {
          <div class="searchable-select__load-more">
            <button mat-stroked-button type="button" (click)="requestMore($event)">
              {{ loadMoreLabel() }}
            </button>
          </div>
        }
      </mat-select>

      @if (clearable() && hasValue() && !resolvedDisabled()) {
        <button
          mat-icon-button
          matSuffix
          type="button"
          (click)="clearSelection($event)"
          aria-label="Clear selected value"
        >
          <mat-icon>close</mat-icon>
        </button>
      }

      @if (hint()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }

    .searchable-select-field {
      width: 100%;
    }

    .searchable-select__panel-tools {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px 8px;
      background: #fff;
      border-bottom: 1px solid rgba(226, 232, 240, 0.96);
    }

    .searchable-select__panel-tools .mat-icon {
      color: var(--tws-muted);
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .searchable-select__panel-tools input {
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      outline: 0;
      background: transparent;
      font: inherit;
      color: inherit;
    }

    .searchable-select__panel-clear {
      width: 30px;
      height: 30px;
      flex: 0 0 auto;
    }

    .searchable-select__status {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      color: var(--tws-muted);
      font-size: 0.85rem;
    }

    .searchable-select__status--empty .mat-icon {
      color: var(--tws-muted);
    }

    .searchable-select__option {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .searchable-select__option small {
      color: var(--tws-muted);
      font-size: 0.75rem;
      line-height: 1.3;
    }

    .searchable-select__load-more {
      padding: 10px 12px 12px;
      border-top: 1px solid rgba(226, 232, 240, 0.96);
      background: #fff;
    }

    .searchable-select__load-more button {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchableSelectComponent<T = string>
  implements ControlValueAccessor
{
  readonly label = input.required<string>();
  readonly options = input<readonly SearchableSelectOption<T>[]>([]);
  readonly multiple = input(false);
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly clearable = input(true);
  readonly hint = input('');
  readonly searchPlaceholder = input('Search options');
  readonly emptyLabel = input('No matching options found.');
  readonly loadingLabel = input('Loading options');
  readonly serverSearch = input(false);
  readonly hasMore = input(false);
  readonly loadMoreLabel = input('Load More');

  readonly searchChanged = output<string>();
  readonly loadMoreRequested = output<void>();

  readonly searchControl = new FormControl('', { nonNullable: true });

  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly internalValue = signal<T | T[] | null>(null);
  private readonly controlDisabled = signal(false);
  readonly searchQuery = signal('');
  readonly selectedValue = computed(() =>
    this.internalValue() ?? (this.multiple() ? [] : null),
  );
  readonly resolvedDisabled = computed(() => this.disabled() || this.controlDisabled());
  readonly hasValue = computed(() => {
    const current = this.selectedValue();

    if (Array.isArray(current)) {
      return current.length > 0;
    }

    return current !== null && current !== undefined && current !== '';
  });
  readonly filteredOptions = computed(() => {
    const options = this.options();
    const query = this.searchQuery().trim().toLowerCase();

    if (!query || this.serverSearch()) {
      return options;
    }

    return options.filter((option) =>
      [option.label, option.description || '']
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  });
  readonly triggerLabel = computed(() => {
    const current = this.selectedValue();

    if (Array.isArray(current)) {
      if (!current.length) {
        return '';
      }

      return current
        .map((value) => this.options().find((option) => option.value === value)?.label || String(value))
        .join(', ');
    }

    if (current === null || current === undefined || current === '') {
      return '';
    }

    return this.options().find((option) => option.value === current)?.label || String(current);
  });

  private onChange: (value: T | T[] | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.searchQuery.set(value.trim());
        this.searchChanged.emit(value.trim());
      });
  }

  writeValue(value: T | T[] | null): void {
    if (this.multiple()) {
      this.internalValue.set(Array.isArray(value) ? value : []);
      return;
    }

    this.internalValue.set(Array.isArray(value) ? (value[0] ?? null) : value);
  }

  registerOnChange(fn: (value: T | T[] | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.controlDisabled.set(isDisabled);
  }

  handleSelectionChange(value: T | T[] | null): void {
    this.internalValue.set(value);
    this.onChange(value);
    this.onTouched();
  }

  handleOpenedChange(open: boolean): void {
    if (!open) {
      return;
    }

    queueMicrotask(() => this.searchInputRef()?.nativeElement.focus());
  }

  clearSelection(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const nextValue = this.multiple() ? [] : null;
    this.internalValue.set(nextValue as T | T[] | null);
    this.onChange(nextValue as T | T[] | null);
    this.onTouched();
  }

  clearSearch(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.searchControl.setValue('', { emitEvent: true });
    queueMicrotask(() => this.searchInputRef()?.nativeElement.focus());
  }

  requestMore(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.loadMoreRequested.emit();
  }

  stopOverlayEvent(event: Event): void {
    event.stopPropagation();
  }
}
