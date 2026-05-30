import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';

import { HunterFacade } from '../../core/facades/hunter.facade';

@Component({
  selector: 'app-hunter-submission',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    CurrencyPipe,
    DecimalPipe,
    DatePipe,
  ],
  templateUrl: './hunter-submission.component.html',
  styleUrl: './hunter-submission.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [HunterFacade],
})
export class HunterSubmissionComponent {
  readonly facade = inject(HunterFacade);
}
