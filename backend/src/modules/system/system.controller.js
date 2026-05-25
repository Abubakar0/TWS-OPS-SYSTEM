const systemService = require('./system.service');

const getSettings = async (req, res) => {
  const settings = await systemService.getSystemSettings(req);
  res.json(settings);
};

const updateApiLimits = async (req, res) => {
  const apiLimits = await systemService.updateApiLimits(req.user, req.body);
  res.json({ apiLimits });
};

const updateIpRestriction = async (req, res) => {
  const ipRestriction = await systemService.updateIpRestriction(req.user, req.body);
  res.json({ ipRestriction });
};

module.exports = {
  getSettings,
  updateApiLimits,
  updateIpRestriction,
};
