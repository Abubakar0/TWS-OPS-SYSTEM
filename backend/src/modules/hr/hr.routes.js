const express = require('express');
const controller = require('./hr.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard', requireRoles('hr', 'super_admin'), asyncHandler(controller.getDashboard));
router.get('/me', asyncHandler(controller.getMyHr));

router.get('/employees', requireRoles('hr', 'super_admin'), asyncHandler(controller.listEmployees));
router.post('/employees', requireRoles('hr', 'super_admin'), asyncHandler(controller.createEmployee));
router.get('/employees/:id', asyncHandler(controller.getEmployee));
router.patch('/employees/:id', requireRoles('hr', 'super_admin'), asyncHandler(controller.updateEmployee));

router.get('/attendance', asyncHandler(controller.listAttendance));
router.post('/attendance', requireRoles('hr', 'super_admin'), asyncHandler(controller.createAttendance));
router.patch('/attendance/:id', requireRoles('hr', 'super_admin'), asyncHandler(controller.updateAttendance));
router.post('/attendance/bulk', requireRoles('hr', 'super_admin'), asyncHandler(controller.bulkAttendance));

router.get('/leaves', asyncHandler(controller.listLeaves));
router.post('/leaves', asyncHandler(controller.createLeave));
router.patch('/leaves/:id/approve', requireRoles('hr', 'super_admin'), asyncHandler(controller.approveLeave));
router.patch('/leaves/:id/reject', requireRoles('hr', 'super_admin'), asyncHandler(controller.rejectLeave));
router.patch('/leaves/:id/cancel', asyncHandler(controller.cancelLeave));

router.get('/payroll', asyncHandler(controller.listPayroll));
router.post('/payroll/generate', requireRoles('hr', 'super_admin'), asyncHandler(controller.generatePayroll));
router.patch('/payroll/:id', requireRoles('hr', 'super_admin'), asyncHandler(controller.updatePayroll));
router.patch('/payroll/:id/approve', requireRoles('hr', 'super_admin'), asyncHandler(controller.approvePayroll));
router.patch('/payroll/:id/mark-paid', requireRoles('hr', 'super_admin'), asyncHandler(controller.markPayrollPaid));

router.get('/expenses', asyncHandler(controller.listExpenses));
router.post('/expenses', asyncHandler(controller.createExpense));
router.patch('/expenses/:id/approve', requireRoles('hr', 'super_admin'), asyncHandler(controller.approveExpense));
router.patch('/expenses/:id/reject', requireRoles('hr', 'super_admin'), asyncHandler(controller.rejectExpense));
router.patch('/expenses/:id/mark-paid', requireRoles('hr', 'super_admin'), asyncHandler(controller.markExpensePaid));

router.get('/warnings', asyncHandler(controller.listWarnings));
router.post('/warnings', requireRoles('hr', 'super_admin'), asyncHandler(controller.createWarning));

router.get('/documents', asyncHandler(controller.listDocuments));
router.post('/documents/upload', requireRoles('hr', 'super_admin'), asyncHandler(controller.uploadDocument));
router.delete('/documents/:id', requireRoles('hr', 'super_admin'), asyncHandler(controller.deleteDocument));

router.get('/reports/attendance', requireRoles('hr', 'super_admin'), asyncHandler(controller.attendanceReport));
router.get('/reports/payroll', requireRoles('hr', 'super_admin'), asyncHandler(controller.payrollReport));
router.get('/reports/expenses', requireRoles('hr', 'super_admin'), asyncHandler(controller.expenseReport));
router.get('/reports/performance', requireRoles('hr', 'super_admin'), asyncHandler(controller.performanceReport));

module.exports = router;
