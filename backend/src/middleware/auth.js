const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AppError } = require('./error');
const { resolvePermissions, hasAnyRole, normalizeRoles, resolvePrimaryRole } = require('../modules/users/permissions');
const { assertIpAllowed } = require('../modules/system/system.service');
const { ensureUserRoleSchema } = require('../modules/users/user-schema.service');

const authenticate = async (req, res, next) => {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Authentication required.', 401));
  }

  try {
    await ensureUserRoleSchema();
    req.user = jwt.verify(token, env.jwtSecret);
    req.user.roles = normalizeRoles(req.user.roles || req.user.role, req.user.role || 'hunter');
    req.user.role = resolvePrimaryRole(req.user.roles, req.user.role || 'hunter');
    req.user.permissions = resolvePermissions(req.user.roles, req.user.permissions);
    await assertIpAllowed(req.user, req);
    return next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    if (['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(error?.name)) {
      return next(new AppError('Invalid or expired token.', 401));
    }

    return next(error);
  }
};

const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user || !hasAnyRole(req.user, roles)) {
    return next(new AppError('You do not have access to this resource.', 403));
  }

  return next();
};

const requirePermissions = (...permissions) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401));
  }

  const granted = resolvePermissions(req.user.roles || req.user.role, req.user.permissions);
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
