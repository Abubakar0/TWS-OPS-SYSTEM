const express = require('express');
const accountsController = require('./accounts.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/', asyncHandler(accountsController.listAccounts));
router.post('/', requireRoles('admin'), asyncHandler(accountsController.createAccount));
router.patch('/:id', requireRoles('admin'), asyncHandler(accountsController.updateAccount));

module.exports = router;
