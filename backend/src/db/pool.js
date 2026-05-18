const { Pool } = require('pg');
const { env } = require('../config/env');

const config = {};

if (env.databaseUrl) {
  config.connectionString = env.databaseUrl;
}

if (env.nodeEnv === 'production') {
  config.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(config);

module.exports = { pool };
