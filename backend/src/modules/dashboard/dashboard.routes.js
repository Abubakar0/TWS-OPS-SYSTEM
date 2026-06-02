const express = require('express');
const dashboardController = require('./dashboard.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/super-admin', requireRoles('super_admin'), asyncHandler(dashboardController.superAdmin));
router.get('/admin', requireRoles('admin', 'super_admin'), asyncHandler(dashboardController.admin));
router.get('/hunter', requireRoles('hunter', 'admin', 'super_admin'), asyncHandler(dashboardController.hunter));
router.get('/lister', requireRoles('lister', 'admin', 'super_admin'), asyncHandler(dashboardController.lister));
router.get(
  '/lister-account-usage',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(dashboardController.listerHunterAccounts),
);

module.exports = router;
