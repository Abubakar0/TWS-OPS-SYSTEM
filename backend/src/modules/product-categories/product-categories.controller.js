const categoryService = require('../system/system.service');

const listCategories = async (req, res) => {
  const categories = await categoryService.getProductCategories({
    includeInactive: req.query.includeInactive === 'true',
  });
  res.json({ categories });
};

const createCategory = async (req, res) => {
  const categories = await categoryService.createProductCategory(req.user, req.body);
  res.status(201).json({ categories });
};

const updateCategory = async (req, res) => {
  const categories = await categoryService.updateProductCategory(
    req.user,
    req.params.id,
    req.body,
  );
  res.json({ categories });
};

const deleteCategory = async (req, res) => {
  const categories = await categoryService.deleteProductCategory(req.user, req.params.id);
  res.json({ categories });
};

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
