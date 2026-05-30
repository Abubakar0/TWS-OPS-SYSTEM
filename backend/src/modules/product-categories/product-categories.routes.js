const express = require('express');
const controller = require('./product-categories.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/', asyncHandler(controller.listCategories));
router.post('/', requireRoles('admin', 'super_admin'), asyncHandler(controller.createCategory));
router.patch('/:id', requireRoles('admin', 'super_admin'), asyncHandler(controller.updateCategory));
router.delete('/:id', requireRoles('admin', 'super_admin'), asyncHandler(controller.deleteCategory));

module.exports = router;
