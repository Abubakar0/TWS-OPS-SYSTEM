const express = require('express');
const systemController = require('./system.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/settings', requireRoles('admin', 'super_admin'), asyncHandler(systemController.getSettings));
router.get('/announcement', asyncHandler(systemController.getAnnouncement));
router.put('/announcement', requireRoles('admin', 'super_admin'), asyncHandler(systemController.updateAnnouncement));
router.use(requireRoles('super_admin'));
router.put('/api-limits', asyncHandler(systemController.updateApiLimits));
router.put('/ip-restriction', asyncHandler(systemController.updateIpRestriction));

module.exports = router;
