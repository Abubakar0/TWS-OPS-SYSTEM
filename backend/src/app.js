const express = require('express');
const cors = require('cors');
const { env } = require('./config/env');
const authRoutes = require('./modules/auth/auth.routes');
const productRoutes = require('./modules/products/products.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

const corsOptions = {
  origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((origin) => origin.trim()),
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
