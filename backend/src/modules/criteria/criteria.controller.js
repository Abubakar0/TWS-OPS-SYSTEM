const criteriaService = require('./criteria.service');

const getCriteria = async (req, res) => {
  const criteria = await criteriaService.getCriteria();
  res.json({ criteria });
};

const updateCriteria = async (req, res) => {
  const criteria = await criteriaService.updateCriteria(req.user, req.body);
  res.json({ criteria });
};

module.exports = {
  getCriteria,
  updateCriteria,
};
