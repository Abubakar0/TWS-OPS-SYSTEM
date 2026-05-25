const clampInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
};

const normalizePageRequest = ({ page, limit }, defaultLimit = 30) => {
  const normalizedLimit = clampInteger(limit, defaultLimit, 10, 200);
  const normalizedPage = clampInteger(page, 1, 1, 100000);

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    offset: (normalizedPage - 1) * normalizedLimit,
  };
};

const buildPageMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  hasMore: page * limit < total,
});

module.exports = {
  normalizePageRequest,
  buildPageMeta,
};
