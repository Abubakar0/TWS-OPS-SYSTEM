const express = require('express');
const cors = require('cors');
const { env } = require('./config/env');
const authRoutes = require('./modules/auth/auth.routes');
const productRoutes = require('./modules/products/products.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const userRoutes = require('./modules/users/users.routes');
const accountRoutes = require('./modules/accounts/accounts.routes');
const criteriaRoutes = require('./modules/criteria/criteria.routes');
const systemRoutes = require('./modules/system/system.routes');
const weeklyReviewRoutes = require('./modules/weekly-review/weekly-review.routes');
const changeRequestRoutes = require('./modules/change-requests/change-requests.routes');
const teamRoutes = require('./modules/teams/teams.routes');
const orderRoutes = require('./modules/orders/orders.routes');
const listerRoutes = require('./modules/lister/lister.routes');
const orderIssueRoutes = require('./modules/order-issues/order-issues.routes');
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
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/criteria', criteriaRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/weekly-review', weeklyReviewRoutes);
app.use('/api/change-requests', changeRequestRoutes);
app.use('/api/lister', listerRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/order-issues', orderIssueRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
