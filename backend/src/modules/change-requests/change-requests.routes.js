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
  '/:id',
  requireRoles('hunter', 'lister', 'admin', 'super_admin'),
  asyncHandler(controller.getChangeRequestById),
);
router.get(
  '/summary',
  requireRoles('hunter', 'lister', 'admin', 'super_admin'),
  asyncHandler(controller.getSummary),
);
router.post('/', requireRoles('hunter'), asyncHandler(controller.createChangeRequest));
router.patch(
  '/:id/start',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(controller.startChangeRequest),
);
router.patch(
  '/:id/fix',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(controller.fixChangeRequest),
);
router.patch(
  '/:id/reject',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(controller.rejectChangeRequest),
);
router.patch(
  '/:id/reassign',
  requireRoles('admin', 'super_admin'),
  asyncHandler(controller.reassignChangeRequest),
);
router.post(
  '/:id/close',
  requireRoles('admin', 'super_admin'),
  asyncHandler(controller.closeChangeRequest),
);
router.patch(
  '/:id/complete',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(controller.completeChangeRequest),
);

module.exports = router;
