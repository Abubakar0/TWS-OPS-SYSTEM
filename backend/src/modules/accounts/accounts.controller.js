const accountsService = require('./accounts.service');

const listAccounts = async (req, res) => {
  const result = await accountsService.listAccounts(req.user, req.query);
  res.json({
    accounts: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const getAccountSummary = async (req, res) => {
  const summary = await accountsService.getAccountSummary(req.params.id);
  res.json(summary);
};

const createAccount = async (req, res) => {
  const account = await accountsService.createAccount(req.body);
  res.status(201).json({ account });
};

const bulkImportAccounts = async (req, res) => {
  const result = await accountsService.bulkImportAccounts(req.user.id, req.body.rows);
  res.status(201).json(result);
};

const updateAccount = async (req, res) => {
  const account = await accountsService.updateAccount(req.params.id, req.body);
  res.json({ account });
};

const assignAccountListers = async (req, res) => {
  const account = await accountsService.assignListersToAccount(
    req.user.id,
    req.params.id,
    req.body.listerIds,
  );
  res.json({ account });
};

const createAccountInvoice = async (req, res) => {
  const invoice = await accountsService.createAccountInvoice(req.user.id, req.params.id, req.body);
  res.status(201).json({ invoice });
};

const bulkCreateAccountInvoices = async (req, res) => {
  const result = await accountsService.bulkCreateAccountInvoices(req.user.id, req.body.rows);
  res.status(201).json(result);
};

module.exports = {
  listAccounts,
  getAccountSummary,
  createAccount,
  bulkImportAccounts,
  updateAccount,
  assignAccountListers,
  createAccountInvoice,
  bulkCreateAccountInvoices,
};
