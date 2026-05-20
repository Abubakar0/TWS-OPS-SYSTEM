const express = require('express');
const usersController = require('./users.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/audit', requireRoles('super_admin'), asyncHandler(usersController.listAuditLogs));
router.get(
  '/permissions/matrix',
  requireRoles('super_admin'),
  asyncHandler(usersController.getPermissionsMatrix),
);
router.get('/assignments', requireRoles('admin', 'super_admin'), asyncHandler(usersController.listAssignments));
router.get('/', requireRoles('admin', 'super_admin'), asyncHandler(usersController.listUsers));
router.post('/', requireRoles('admin', 'super_admin'), asyncHandler(usersController.createUser));
router.post('/:id/restore', requireRoles('super_admin'), asyncHandler(usersController.restoreUser));
router.post('/:id/reset-password', requireRoles('super_admin'), asyncHandler(usersController.resetPassword));
router.post('/:id/unlock', requireRoles('super_admin'), asyncHandler(usersController.unlockUser));
router.post('/:id/impersonate', requireRoles('super_admin'), asyncHandler(usersController.impersonateUser));
router.patch('/:id', requireRoles('admin', 'super_admin'), asyncHandler(usersController.updateUser));
router.delete('/:id', requireRoles('super_admin'), asyncHandler(usersController.deleteUser));
router.put('/:hunterId/lister', requireRoles('admin', 'super_admin'), asyncHandler(usersController.setHunterLister));

module.exports = router;
