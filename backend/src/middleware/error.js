class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const notFound = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

const mapDatabaseError = (err) => {
  switch (err.code) {
    case '23505':
      return new AppError('A record with this value already exists.', 409, {
        constraint: err.constraint || null,
      });
    case '23503':
      return new AppError('Referenced record was not found.', 400, {
        constraint: err.constraint || null,
      });
    case '23502':
      return new AppError('A required field is missing.', 400, {
        column: err.column || null,
      });
    case '23514':
      return new AppError('Submitted value violates a database rule.', 400, {
        constraint: err.constraint || null,
      });
    case '22P02':
    case '22007':
    case '22008':
      return new AppError('Submitted value has an invalid format.', 400, {
        code: err.code,
      });
    default:
      return err;
  }
};

const errorHandler = (err, req, res, next) => {
  const normalizedError = err instanceof AppError ? err : mapDatabaseError(err);
  const statusCode = normalizedError.statusCode || 500;

  if (statusCode >= 500) {
    console.error(
      `[api-error] ${req.method} ${req.originalUrl}`,
      {
        message: normalizedError.message,
        stack: normalizedError.stack,
        details: normalizedError.details || null,
        code: err.code || null,
        constraint: err.constraint || null,
      },
    );
  }

  const payload = {
    message: statusCode === 500 ? 'Internal server error' : normalizedError.message,
  };

  if (normalizedError.details) {
    payload.details = normalizedError.details;
  }

  if (process.env.NODE_ENV !== 'production' && statusCode === 500) {
    payload.error = normalizedError.message;
  }

  res.status(statusCode).json(payload);
};

module.exports = {
  AppError,
  asyncHandler,
  notFound,
  errorHandler,
};
