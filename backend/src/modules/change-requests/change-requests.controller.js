const changeRequestsService = require('./change-requests.service');

const listChangeRequests = async (req, res) => {
  const result = await changeRequestsService.listChangeRequests(req.user, req.query);
  res.json({
    changeRequests: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const getSummary = async (req, res) => {
  const summary = await changeRequestsService.getChangeRequestSummary(req.user);
  res.json({ summary });
};

const createChangeRequest = async (req, res) => {
  const changeRequest = await changeRequestsService.createChangeRequest(req.user, req.body);
  res.status(201).json({ changeRequest });
};

const completeChangeRequest = async (req, res) => {
  const changeRequest = await changeRequestsService.completeChangeRequest(
    req.user,
    req.params.id,
    req.body,
  );
  res.json({ changeRequest });
};

module.exports = {
  listChangeRequests,
  getSummary,
  createChangeRequest,
  completeChangeRequest,
};
