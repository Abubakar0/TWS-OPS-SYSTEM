const express = require('express');
const controller = require('./orders.controller');
const { authenticate, requirePermissions, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  requireRoles('hunter', 'lister', 'admin', 'super_admin', 'order_processor'),
  asyncHandler(controller.listOrders),
);
router.post(
  '/',
  requireRoles('admin', 'super_admin', 'order_processor'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.createOrder),
);
router.get(
  '/stats',
  requireRoles('hunter', 'lister', 'admin', 'super_admin', 'order_processor'),
  asyncHandler(controller.getStats),
);
router.get(
  '/reports',
  requireRoles('admin', 'super_admin', 'order_processor'),
  asyncHandler(controller.getReports),
);
router.get(
  '/export',
  requireRoles('admin', 'super_admin', 'order_processor'),
  asyncHandler(controller.exportOrders),
);
router.get(
  '/match-product',
  requireRoles('admin', 'super_admin', 'order_processor'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.matchProduct),
);
router.get(
  '/match-by-asin',
  requireRoles('admin', 'super_admin', 'order_processor'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.matchByAsin),
);
router.post(
  '/bulk-status',
  requireRoles('admin', 'super_admin', 'order_processor'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.bulkUpdateStatus),
);
router.post(
  '/:id/restore',
  requireRoles('super_admin'),
  asyncHandler(controller.restoreOrder),
);
router.post(
  '/:id/mark-placed',
  requireRoles('admin', 'super_admin', 'order_processor'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.markPlaced),
);
router.post(
  '/:id/mark-shipped',
  requireRoles('admin', 'super_admin', 'order_processor'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.markShipped),
);
router.post(
  '/:id/mark-delivered',
  requireRoles('admin', 'super_admin', 'order_processor'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.markDelivered),
);
router.post(
  '/:id/mark-issue',
  requireRoles('admin', 'super_admin', 'order_processor'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.markIssue),
);
router.patch(
  '/:id/status',
  requireRoles('admin', 'super_admin', 'order_processor'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.updateOrderStatus),
);
router.get(
  '/:id/activity',
  requireRoles('hunter', 'lister', 'admin', 'super_admin', 'order_processor'),
  asyncHandler(controller.getOrderActivity),
);
router.get(
  '/:id',
  requireRoles('hunter', 'lister', 'admin', 'super_admin', 'order_processor'),
  asyncHandler(controller.getOrderById),
);
router.patch(
  '/:id',
  requireRoles('admin', 'super_admin', 'order_processor'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.updateOrder),
);
router.delete(
  '/:id',
  requireRoles('admin', 'super_admin'),
  requirePermissions('canProcessOrders'),
  asyncHandler(controller.deleteOrder),
);

module.exports = router;
