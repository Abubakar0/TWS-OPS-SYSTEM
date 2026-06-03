import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { PageResult } from '../state/query-state.models';
import {
  AttendanceEntry,
  DocumentRecord,
  EmployeeProfile,
  ExpenseRecord,
  HrPerformanceRow,
  HrDashboardStats,
  HrReport,
  LeaveRequest,
  MyHrProfile,
  PayrollRecord,
  WarningRecord,
} from '../models/hr.models';

@Injectable({ providedIn: 'root' })
export class HrApiService {
  constructor(private readonly http: HttpClient) {}

  private buildParams(filters: Record<string, unknown> = {}): HttpParams {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return params;
  }

  getDashboard(filters: Record<string, unknown> = {}): Observable<HrDashboardStats> {
    return this.http
      .get<{ stats: HrDashboardStats }>(`${environment.apiUrl}/hr/dashboard`, {
        params: this.buildParams(filters),
      })
      .pipe(map((response) => response.stats));
  }

  getMyHr(): Observable<MyHrProfile> {
    return this.http
      .get<{ profile: MyHrProfile }>(`${environment.apiUrl}/hr/me`)
      .pipe(map((response) => response.profile));
  }

  listEmployees(filters: Record<string, unknown> = {}): Observable<PageResult<EmployeeProfile>> {
    return this.http
      .get<{ employees: EmployeeProfile[]; page: number; limit: number; total: number; hasMore: boolean }>(
        `${environment.apiUrl}/hr/employees`,
        { params: this.buildParams(filters) },
      )
      .pipe(
        map((response) => ({
          items: response.employees,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.hasMore,
        })),
      );
  }

  createEmployee(payload: Partial<EmployeeProfile>): Observable<EmployeeProfile> {
    return this.http
      .post<{ employee: EmployeeProfile }>(`${environment.apiUrl}/hr/employees`, payload)
      .pipe(map((response) => response.employee));
  }

  updateEmployee(id: string, payload: Partial<EmployeeProfile>): Observable<EmployeeProfile> {
    return this.http
      .patch<{ employee: EmployeeProfile }>(`${environment.apiUrl}/hr/employees/${id}`, payload)
      .pipe(map((response) => response.employee));
  }

  getEmployee(id: string): Observable<EmployeeProfile> {
    return this.http
      .get<{ employee: EmployeeProfile }>(`${environment.apiUrl}/hr/employees/${id}`)
      .pipe(map((response) => response.employee));
  }

  listAttendance(filters: Record<string, unknown> = {}): Observable<PageResult<AttendanceEntry>> {
    return this.http
      .get<{ attendance: AttendanceEntry[]; page: number; limit: number; total: number; hasMore: boolean }>(
        `${environment.apiUrl}/hr/attendance`,
        { params: this.buildParams(filters) },
      )
      .pipe(
        map((response) => ({
          items: response.attendance,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.hasMore,
        })),
      );
  }

