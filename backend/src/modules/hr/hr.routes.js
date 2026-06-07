const express = require('express');
const controller = require('./hr.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.getDashboard));
router.get('/me', asyncHandler(controller.getMyHr));
router.post('/me/birthday-popup-shown', asyncHandler(controller.markBirthdayPopupShown));
router.patch('/me/profile', asyncHandler(controller.updateMyProfile));

router.get('/employees', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.listEmployees));
router.post('/employees', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.createEmployee));
router.get('/employees/:id', asyncHandler(controller.getEmployee));
router.patch('/employees/:id', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.updateEmployee));
router.patch('/employees/:id/profile-review', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.reviewEmployeeProfile));

router.get('/attendance', asyncHandler(controller.listAttendance));
router.post('/attendance', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.createAttendance));
router.patch('/attendance/:id', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.updateAttendance));
router.post('/attendance/bulk', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.bulkAttendance));

router.get('/leaves', asyncHandler(controller.listLeaves));
router.post('/leaves', asyncHandler(controller.createLeave));
router.patch('/leaves/:id/approve', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.approveLeave));
router.patch('/leaves/:id/reject', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.rejectLeave));
router.patch('/leaves/:id/cancel', asyncHandler(controller.cancelLeave));

router.get('/payroll', asyncHandler(controller.listPayroll));
router.post('/payroll/generate', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.generatePayroll));
router.patch('/payroll/:id', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.updatePayroll));
router.patch('/payroll/:id/approve', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.approvePayroll));
router.patch('/payroll/:id/mark-paid', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.markPayrollPaid));

router.get('/expenses', asyncHandler(controller.listExpenses));
router.post('/expenses', asyncHandler(controller.createExpense));
router.patch('/expenses/:id/approve', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.approveExpense));
router.patch('/expenses/:id/reject', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.rejectExpense));
router.patch('/expenses/:id/mark-paid', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.markExpensePaid));

router.get('/warnings', asyncHandler(controller.listWarnings));
router.post('/warnings', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.createWarning));

router.get('/documents', asyncHandler(controller.listDocuments));
router.post('/documents/upload', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.uploadDocument));
router.delete('/documents/:id', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.deleteDocument));

router.get('/reports/attendance', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.attendanceReport));
router.get('/reports/payroll', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.payrollReport));
router.get('/reports/expenses', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.expenseReport));
router.get('/reports/performance', requireRoles('admin', 'hr', 'super_admin'), asyncHandler(controller.performanceReport));

module.exports = router;
