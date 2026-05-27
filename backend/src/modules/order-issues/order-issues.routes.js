const express = require('express');
const controller = require('./order-issues.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  requireRoles('hunter', 'lister', 'admin', 'super_admin', 'order_processor'),
  asyncHandler(controller.listOrderIssues),
);
router.get(
  '/:id',
  requireRoles('hunter', 'lister', 'admin', 'super_admin', 'order_processor'),
  asyncHandler(controller.getOrderIssueById),
);
router.patch(
  '/:id',
  requireRoles('admin', 'super_admin', 'order_processor'),
  asyncHandler(controller.updateOrderIssue),
);
router.post(
  '/:id/close',
  requireRoles('admin', 'super_admin', 'order_processor'),
  asyncHandler(controller.closeOrderIssue),
);

module.exports = router;
