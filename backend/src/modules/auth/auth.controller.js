const authService = require('./auth.service');

const login = async (req, res) => {
  const result = await authService.login(req.body, req);
  res.json(result);
};

const me = async (req, res) => {
  const user = await authService.getUserById(req.user.id);
  res.json({ user });
};

const changePassword = async (req, res) => {
  await authService.changePassword(req.user, req.body);
  res.json({ success: true });
};

module.exports = {
  login,
  me,
  changePassword,
};
