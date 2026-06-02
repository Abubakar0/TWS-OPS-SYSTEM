const express = require('express');
const criteriaController = require('./criteria.controller');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');

const router = express.Router();

router.use(authenticate);

router.get('/', asyncHandler(criteriaController.getCriteria));
router.put('/', requireRoles('admin', 'super_admin'), asyncHandler(criteriaController.updateCriteria));

module.exports = router;
