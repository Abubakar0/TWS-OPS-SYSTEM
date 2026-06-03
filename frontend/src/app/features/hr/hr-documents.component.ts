import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { HrApiService } from '../../core/api/hr-api.service';
import { DocumentRecord, EmployeeProfile } from '../../core/models/hr.models';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';

@Component({
  selector: 'app-hr-documents',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './hr-documents.component.html',
  styleUrl: './hr-shared.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrDocumentsComponent implements OnInit {
  private readonly hrApi = inject(HrApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly rows = signal<DocumentRecord[]>([]);
  readonly employees = signal<EmployeeProfile[]>([]);
  readonly page = signal(1);
  readonly limit = signal(30);
  readonly total = signal(0);

  readonly employeeFilter = new FormControl('', { nonNullable: true });
  readonly typeFilter = new FormControl('', { nonNullable: true });

  readonly documentForm = new FormGroup({
    employeeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    documentType: new FormControl('CV', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    fileName: new FormControl('', { nonNullable: true }),
    fileUrl: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  readonly pageLabel = computed(() => {
    const total = this.total();
    if (!total) {
      return 'No documents to show';
    }
    const start = (this.page() - 1) * this.limit() + 1;
    const end = Math.min(total, start + this.rows().length - 1);
    return `Showing ${start}-${end} of ${total}`;
  });

  ngOnInit(): void {
    this.loadEmployees();
    this.loadDocuments();
  }

  loadEmployees(): void {
    this.hrApi.listEmployees({ limit: 100 }).subscribe({
      next: (result) => this.employees.set(result.items),
      error: () => undefined,
    });
  }

  loadDocuments(page = this.page()): void {
    this.loading.set(true);
    this.error.set('');
    this.hrApi
      .listDocuments({
        page,
        limit: this.limit(),
        employeeId: this.employeeFilter.value,
        documentType: this.typeFilter.value,
      })
      .subscribe({
        next: (result) => {
          this.rows.set(result.items);
          this.page.set(result.page);
          this.limit.set(result.limit);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error?.error?.message || 'Could not load employee documents.');
          this.loading.set(false);
        },
      });
  }

  resetForm(): void {
    this.documentForm.reset({
      employeeId: '',
      documentType: 'CV',
      title: '',
      fileName: '',
      fileUrl: '',
      notes: '',
    });
  }

  uploadDocument(): void {
    if (this.documentForm.invalid || this.saving()) {
      this.documentForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.hrApi.uploadDocument(this.documentForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success('Document saved.');
        this.saving.set(false);
        this.resetForm();
        this.loadDocuments(1);
      },
      error: (error) => {
        this.toast.error(error?.error?.message || 'Could not save document.');
        this.saving.set(false);
      },
    });
  }

  deleteDocument(documentId: string): void {
    this.hrApi.deleteDocument(documentId).subscribe({
      next: () => {
        this.toast.success('Document deleted.');
        this.loadDocuments(this.page());
      },
      error: (error) => this.toast.error(error?.error?.message || 'Could not delete document.'),
    });
  }

  previousPage(): void {
    this.loadDocuments(Math.max(this.page() - 1, 1));
  }

  nextPage(): void {
    this.loadDocuments(this.page() + 1);
  }
}
