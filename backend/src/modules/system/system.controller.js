const systemService = require('./system.service');

const getSettings = async (req, res) => {
  const settings = await systemService.getSystemSettings(req);
  res.json(settings);
};

const getAnnouncement = async (req, res) => {
  const announcementBar = await systemService.getAnnouncementBar();
  res.json({ announcementBar });
};

const updateApiLimits = async (req, res) => {
  const apiLimits = await systemService.updateApiLimits(req.user, req.body);
  res.json({ apiLimits });
};

const updateIpRestriction = async (req, res) => {
  const ipRestriction = await systemService.updateIpRestriction(req.user, req.body);
  res.json({ ipRestriction });
};

const updateAnnouncement = async (req, res) => {
  const announcementBar = await systemService.updateAnnouncementBar(req.user, req.body);
  res.json({ announcementBar });
};

const updateHrSettings = async (req, res) => {
  const hrSettings = await systemService.updateHrSettings(req.user, req.body);
  res.json({ hrSettings });
};

module.exports = {
  getSettings,
  getAnnouncement,
  updateApiLimits,
  updateIpRestriction,
  updateAnnouncement,
  updateHrSettings,
};
