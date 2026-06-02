const express = require('express');
const controller = require('./lister.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get(
  '/change-request-block-status',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(controller.getChangeRequestBlockStatus),
);

module.exports = router;
