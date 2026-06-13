const productsService = require('./products.service');

const createProduct = async (req, res) => {
  const product = await productsService.createProduct(req.user, req.body);
  res.status(201).json({ product });
};

const listProducts = async (req, res) => {
  const result = await productsService.listProducts(req.user, req.query);
  res.json({
    products: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    hasMore: result.hasMore,
  });
};

const getProductById = async (req, res) => {
  const product = await productsService.getProductById(req.user, req.params.id);
  res.json({ product });
};

const updateProduct = async (req, res) => {
  const product = await productsService.updateProduct(req.user, req.params.id, req.body);
  res.json({ product });
};

const checkAsinAvailability = async (req, res) => {
  const result = await productsService.checkAsinAvailability(req.query.asin);
  res.json(result);
};

const listAssignedHunters = async (req, res) => {
  const hunters = await productsService.listAssignedHunters(req.user);
  res.json({ hunters });
};

const markProductsListed = async (req, res) => {
  const products = await productsService.markProductsListed(req.user, req.body);
  res.json({ products });
};

const approveListingReview = async (req, res) => {
  const product = await productsService.approveListingReview(req.user, req.params.id);
  res.json({ product });
};

const rejectListingReview = async (req, res) => {
  const product = await productsService.rejectListingReview(req.user, req.params.id, req.body);
  res.json({ product });
};

const getOwnershipTransferSummary = async (req, res) => {
  const result = await productsService.getOwnershipTransferSummary(
    req.user,
    req.params.hunterId,
  );
  res.json(result);
};

const transferProductOwnership = async (req, res) => {
  const result = await productsService.transferProductOwnership(req.user, req.body);
  res.json(result);
};

const rejectProduct = async (req, res) => {
  const product = await productsService.rejectProduct(req.user, req.params.id, req.body);
  res.json({ product });
};

const correctListing = async (req, res) => {
  const product = await productsService.correctListing(req.user, req.params.id, req.body);
  res.json({ product });
};

const undoProductRejection = async (req, res) => {
  const product = await productsService.undoProductRejection(req.user, req.params.id);
  res.json({ product });
};

const softDeleteProducts = async (req, res) => {
  const deletedIds = await productsService.softDeleteProducts(req.user, req.body);
  res.json({ deletedIds });
};

const bulkUpdateProducts = async (req, res) => {
  const products = await productsService.bulkUpdateProducts(req.user, req.body);
  res.json({ products });
};

const permanentlyDeleteProducts = async (req, res) => {
  const deletedIds = await productsService.permanentlyDeleteProducts(req.user, req.body);
  res.json({ deletedIds });
};

const restoreProduct = async (req, res) => {
  const product = await productsService.restoreProduct(req.user, req.params.id);
  res.json({ product });
};

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  checkAsinAvailability,
  listAssignedHunters,
  markProductsListed,
  approveListingReview,
  rejectListingReview,
  getOwnershipTransferSummary,
  transferProductOwnership,
  rejectProduct,
  correctListing,
  undoProductRejection,
  softDeleteProducts,
  bulkUpdateProducts,
  permanentlyDeleteProducts,
  restoreProduct,
};
