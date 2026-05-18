const accountsService = require('./accounts.service');

const listAccounts = async (req, res) => {
  const accounts = await accountsService.listAccounts(req.query);
  res.json({ accounts });
};

const createAccount = async (req, res) => {
  const account = await accountsService.createAccount(req.body);
  res.status(201).json({ account });
};

const updateAccount = async (req, res) => {
  const account = await accountsService.updateAccount(req.params.id, req.body);
  res.json({ account });
};

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
};
