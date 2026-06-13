const express = require('express');
const productsController = require('./products.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router
  .route('/')
  .get(asyncHandler(productsController.listProducts))
  .post(requireRoles('hunter', 'admin'), asyncHandler(productsController.createProduct));

router.get('/check-asin', requireRoles('hunter', 'admin'), asyncHandler(productsController.checkAsinAvailability));
router.get('/assigned-hunters', requireRoles('lister', 'admin'), asyncHandler(productsController.listAssignedHunters));
router.get(
  '/ownership-transfer/:hunterId/summary',
  requireRoles('super_admin'),
  asyncHandler(productsController.getOwnershipTransferSummary),
);
router.patch('/bulk-delete', requireRoles('admin', 'super_admin'), asyncHandler(productsController.softDeleteProducts));
router.patch('/bulk-update', requireRoles('super_admin'), asyncHandler(productsController.bulkUpdateProducts));
router.delete('/bulk-delete', requireRoles('admin', 'super_admin'), asyncHandler(productsController.permanentlyDeleteProducts));
router.patch('/bulk-listed', requireRoles('lister', 'admin'), asyncHandler(productsController.markProductsListed));
router.post(
  '/ownership-transfer',
  requireRoles('super_admin'),
  asyncHandler(productsController.transferProductOwnership),
);
router.patch(
  '/:id/review/approve',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(productsController.approveListingReview),
);
router.patch(
  '/:id/review/reject',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(productsController.rejectListingReview),
);
router.patch(
  '/:id/listing-correction',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(productsController.correctListing),
);
router.post(
  '/:id/rejection/undo',
  requireRoles('lister', 'admin', 'super_admin'),
  asyncHandler(productsController.undoProductRejection),
);
router.patch('/:id/reject', requireRoles('lister', 'admin', 'super_admin'), asyncHandler(productsController.rejectProduct));
router.patch('/:id', requireRoles('hunter', 'admin', 'super_admin'), asyncHandler(productsController.updateProduct));
router.post('/:id/restore', requireRoles('super_admin'), asyncHandler(productsController.restoreProduct));
router.get('/:id', asyncHandler(productsController.getProductById));

module.exports = router;
