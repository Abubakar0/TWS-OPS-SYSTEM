const hrService = require('./hr.service');

const listEmployees = async (req, res) => {
  const result = await hrService.listEmployees(req.user, req.query);
  res.json({
    employees: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const createEmployee = async (req, res) => {
  const employee = await hrService.createEmployee(req.user, req.body);
  res.status(201).json({ employee });
};

const getEmployee = async (req, res) => {
  const employee = await hrService.getEmployeeById(req.user, req.params.id);
  res.json({ employee });
};

const updateEmployee = async (req, res) => {
  const employee = await hrService.updateEmployee(req.user, req.params.id, req.body);
  res.json({ employee });
};

const listAttendance = async (req, res) => {
  const result = await hrService.listAttendance(req.user, req.query);
  res.json({
    attendance: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const createAttendance = async (req, res) => {
  await hrService.upsertAttendance(req.user, req.body);
  res.status(201).json({ success: true });
};

const updateAttendance = async (req, res) => {
  const attendance = await hrService.updateAttendance(req.user, req.params.id, req.body);
  res.json({ attendance });
};

const bulkAttendance = async (req, res) => {
  const result = await hrService.bulkMarkAttendance(req.user, req.body.rows || []);
  res.status(201).json(result);
};

const listLeaves = async (req, res) => {
  const result = await hrService.listLeaves(req.user, req.query);
  res.json({
    leaves: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const createLeave = async (req, res) => {
  await hrService.createLeave(req.user, req.body);
  res.status(201).json({ success: true });
};

const approveLeave = async (req, res) => {
  const leave = await hrService.updateLeaveStatus(req.user, req.params.id, 'APPROVED', req.body.reviewNotes);
  res.json({ leave });
};

const rejectLeave = async (req, res) => {
  const leave = await hrService.updateLeaveStatus(req.user, req.params.id, 'REJECTED', req.body.reviewNotes);
  res.json({ leave });
};

const cancelLeave = async (req, res) => {
  const result = await hrService.cancelLeave(req.user, req.params.id);
  res.json(result);
};

const listPayroll = async (req, res) => {
  const result = await hrService.listPayroll(req.user, req.query);
  res.json({
    payroll: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const generatePayroll = async (req, res) => {
  await hrService.generatePayroll(req.user, req.body);
  res.status(201).json({ success: true });
};

const updatePayroll = async (req, res) => {
  await hrService.updatePayroll(req.user, req.params.id, req.body);
  res.json({ success: true });
};

const approvePayroll = async (req, res) => {
  await hrService.setPayrollStatus(req.user, req.params.id, 'APPROVED');
  res.json({ success: true });
};

const markPayrollPaid = async (req, res) => {
  await hrService.setPayrollStatus(req.user, req.params.id, 'PAID');
  res.json({ success: true });
};

const listExpenses = async (req, res) => {
  const result = await hrService.listExpenses(req.user, req.query);
  res.json({
    expenses: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const createExpense = async (req, res) => {
  await hrService.createExpense(req.user, req.body);
  res.status(201).json({ success: true });
};

const approveExpense = async (req, res) => {
  await hrService.setExpenseStatus(req.user, req.params.id, 'APPROVED');
  res.json({ success: true });
};

const rejectExpense = async (req, res) => {
  await hrService.setExpenseStatus(req.user, req.params.id, 'REJECTED');
  res.json({ success: true });
};

const markExpensePaid = async (req, res) => {
  await hrService.setExpenseStatus(req.user, req.params.id, 'PAID');
  res.json({ success: true });
};

const listWarnings = async (req, res) => {
  const result = await hrService.listWarnings(req.user, req.query);
  res.json({
    warnings: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const createWarning = async (req, res) => {
  await hrService.createWarning(req.user, req.body);
  res.status(201).json({ success: true });
};

const listDocuments = async (req, res) => {
  const result = await hrService.listDocuments(req.user, req.query);
  res.json({
    documents: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const uploadDocument = async (req, res) => {
  await hrService.uploadDocument(req.user, req.body);
  res.status(201).json({ success: true });
};

const deleteDocument = async (req, res) => {
  const result = await hrService.deleteDocument(req.user, req.params.id);
  res.json(result);
};

const getDashboard = async (req, res) => {
  const stats = await hrService.getHrDashboard(req.user, req.query);
  res.json({ stats });
};

const attendanceReport = async (req, res) => {
  const report = await hrService.getAttendanceReport(req.user, req.query);
  res.json({ report });
};

const payrollReport = async (req, res) => {
  const report = await hrService.getPayrollReport(req.user, req.query);
  res.json({ report });
};

const expenseReport = async (req, res) => {
  const report = await hrService.getExpenseReport(req.user, req.query);
  res.json({ report });
};

const performanceReport = async (req, res) => {
  const report = await hrService.getPerformanceReport(req.user, req.query);
  res.json({ report });
};

const getMyHr = async (req, res) => {
  const profile = await hrService.getMyHr(req.user);
  res.json({ profile });
};

const markBirthdayPopupShown = async (req, res) => {
  const profile = await hrService.markBirthdayPopupShown(req.user);
  res.json({ profile });
};

const updateMyProfile = async (req, res) => {
  const profile = await hrService.updateMyProfile(req.user, req.body);
  res.json({ profile });
};

const reviewEmployeeProfile = async (req, res) => {
  const employee = await hrService.reviewEmployeeProfile(req.user, req.params.id, req.body);
  res.json({ employee });
};

module.exports = {
  getDashboard,
  getMyHr,
  markBirthdayPopupShown,
  updateMyProfile,
  listEmployees,
  createEmployee,
  getEmployee,
  updateEmployee,
  reviewEmployeeProfile,
  listAttendance,
  createAttendance,
  updateAttendance,
  bulkAttendance,
  listLeaves,
  createLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  listPayroll,
  generatePayroll,
  updatePayroll,
  approvePayroll,
  markPayrollPaid,
  listExpenses,
  createExpense,
  approveExpense,
  rejectExpense,
  markExpensePaid,
  listWarnings,
  createWarning,
  listDocuments,
  uploadDocument,
  deleteDocument,
  attendanceReport,
  payrollReport,
  expenseReport,
  performanceReport,
};
