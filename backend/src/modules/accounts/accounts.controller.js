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

const createAccount = async (req, res) => {
  const account = await accountsService.createAccount(req.body);
  res.status(201).json({ account });
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

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  assignAccountListers,
};
