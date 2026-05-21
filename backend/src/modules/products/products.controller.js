const productsService = require('./products.service');

const createProduct = async (req, res) => {
  const product = await productsService.createProduct(req.user, req.body);
  res.status(201).json({ product });
};

const listProducts = async (req, res) => {
  const products = await productsService.listProducts(req.user, req.query);
  res.json({ products });
};

const getProductById = async (req, res) => {
  const product = await productsService.getProductById(req.user, req.params.id);
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

const rejectProduct = async (req, res) => {
  const product = await productsService.rejectProduct(req.user, req.params.id, req.body);
  res.json({ product });
};

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  checkAsinAvailability,
  listAssignedHunters,
  markProductsListed,
  rejectProduct,
};
