const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AppError } = require('./error');
const { resolvePermissions } = require('../modules/users/permissions');

const authenticate = (req, res, next) => {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Authentication required.', 401));
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret);
    req.user.permissions = resolvePermissions(req.user.role, req.user.permissions);
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

const requirePermissions = (...permissions) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401));
  }

  const granted = resolvePermissions(req.user.role, req.user.permissions);
  const missing = permissions.filter((permission) => !granted[permission]);

  if (missing.length > 0) {
    return next(new AppError('You do not have permission to perform this action.', 403));
  }

  return next();
};

module.exports = {
  authenticate,
  requireRoles,
  requirePermissions,
};
