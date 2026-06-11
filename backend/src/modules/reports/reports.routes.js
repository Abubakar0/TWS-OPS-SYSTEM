const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error');
const controller = require('./reports.controller');

const router = express.Router();

router.use(authenticate);

router.get('/summary', asyncHandler(controller.getSummary));
router.get('/executive', asyncHandler(controller.getExecutive));

router.get('/hunters', asyncHandler(controller.listHunters));
router.get('/hunters/:id', asyncHandler(controller.getHunter));
router.get('/listers', asyncHandler(controller.listListers));
router.get('/listers/:id', asyncHandler(controller.getLister));
router.get('/order-processors', asyncHandler(controller.listOrderProcessors));
router.get('/order-processors/:id', asyncHandler(controller.getOrderProcessor));
router.get('/admins', asyncHandler(controller.listAdmins));
router.get('/admins/:id', asyncHandler(controller.getAdmin));

router.get('/users', asyncHandler(controller.listUsers));
router.get('/users/:id', asyncHandler(controller.getUser));

router.get('/accounts', asyncHandler(controller.listAccounts));
router.get('/accounts/:id', asyncHandler(controller.getAccount));

router.get('/products', asyncHandler(controller.listProducts));
router.get('/products/:id', asyncHandler(controller.getProduct));

router.get('/orders', asyncHandler(controller.listOrders));
router.get('/orders/:id', asyncHandler(controller.getOrder));

router.get('/hr', asyncHandler(controller.getHr));
router.get('/teams', asyncHandler(controller.listTeams));
router.get('/categories', asyncHandler(controller.listCategories));
router.get('/marketplaces', asyncHandler(controller.listMarketplaces));
router.get('/activity', asyncHandler(controller.listActivity));

router.post('/events', asyncHandler(controller.trackEvent));

module.exports = router;
