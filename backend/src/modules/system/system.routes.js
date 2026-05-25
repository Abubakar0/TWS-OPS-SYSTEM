const express = require('express');
const systemController = require('./system.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);
router.use(requireRoles('super_admin'));

router.get('/settings', asyncHandler(systemController.getSettings));
router.put('/api-limits', asyncHandler(systemController.updateApiLimits));
router.put('/ip-restriction', asyncHandler(systemController.updateIpRestriction));

module.exports = router;
