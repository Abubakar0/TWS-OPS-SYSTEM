const express = require('express');
const weeklyReviewController = require('./weekly-review.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/status', requireRoles('hunter', 'admin', 'super_admin'), asyncHandler(weeklyReviewController.getStatus));
router.post('/complete', requireRoles('hunter'), asyncHandler(weeklyReviewController.complete));

module.exports = router;
