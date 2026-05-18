const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AppError } = require('./error');

const authenticate = (req, res, next) => {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Authentication required.', 401));
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch (error) {
    return next(new AppError('Invalid or expired token.', 401));
  }
};

const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError('You do not have access to this resource.', 403));
  }

  return next();
};

module.exports = {
  authenticate,
  requireRoles,
};
