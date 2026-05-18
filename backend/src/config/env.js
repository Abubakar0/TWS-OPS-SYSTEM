require('dotenv').config();

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: numberFromEnv('PORT', 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  validation: {
    minRoi: numberFromEnv('MIN_ROI', 20),
    minProfit: numberFromEnv('MIN_PROFIT', 5),
    minStock: numberFromEnv('MIN_STOCK', 1),
    maxDeliveryDays: numberFromEnv('MAX_DELIVERY_DAYS', 7),
  },
};

if (env.nodeEnv === 'production' && env.jwtSecret === 'development-only-secret') {
  throw new Error('JWT_SECRET must be set in production.');
}

module.exports = { env };
