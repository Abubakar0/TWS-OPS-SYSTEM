const usersService = require('./users.service');

const listUsers = async (req, res) => {
  const users = await usersService.listUsers(req.query);
  res.json({ users });
};

const createUser = async (req, res) => {
  const user = await usersService.createUser(req.body);
  res.status(201).json({ user });
};

const updateUser = async (req, res) => {
  const user = await usersService.updateUser(req.params.id, req.body);
  res.json({ user });
};

const listAssignments = async (req, res) => {
  const assignments = await usersService.listAssignments();
  res.json({ assignments });
};

const setHunterLister = async (req, res) => {
  const assignment = await usersService.setHunterLister(req.params.hunterId, req.body.listerId || null);
  res.json({ assignment });
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  listAssignments,
  setHunterLister,
};
