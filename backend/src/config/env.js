require('dotenv').config();

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const booleanFromEnv = (name, fallback) => {
  const value = process.env[name];

  if (value === undefined) {
    return fallback;
  }

  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: numberFromEnv('PORT', 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  validation: {
    minRoi: numberFromEnv('MIN_ROI', 30),
    minProfit: numberFromEnv('MIN_PROFIT', 0),
    minSoldCount: numberFromEnv('MIN_SOLD_COUNT', 1),
    feePercent: numberFromEnv('FEE_PERCENT', 21),
    asinRequired: booleanFromEnv('ASIN_REQUIRED', true),
    minStockCount: numberFromEnv('MIN_STOCK', 8),
    minAlternateStockCount: numberFromEnv('MIN_ALT_STOCK', 8),
    minRating: numberFromEnv('MIN_RATING', 0),
    customLabelRequired: booleanFromEnv('CUSTOM_LABEL_REQUIRED', false),
    watchersRequired: booleanFromEnv('WATCHERS_REQUIRED', false),
    minWatcherCount: numberFromEnv('MIN_WATCHER_COUNT', 0),
    minSalesLastTwoMonths: numberFromEnv('MIN_SALES_LAST_TWO_MONTHS', 0),
    maxDeliveryDays: numberFromEnv('MAX_DELIVERY_DAYS', 7),
  },
};

if (env.nodeEnv === 'production' && env.jwtSecret === 'development-only-secret') {
  throw new Error('JWT_SECRET must be set in production.');
}

module.exports = { env };
