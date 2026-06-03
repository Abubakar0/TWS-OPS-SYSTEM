import { UserRole } from './auth.models';

export interface EmployeeProfile {
  id: string;
  userId: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone?: string | null;
  nationalId?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  department?: string | null;
  designation?: string | null;
  managerUserId?: string | null;
  managerName?: string | null;
  joiningDate?: string | null;
  employmentType: string;
  employmentStatus: string;
  basicSalary: number;
  allowances: number;
  defaultDeductions: number;
  paymentMethod?: string | null;
  bankDetails?: Record<string, unknown>;
  role: UserRole;
  roles: UserRole[];
  isActive: boolean;
  status: string;
}

export interface AttendanceEntry {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  date: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status: string;
  lateMinutes: number;
  notes?: string | null;
  markedBy?: string | null;
  markedByName?: string | null;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  reason?: string | null;
  reviewNotes?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  payrollMonth: string;
  basicSalary: number;
  allowances: number;
  bonuses: number;
  deductions: number;
  advances: number;
  unpaidLeaveDeduction: number;
  lateDeduction: number;
  netSalary: number;
  status: string;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
}

export interface ExpenseRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  category: string;
  title: string;
  description?: string | null;
  amount: number;
  expenseDate: string;
  status: string;
  receiptUrl?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
}

export interface WarningRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  warningType: string;
  reason: string;
  details?: string | null;
  issuedBy?: string | null;
  issuedByName?: string | null;
  issuedAt: string;
  employeeResponse?: string | null;
  attachmentUrl?: string | null;
}

export interface DocumentRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  documentType: string;
  title: string;
  fileName?: string | null;
  fileUrl?: string | null;
  notes?: string | null;
  uploadedBy?: string | null;
  uploadedByName?: string | null;
}

export interface HrDashboardLeavePreview {
  id: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
}

export interface HrDashboardExpensePreview {
  id: string;
  employeeName: string;
  category: string;
  amount: number;
  expenseDate: string;
}

export interface HrActivityItem {
  id: string;
  action: string;
  targetType: string;
  createdAt: string;
  details?: Record<string, unknown> | null;
}

export interface HrDashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  onLeave: number;
  pendingLeaves: number;
  pendingExpenses: number;
  monthlySalaryCost: number;
  attendanceTrend: Array<{ date: string; present: number; absent: number; late: number }>;
  pendingApprovals: {
    leaves: HrDashboardLeavePreview[];
    expenses: HrDashboardExpensePreview[];
  };
  upcomingLeaves: HrDashboardLeavePreview[];
  recentActivity: HrActivityItem[];
}

export interface HrReport<T> {
  summary: Record<string, unknown>;
  rows: T[];
}

export interface HrPerformanceRow {
  employeeId: string;
  employeeCode: string;
  userId: string;
  employeeName: string;
  employeeEmail: string;
  role: UserRole;
  roles: UserRole[];
  department?: string | null;
  designation?: string | null;
  productsSubmitted: number;
  approvedProducts: number;
  rejectedProducts: number;
  ordersReceived: number;
  profitGenerated: number;
  ordersAdded: number;
  ordersPlaced: number;
  issueOrders: number;
  lossOrders: number;
  changeRequests: number;
  attendanceGoodDays: number;
  approvedLeaves: number;
  warnings: number;
}

export interface MyHrProfile {
  employee: EmployeeProfile;
  attendance: AttendanceEntry[];
  leaves: LeaveRequest[];
  payroll: PayrollRecord[];
  expenses: ExpenseRecord[];
  warnings: WarningRecord[];
}