  markAttendance(payload: Record<string, unknown>): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/hr/attendance`, payload);
  }

  updateAttendance(id: string, payload: Record<string, unknown>): Observable<void> {
    return this.http.patch<void>(`${environment.apiUrl}/hr/attendance/${id}`, payload);
  }

  bulkAttendance(rows: Array<Record<string, unknown>>): Observable<{ processed: number }> {
    return this.http.post<{ processed: number }>(`${environment.apiUrl}/hr/attendance/bulk`, { rows });
  }

  listLeaves(filters: Record<string, unknown> = {}): Observable<PageResult<LeaveRequest>> {
    return this.http
      .get<{ leaves: LeaveRequest[]; page: number; limit: number; total: number; hasMore: boolean }>(
        `${environment.apiUrl}/hr/leaves`,
        { params: this.buildParams(filters) },
      )
      .pipe(
        map((response) => ({
          items: response.leaves,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.hasMore,
        })),
      );
  }

  createLeave(payload: Record<string, unknown>): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/hr/leaves`, payload);
  }

  approveLeave(id: string, reviewNotes?: string): Observable<void> {
    return this.http.patch<void>(`${environment.apiUrl}/hr/leaves/${id}/approve`, { reviewNotes });
  }

  rejectLeave(id: string, reviewNotes?: string): Observable<void> {
    return this.http.patch<void>(`${environment.apiUrl}/hr/leaves/${id}/reject`, { reviewNotes });
  }

  cancelLeave(id: string): Observable<void> {
    return this.http.patch<void>(`${environment.apiUrl}/hr/leaves/${id}/cancel`, {});
  }

  listPayroll(filters: Record<string, unknown> = {}): Observable<PageResult<PayrollRecord>> {
    return this.http
      .get<{ payroll: PayrollRecord[]; page: number; limit: number; total: number; hasMore: boolean }>(
        `${environment.apiUrl}/hr/payroll`,
        { params: this.buildParams(filters) },
      )
      .pipe(
        map((response) => ({
          items: response.payroll,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.hasMore,
        })),
      );
  }

  generatePayroll(payload: Record<string, unknown>): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/hr/payroll/generate`, payload);
  }

  updatePayroll(id: string, payload: Record<string, unknown>): Observable<void> {
    return this.http.patch<void>(`${environment.apiUrl}/hr/payroll/${id}`, payload);
  }

  approvePayroll(id: string): Observable<void> {
    return this.http.patch<void>(`${environment.apiUrl}/hr/payroll/${id}/approve`, {});
  }

  markPayrollPaid(id: string): Observable<void> {
    return this.http.patch<void>(`${environment.apiUrl}/hr/payroll/${id}/mark-paid`, {});
  }

  listExpenses(filters: Record<string, unknown> = {}): Observable<PageResult<ExpenseRecord>> {
    return this.http
      .get<{ expenses: ExpenseRecord[]; page: number; limit: number; total: number; hasMore: boolean }>(
        `${environment.apiUrl}/hr/expenses`,
        { params: this.buildParams(filters) },
      )
      .pipe(
        map((response) => ({
          items: response.expenses,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.hasMore,
        })),
      );
  }

  createExpense(payload: Record<string, unknown>): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/hr/expenses`, payload);
  }

  approveExpense(id: string): Observable<void> {
    return this.http.patch<void>(`${environment.apiUrl}/hr/expenses/${id}/approve`, {});
  }

  rejectExpense(id: string): Observable<void> {
    return this.http.patch<void>(`${environment.apiUrl}/hr/expenses/${id}/reject`, {});
  }

  markExpensePaid(id: string): Observable<void> {
    return this.http.patch<void>(`${environment.apiUrl}/hr/expenses/${id}/mark-paid`, {});
  }

  listWarnings(filters: Record<string, unknown> = {}): Observable<PageResult<WarningRecord>> {
    return this.http
      .get<{ warnings: WarningRecord[]; page: number; limit: number; total: number; hasMore: boolean }>(
        `${environment.apiUrl}/hr/warnings`,
        { params: this.buildParams(filters) },
      )
      .pipe(
        map((response) => ({
          items: response.warnings,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.hasMore,
        })),
      );
  }

  createWarning(payload: Record<string, unknown>): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/hr/warnings`, payload);
  }

  listDocuments(filters: Record<string, unknown> = {}): Observable<PageResult<DocumentRecord>> {
    return this.http
      .get<{ documents: DocumentRecord[]; page: number; limit: number; total: number; hasMore: boolean }>(
        `${environment.apiUrl}/hr/documents`,
        { params: this.buildParams(filters) },
      )
      .pipe(
        map((response) => ({
          items: response.documents,
          page: response.page,
          limit: response.limit,
          total: response.total,
          hasMore: response.hasMore,
        })),
      );
  }

  uploadDocument(payload: Record<string, unknown>): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/hr/documents/upload`, payload);
  }

  deleteDocument(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/hr/documents/${id}`);
  }

  getAttendanceReport(filters: Record<string, unknown> = {}): Observable<HrReport<AttendanceEntry>> {
    return this.http
      .get<{ report: HrReport<AttendanceEntry> }>(`${environment.apiUrl}/hr/reports/attendance`, {
        params: this.buildParams(filters),
      })
      .pipe(map((response) => response.report));
  }

  getPayrollReport(filters: Record<string, unknown> = {}): Observable<HrReport<PayrollRecord>> {
    return this.http
      .get<{ report: HrReport<PayrollRecord> }>(`${environment.apiUrl}/hr/reports/payroll`, {
        params: this.buildParams(filters),
      })
      .pipe(map((response) => response.report));
  }

  getExpenseReport(filters: Record<string, unknown> = {}): Observable<HrReport<ExpenseRecord>> {
    return this.http
      .get<{ report: HrReport<ExpenseRecord> }>(`${environment.apiUrl}/hr/reports/expenses`, {
        params: this.buildParams(filters),
      })
      .pipe(map((response) => response.report));
  }

  getPerformanceReport(): Observable<HrPerformanceRow[]> {
    return this.http
      .get<{ report: HrPerformanceRow[] }>(`${environment.apiUrl}/hr/reports/performance`)
      .pipe(map((response) => response.report));
  }
}
