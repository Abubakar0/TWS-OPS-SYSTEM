const express = require('express');
const dashboardController = require('./dashboard.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/admin', requireRoles('admin'), asyncHandler(dashboardController.admin));
router.get('/hunter', requireRoles('hunter'), asyncHandler(dashboardController.hunter));
router.get('/lister', requireRoles('lister'), asyncHandler(dashboardController.lister));

module.exports = router;
