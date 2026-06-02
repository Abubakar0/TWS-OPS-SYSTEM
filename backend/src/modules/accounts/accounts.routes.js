const express = require('express');
const accountsController = require('./accounts.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/', asyncHandler(accountsController.listAccounts));
router.get(
  '/:id/summary',
  requireRoles('admin', 'super_admin'),
  asyncHandler(accountsController.getAccountSummary),
);
router.post(
  '/:id/invoices',
  requireRoles('admin', 'super_admin'),
  asyncHandler(accountsController.createAccountInvoice),
);
router.post('/', requireRoles('admin', 'super_admin'), asyncHandler(accountsController.createAccount));
router.patch('/:id', requireRoles('admin', 'super_admin'), asyncHandler(accountsController.updateAccount));
router.put(
  '/:id/listers',
  requireRoles('admin', 'super_admin'),
  asyncHandler(accountsController.assignAccountListers),
);

module.exports = router;
