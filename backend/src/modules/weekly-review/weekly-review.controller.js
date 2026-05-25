const weeklyReviewService = require('./weekly-review.service');

const getStatus = async (req, res) => {
  const status = await weeklyReviewService.getWeeklyReviewStatus(req.user);
  res.json({ status });
};

const complete = async (req, res) => {
  const review = await weeklyReviewService.completeWeeklyReview(req.user, req.body);
  res.json({ review });
};

module.exports = {
  getStatus,
  complete,
};
