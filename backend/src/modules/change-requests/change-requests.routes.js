const express = require('express');
const controller = require('./change-requests.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  requireRoles('hunter', 'lister', 'admin', 'super_admin'),
  asyncHandler(controller.listChangeRequests),
);
router.get(
  '/summary',
  requireRoles('hunter', 'lister', 'admin', 'super_admin'),
  asyncHandler(controller.getSummary),
);
router.post('/', requireRoles('hunter'), asyncHandler(controller.createChangeRequest));
router.patch(
  '/:id/complete',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(controller.completeChangeRequest),
);

module.exports = router;
