const ordersService = require('./orders.service');

const listOrders = async (req, res) => {
  const result = await ordersService.listOrders(req.user, req.query);
  res.json({
    orders: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const getOrderById = async (req, res) => {
  const order = await ordersService.getOrderById(req.user, req.params.id, {
    includeDeleted: req.query.includeDeleted === 'true',
  });
  res.json({ order });
};

const getOrderActivity = async (req, res) => {
  const activity = await ordersService.listOrderActivity(req.user, req.params.id, req.query);
  res.json({ activity });
};

const createOrder = async (req, res) => {
  const order = await ordersService.createOrder(req.user, req.body);
  res.status(201).json({ order });
};

const updateOrder = async (req, res) => {
  const order = await ordersService.updateOrder(req.user, req.params.id, req.body);
  res.json({ order });
};

const updateOrderStatus = async (req, res) => {
  const order = await ordersService.updateOrderStatus(req.user, req.params.id, req.body);
  res.json({ order });
};

const bulkUpdateStatus = async (req, res) => {
  const result = await ordersService.bulkUpdateOrderStatus(req.user, req.body);
  res.json(result);
};

const deleteOrder = async (req, res) => {
  const result = await ordersService.deleteOrder(req.user, req.params.id, {
    permanent: req.query.permanent === 'true',
    reason: req.body?.reason || req.query.reason || null,
  });
  res.json(result);
};

const restoreOrder = async (req, res) => {
  const order = await ordersService.restoreOrder(req.user, req.params.id);
  res.json({ order });
};

const markPlaced = async (req, res) => {
  const order = await ordersService.markOrderPlaced(req.user, req.params.id, req.body);
  res.json({ order });
};

const markShipped = async (req, res) => {
  const order = await ordersService.markOrderShipped(req.user, req.params.id, req.body);
  res.json({ order });
};

const markDelivered = async (req, res) => {
  const order = await ordersService.markOrderDelivered(req.user, req.params.id, req.body);
  res.json({ order });
};

const markIssue = async (req, res) => {
  const order = await ordersService.markOrderIssue(req.user, req.params.id, req.body);
  res.json({ order });
};

const getStats = async (req, res) => {
  const stats = await ordersService.getOrderStats(req.user, req.query);
  res.json({ stats });
};

const getReports = async (req, res) => {
  const reports = await ordersService.getOrderReports(req.user, req.query);
  res.json({ reports });
};

const exportOrders = async (req, res) => {
  const result = await ordersService.listOrders(req.user, req.query);
  res.json({
    orders: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const matchProduct = async (req, res) => {
  const matches = await ordersService.matchProducts(req.query, {
    limit: Number.parseInt(String(req.query.limit || '10'), 10) || 10,
  });
  res.json({ matches });
};

const matchByAsin = async (req, res) => {
  const matches = await ordersService.matchProducts(
    {
      asin: req.query.asin,
      search: req.query.search,
      title: req.query.title,
      customLabel: req.query.customLabel,
    },
    { limit: Number.parseInt(String(req.query.limit || '10'), 10) || 10 },
  );
  res.json({ matches });
};

module.exports = {
  listOrders,
  getOrderById,
  getOrderActivity,
  createOrder,
  updateOrder,
  updateOrderStatus,
  bulkUpdateStatus,
  deleteOrder,
  restoreOrder,
  markPlaced,
  markShipped,
  markDelivered,
  markIssue,
  getStats,
  getReports,
  exportOrders,
  matchProduct,
  matchByAsin,
};
