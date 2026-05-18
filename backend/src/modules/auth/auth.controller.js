const authService = require('./auth.service');

const login = async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
};

const me = async (req, res) => {
  const user = await authService.getUserById(req.user.id);
  res.json({ user });
};

module.exports = {
  login,
  me,
};
