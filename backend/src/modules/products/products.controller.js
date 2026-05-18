const productsService = require('./products.service');

const createProduct = async (req, res) => {
  const product = await productsService.createProduct(req.user, req.body);
  res.status(201).json({ product });
};

const listProducts = async (req, res) => {
  const products = await productsService.listProducts(req.user);
  res.json({ products });
};

const getProductById = async (req, res) => {
  const product = await productsService.getProductById(req.user, req.params.id);
  res.json({ product });
};

module.exports = {
  createProduct,
  listProducts,
  getProductById,
};
