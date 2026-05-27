const service = require('./order-issues.service');

const listOrderIssues = async (req, res) => {
  const result = await service.listOrderIssues(req.user, req.query);
  res.json({
    orderIssues: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const getOrderIssueById = async (req, res) => {
  const orderIssue = await service.getIssueById(req.user, req.params.id);
  res.json({ orderIssue });
};

const updateOrderIssue = async (req, res) => {
  const orderIssue = await service.updateOrderIssue(req.user, req.params.id, req.body);
  res.json({ orderIssue });
};

const closeOrderIssue = async (req, res) => {
  const orderIssue = await service.closeOrderIssue(req.user, req.params.id, req.body);
  res.json({ orderIssue });
};

module.exports = {
  listOrderIssues,
  getOrderIssueById,
  updateOrderIssue,
  closeOrderIssue,
};
