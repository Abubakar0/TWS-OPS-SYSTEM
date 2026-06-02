const express = require('express');
const controller = require('./teams.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/', asyncHandler(controller.listTeams));
router.post('/', requireRoles('admin', 'super_admin'), asyncHandler(controller.createTeam));
router.patch('/:id', requireRoles('admin', 'super_admin'), asyncHandler(controller.updateTeam));
router.delete('/:id', requireRoles('admin', 'super_admin'), asyncHandler(controller.deleteTeam));

module.exports = router;
