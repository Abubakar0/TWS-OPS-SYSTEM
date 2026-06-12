const reportsService = require('./reports.service');

const getSummary = async (req, res) => {
  const summary = await reportsService.getSummaryReport(req.user, req.query);
  res.json({ summary });
};

const getExecutive = async (req, res) => {
  const executive = await reportsService.getExecutiveReport(req.user, req.query);
  res.json({ executive });
};

const listUsers = async (req, res) => {
  const result = await reportsService.listUserReports(req.user, req.query);
  res.json(result);
};

const getUser = async (req, res) => {
  const user = await reportsService.getUserReport(req.user, req.params.id, null, req.query);
  res.json({ user });
};

const listHunters = async (req, res) => {
  const result = await reportsService.listUserReports(req.user, { ...req.query, role: 'hunter' });
  res.json(result);
};

const getHunter = async (req, res) => {
  const hunter = await reportsService.getUserReport(req.user, req.params.id, 'hunter', req.query);
  res.json({ hunter });
};

const listListers = async (req, res) => {
  const result = await reportsService.listUserReports(req.user, { ...req.query, role: 'lister' });
  res.json(result);
};

const getLister = async (req, res) => {
  const lister = await reportsService.getUserReport(req.user, req.params.id, 'lister', req.query);
  res.json({ lister });
};

const listOrderProcessors = async (req, res) => {
  const result = await reportsService.listUserReports(req.user, { ...req.query, role: 'order_processor' });
  res.json(result);
};

const getOrderProcessor = async (req, res) => {
  const orderProcessor = await reportsService.getUserReport(req.user, req.params.id, 'order_processor', req.query);
  res.json({ orderProcessor });
};

const listAdmins = async (req, res) => {
  const result = await reportsService.listUserReports(req.user, { ...req.query, role: 'admin' });
  res.json(result);
};

const getAdmin = async (req, res) => {
  const admin = await reportsService.getUserReport(req.user, req.params.id, 'admin', req.query);
  res.json({ admin });
};

const listAccounts = async (req, res) => {
  const result = await reportsService.listAccountReports(req.user, req.query);
  res.json(result);
};

const getAccount = async (req, res) => {
  const account = await reportsService.getAccountReport(req.user, req.params.id);
  res.json({ account });
};

const listProducts = async (req, res) => {
  const result = await reportsService.listProductReports(req.user, req.query);
  res.json(result);
};

const getProduct = async (req, res) => {
  const product = await reportsService.getProductReport(req.user, req.params.id);
  res.json({ product });
};

const listOrders = async (req, res) => {
  const result = await reportsService.listOrderReports(req.user, req.query);
  res.json(result);
};

const getOrder = async (req, res) => {
  const order = await reportsService.getOrderReport(req.user, req.params.id);
  res.json(order);
};

const getHr = async (req, res) => {
  const hr = await reportsService.getHrReport(req.user, req.query);
  res.json({ hr });
};

const listTeams = async (req, res) => {
  const result = await reportsService.listTeamReports(req.user, req.query);
  res.json(result);
};

const listCategories = async (req, res) => {
  const result = await reportsService.listCategoryReports(req.user, req.query);
  res.json(result);
};

const listMarketplaces = async (req, res) => {
  const result = await reportsService.listMarketplaceReports(req.user, req.query);
  res.json(result);
};

const listActivity = async (req, res) => {
  const result = await reportsService.listActivityReports(req.user, req.query);
  res.json(result);
};

const trackEvent = async (req, res) => {
  const result = await reportsService.trackReportEvent(req.user, req.body);
  res.status(201).json(result);
};

module.exports = {
  getSummary,
  getExecutive,
  listUsers,
  getUser,
  listHunters,
  getHunter,
  listListers,
  getLister,
  listOrderProcessors,
  getOrderProcessor,
  listAdmins,
  getAdmin,
  listAccounts,
  getAccount,
  listProducts,
  getProduct,
  listOrders,
  getOrder,
  getHr,
  listTeams,
  listCategories,
  listMarketplaces,
  listActivity,
  trackEvent,
};
