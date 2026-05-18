const express = require('express');
const usersController = require('./users.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);
router.use(requireRoles('admin'));

router.get('/', asyncHandler(usersController.listUsers));
router.post('/', asyncHandler(usersController.createUser));
router.get('/assignments', asyncHandler(usersController.listAssignments));
router.patch('/:id', asyncHandler(usersController.updateUser));
router.put('/:hunterId/lister', asyncHandler(usersController.setHunterLister));

module.exports = router;
