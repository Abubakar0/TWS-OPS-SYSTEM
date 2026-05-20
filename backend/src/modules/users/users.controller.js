const usersService = require('./users.service');

const listUsers = async (req, res) => {
  const users = await usersService.listUsers(req.user, req.query);
  res.json({ users });
};

const createUser = async (req, res) => {
  const user = await usersService.createUser(req.user, req.body);
  res.status(201).json({ user });
};

const updateUser = async (req, res) => {
  const user = await usersService.updateUser(req.user, req.params.id, req.body);
  res.json({ user });
};

const listAssignments = async (req, res) => {
  const assignments = await usersService.listAssignments();
  res.json({ assignments });
};

const setHunterLister = async (req, res) => {
  const assignment = await usersService.setHunterLister(
    req.user,
    req.params.hunterId,
    req.body.listerId || null,
  );
  res.json({ assignment });
};

const deleteUser = async (req, res) => {
  const user = await usersService.softDeleteUser(req.user, req.params.id);
  res.json({ user });
};

const restoreUser = async (req, res) => {
  const user = await usersService.restoreUser(req.user, req.params.id);
  res.json({ user });
};

const resetPassword = async (req, res) => {
  const user = await usersService.resetUserPassword(req.user, req.params.id, req.body.password);
  res.json({ user });
};

const unlockUser = async (req, res) => {
  const user = await usersService.unlockUser(req.user, req.params.id);
  res.json({ user });
};

const impersonateUser = async (req, res) => {
  const session = await usersService.impersonateUser(req.user, req.params.id);
  res.json(session);
};

const listAuditLogs = async (req, res) => {
  const logs = await usersService.listUsersAudit(req.query);
  res.json({ logs });
};

const getPermissionsMatrix = async (req, res) => {
  const matrix = await usersService.getPermissionsMatrix();
  res.json({ matrix });
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
  resetPassword,
  unlockUser,
  impersonateUser,
  listAuditLogs,
  getPermissionsMatrix,
  listAssignments,
  setHunterLister,
};
