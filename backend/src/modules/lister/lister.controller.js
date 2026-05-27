const { getListerBlockStatus } = require('../change-requests/change-requests.service');

const getChangeRequestBlockStatus = async (req, res) => {
  const targetListerId =
    req.user.role === 'lister' ? req.user.id : req.query.listerId || req.user.id;
  const blockStatus = await getListerBlockStatus(targetListerId);
  res.json(blockStatus);
};

module.exports = {
  getChangeRequestBlockStatus,
};
