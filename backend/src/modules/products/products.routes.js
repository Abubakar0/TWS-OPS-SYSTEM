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

router.get('/:id', asyncHandler(productsController.getProductById));

module.exports = router;
