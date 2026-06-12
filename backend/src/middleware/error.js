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

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    console.error(
      `[api-error] ${req.method} ${req.originalUrl}`,
      {
        message: err.message,
        stack: err.stack,
        details: err.details || null,
      },
    );
  }

  const payload = {
    message: statusCode === 500 ? 'Internal server error' : err.message,
  };

  if (err.details) {
    payload.details = err.details;
  }

  if (process.env.NODE_ENV !== 'production' && statusCode === 500) {
    payload.error = err.message;
  }

  res.status(statusCode).json(payload);
};

module.exports = {
  AppError,
  asyncHandler,
  notFound,
  errorHandler,
};
