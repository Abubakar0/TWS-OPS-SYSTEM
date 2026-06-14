const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');
const { writeAuditLog, listAuditLogs } = require('../users/audit.service');
const { getConfiguredLimit } = require('../system/system.service');
const { ensureOrdersTable, getOrderById } = require('../orders/orders.service');
const { ensureHrTables, getHrDashboard, getAttendanceReport, getPayrollReport, getExpenseReport, getPerformanceReport, listEmployees } = require('../hr/hr.service');
const { ensureTeamTables, listTeams } = require('../teams/teams.service');
const {
  getAccountSummary,
  ensureAccountSummaryDependencies,
} = require('../accounts/accounts.service');
const { getProductById, ensureProductColumns } = require('../products/products.service');
const { getUserDetails } = require('../users/users.service');
const { normalizeRoles, resolvePrimaryRole, hasAnyRole } = require('../users/permissions');
const { ensureChangeRequestTable } = require('../change-requests/change-requests.service');
const {
  normalizeProductWorkflowFilterStatus,
} = require('../../utils/productStatus');

const BUSINESS_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Karachi';
const OPEN_ISSUE_SQL = `(o.order_status = 'ISSUE' OR COALESCE(o.issue_status, '') IN ('OPEN', 'IN_REVIEW'))`;
const OPEN_CHANGE_REQUEST_SQL = `status IN ('OPEN', 'IN_PROGRESS')`;
const OPEN_CHANGE_REQUEST_STATUS_SQL = `request.status IN ('OPEN', 'IN_PROGRESS')`;
const REPORT_EVENT_ACTIONS = {
  VIEW: 'REPORT_VIEWED',
  EXPORT: 'REPORT_EXPORTED',
  DRILLDOWN: 'REPORT_DRILLDOWN_OPENED',
};

const toMoney = (value) => Number(value || 0);
const toInteger = (value) => Number.parseInt(String(value || 0), 10) || 0;
const toRole = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return normalized || null;
};

const ensureReportViewer = (user) => {
  if (
    hasAnyRole(user, ['admin', 'super_admin', 'hr']) ||
    Boolean(user.permissions?.canViewReports)
  ) {
    return;
  }

  throw new AppError('You do not have access to reports.', 403);
};

const ensureReportDependencies = async () => {
  await Promise.all([
    ensureOrdersTable(),
    ensureHrTables(),
    ensureTeamTables(),
    ensureChangeRequestTable(),
    ensureAccountSummaryDependencies(),
    ensureProductColumns(),
  ]);
};

const addClause = (clauses, params, sql, value) => {
  params.push(value);
  clauses.push(sql.replace(/\?/g, `$${params.length}`));
};

const addDateFilters = (query, clauses, params, column) => {
  if (query.dateFrom) {
    addClause(
      clauses,
      params,
      `${column} >= (?::date::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')`,
      query.dateFrom,
    );
  }

  if (query.dateTo) {
    addClause(
      clauses,
      params,
      `${column} < (((?::date + INTERVAL '1 day')::timestamp) AT TIME ZONE '${BUSINESS_TIMEZONE}')`,
      query.dateTo,
    );
  }
};

const buildProductFilterSql = (query = {}, { alias = 'p', accountIdColumn = 'p.account_used', createdColumn = `${alias}.created_at` } = {}) => {
  const clauses = [`${alias}.deleted_at IS NULL`];
  const params = [];

  addDateFilters(query, clauses, params, createdColumn);

  if (query.category) {
    addClause(clauses, params, `${alias}.category = ?`, query.category);
  }

  if (query.status) {
    const normalizedStatus = normalizeProductWorkflowFilterStatus(query.status);

    switch (normalizedStatus) {
      case 'ready_for_listing':
        clauses.push(
          `${alias}.status IN ('approved', 'assigned') AND COALESCE(UPPER(${alias}.listing_review_status::text), '') IN ('', 'NOT_REQUIRED', 'APPROVED')`,
        );
        break;
      case 'listed_needs_review':
        clauses.push(
          `UPPER(COALESCE(${alias}.listing_review_status::text, '')) = 'PENDING'`,
        );
        break;
      case 'rejected':
        clauses.push(
          `(${alias}.status = 'rejected' OR UPPER(COALESCE(${alias}.listing_review_status::text, '')) = 'REJECTED')`,
        );
        break;
      case 'listed':
        addClause(clauses, params, `${alias}.status = ?`, 'listed');
        break;
      default:
        addClause(clauses, params, `${alias}.status = ?`, query.status);
        break;
    }
  }

  if (query.accountId) {
    addClause(clauses, params, `${accountIdColumn} = ?`, query.accountId);
  }

  if (query.userId) {
    addClause(
      clauses,
      params,
      `(${alias}.hunter_id = ? OR ${alias}.assigned_lister_id = ? OR ${alias}.listed_by = ?)`,
      query.userId,
    );
  }

  if (query.teamId) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM team_members tm
        WHERE tm.team_id = ?
          AND tm.user_id IN (${alias}.hunter_id, ${alias}.assigned_lister_id, ${alias}.listed_by)
      )`,
      query.teamId,
    );
  }

  if (query.marketplace) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM accounts report_account
        WHERE report_account.id = ${accountIdColumn}
          AND report_account.marketplace = ?
      )`,
      query.marketplace,
    );
  }

  if (query.country) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM accounts report_account
        WHERE report_account.id = ${accountIdColumn}
          AND report_account.country = ?
      )`,
      query.country,
    );
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    clauses.push(`(
      COALESCE(${alias}.title, '') ILIKE $${index}
      OR COALESCE(${alias}.asin, '') ILIKE $${index}
      OR COALESCE(${alias}.custom_label, '') ILIKE $${index}
    )`);
  }

  return {
    clauses,
    params,
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const buildOrderFilterSql = (query = {}, { alias = 'o', dateColumn = `${alias}.order_date`, accountIdColumn = `${alias}.account_id`, productIdColumn = `${alias}.product_id` } = {}) => {
  const clauses = [`${alias}.deleted_at IS NULL`];
  const params = [];

  addDateFilters(query, clauses, params, dateColumn);

  if (query.accountId) {
    addClause(clauses, params, `${accountIdColumn} = ?`, query.accountId);
  }

  if (query.status) {
    addClause(clauses, params, `${alias}.order_status = ?`, query.status);
  }

  if (query.userId) {
    addClause(
      clauses,
      params,
      `(${alias}.hunter_id = ? OR ${alias}.lister_id = ? OR ${alias}.created_by = ?)`,
      query.userId,
    );
  }

  if (query.teamId) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM team_members tm
        WHERE tm.team_id = ?
          AND tm.user_id IN (${alias}.hunter_id, ${alias}.lister_id, ${alias}.created_by)
      )`,
      query.teamId,
    );
  }

  if (query.category) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM products report_product
        WHERE report_product.id = ${productIdColumn}
          AND report_product.category = ?
      )`,
      query.category,
    );
  }

  if (query.marketplace) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM accounts report_account
        WHERE report_account.id = ${accountIdColumn}
          AND report_account.marketplace = ?
      )`,
      query.marketplace,
    );
  }

  if (query.country) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM accounts report_account
        WHERE report_account.id = ${accountIdColumn}
          AND report_account.country = ?
      )`,
      query.country,
    );
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    clauses.push(`(
      COALESCE(${alias}.order_code, '') ILIKE $${index}
      OR COALESCE(${alias}.ebay_order_id, '') ILIKE $${index}
      OR COALESCE(${alias}.amazon_order_id, '') ILIKE $${index}
      OR COALESCE(${alias}.asin, '') ILIKE $${index}
      OR COALESCE(${alias}.product_title, '') ILIKE $${index}
    )`);
  }

  return {
    clauses,
    params,
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const buildAccountFilterSql = (query = {}, { alias = 'account' } = {}) => {
  const clauses = [];
  const params = [];

  if (query.marketplace) {
    addClause(clauses, params, `${alias}.marketplace = ?`, query.marketplace);
  }

  if (query.country) {
    addClause(clauses, params, `${alias}.country = ?`, query.country);
  }

  if (query.status === 'active') {
    clauses.push(`${alias}.is_active = TRUE`);
  } else if (query.status === 'disabled') {
    clauses.push(`${alias}.is_active = FALSE`);
  }

  if (query.teamId) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM lister_account_assignments la
        JOIN team_members tm ON tm.user_id = la.lister_id
        WHERE la.account_id = ${alias}.id
          AND tm.team_id = ?
      )`,
      query.teamId,
    );
  }

  if (query.userId) {
    addClause(
      clauses,
      params,
      `(
        EXISTS (
          SELECT 1
          FROM products account_product_user
          WHERE account_product_user.account_used = ${alias}.id
            AND account_product_user.deleted_at IS NULL
            AND ? IN (
              account_product_user.hunter_id,
              account_product_user.assigned_lister_id,
              account_product_user.listed_by
            )
        )
        OR EXISTS (
          SELECT 1
          FROM orders account_order_user
          WHERE account_order_user.account_id = ${alias}.id
            AND account_order_user.deleted_at IS NULL
            AND ? IN (
              account_order_user.hunter_id,
              account_order_user.lister_id,
              account_order_user.created_by
            )
        )
        OR EXISTS (
          SELECT 1
          FROM lister_account_assignments account_lister_user
          WHERE account_lister_user.account_id = ${alias}.id
            AND account_lister_user.lister_id = ?
        )
      )`,
      query.userId,
    );
  }

  if (query.assignedHunterId) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM products assigned_hunter_product
        WHERE assigned_hunter_product.account_used = ${alias}.id
          AND assigned_hunter_product.deleted_at IS NULL
          AND assigned_hunter_product.hunter_id = ?
      )`,
      query.assignedHunterId,
    );
  }

  if (query.assignedListerId) {
    addClause(
      clauses,
      params,
      `(
        EXISTS (
          SELECT 1
          FROM lister_account_assignments assigned_lister_account
          WHERE assigned_lister_account.account_id = ${alias}.id
            AND assigned_lister_account.lister_id = ?
        )
        OR EXISTS (
          SELECT 1
          FROM products assigned_lister_product
          WHERE assigned_lister_product.account_used = ${alias}.id
            AND assigned_lister_product.deleted_at IS NULL
            AND ? IN (assigned_lister_product.assigned_lister_id, assigned_lister_product.listed_by)
        )
      )`,
      query.assignedListerId,
    );
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    clauses.push(`(
      ${alias}.name ILIKE $${index}
      OR COALESCE(${alias}.marketplace, '') ILIKE $${index}
      OR COALESCE(${alias}.country, '') ILIKE $${index}
    )`);
  }

  return {
    clauses,
    params,
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const buildUserFilterSql = (query = {}) => {
  const clauses = ['u.deleted_at IS NULL'];
  const params = [];

  if (query.role) {
    params.push(JSON.stringify([toRole(query.role)]));
    clauses.push(`COALESCE(u.roles, jsonb_build_array(u.role::text)) @> $${params.length}::jsonb`);
  }

  if (query.status) {
    addClause(clauses, params, `u.status = ?`, query.status);
  }

  if (query.teamId) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM team_members tm
        WHERE tm.user_id = u.id
          AND tm.team_id = ?
      )`,
      query.teamId,
    );
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    clauses.push(`(
      u.name ILIKE $${index}
      OR u.email ILIKE $${index}
      OR COALESCE(u.roles::text, '') ILIKE $${index}
      OR COALESCE(u.role::text, '') ILIKE $${index}
    )`);
  }

  return {
    clauses,
    params,
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const buildActivityFilterPayload = (query = {}) => ({
  action: query.action,
  actorUserId: query.userId,
  actorRole: query.role,
  search: query.search,
  from: query.dateFrom,
  to: query.dateTo,
  page: query.page,
  limit: query.limit,
});

const logReportAction = async (actor, action, details = {}) => {
  await writeAuditLog({
    actorUserId: actor.id,
    action,
    targetType: 'report',
    targetId: details.section || details.scope || null,
    details,
  });
};

const getSummaryReport = async (actor, query = {}) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();

  const productFilters = buildProductFilterSql(query);
  const orderFilters = buildOrderFilterSql(query);
  const categoryProductFilters = buildProductFilterSql({ ...query, category: undefined });

  const [productSummary, orderSummary, changeRequestSummary] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*)::int AS "huntedProducts",
          COUNT(*) FILTER (WHERE p.status = 'listed')::int AS "listedProducts",
          COUNT(*) FILTER (WHERE p.status = 'rejected')::int AS "rejectedProducts"
        FROM products p
        ${productFilters.whereSql}
      `,
      productFilters.params,
    ),
    pool.query(
      `
        SELECT
          COUNT(*)::int AS "totalOrders",
          COUNT(*) FILTER (WHERE o.order_status = 'DELIVERED')::int AS "deliveredOrders",
          COUNT(*) FILTER (WHERE o.order_status = 'CANCELLED')::int AS "cancelledOrders",
          COUNT(*) FILTER (WHERE o.order_status = 'REFUNDED')::int AS "refundedOrders",
          COUNT(*) FILTER (WHERE ${OPEN_ISSUE_SQL.replaceAll('o.', 'o.')})::int AS "openIssues",
          COALESCE(SUM(o.sale_price), 0)::numeric(10, 2) AS "totalRevenue",
          COALESCE(SUM(o.profit), 0)::numeric(10, 2) AS "totalProfit",
          COALESCE(AVG(NULLIF(o.roi, 0)), 0)::numeric(10, 2) AS "averageRoi",
          COALESCE(SUM(o.profit * COALESCE(account.company_profit_percentage, 50) / 100.0), 0)::numeric(10, 2) AS "companyShare",
          COALESCE(SUM(o.profit * COALESCE(account.client_profit_percentage, 50) / 100.0), 0)::numeric(10, 2) AS "clientShare"
        FROM orders o
        LEFT JOIN accounts account ON account.id = o.account_id
        ${orderFilters.whereSql}
      `,
      orderFilters.params,
    ),
    pool.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE ${OPEN_CHANGE_REQUEST_STATUS_SQL})::int AS "pendingChangeRequests"
        FROM product_change_requests request
        LEFT JOIN products p ON p.id = request.product_id
        ${categoryProductFilters.whereSql.replaceAll('p.', 'p.')}
      `,
      categoryProductFilters.params,
    ),
  ]);

  const productRow = productSummary.rows[0] || {};
  const orderRow = orderSummary.rows[0] || {};
  const changeRow = changeRequestSummary.rows[0] || {};

  return {
    totalRevenue: toMoney(orderRow.totalRevenue),
    totalProfit: toMoney(orderRow.totalProfit),
    companyShare: toMoney(orderRow.companyShare),
    clientShare: toMoney(orderRow.clientShare),
    totalOrders: toInteger(orderRow.totalOrders),
    deliveredOrders: toInteger(orderRow.deliveredOrders),
    cancelledOrders: toInteger(orderRow.cancelledOrders),
    refundedOrders: toInteger(orderRow.refundedOrders),
    huntedProducts: toInteger(productRow.huntedProducts),
    listedProducts: toInteger(productRow.listedProducts),
    rejectedProducts: toInteger(productRow.rejectedProducts),
    averageRoi: toMoney(orderRow.averageRoi),
    openIssues: toInteger(orderRow.openIssues),
    pendingChangeRequests: toInteger(changeRow.pendingChangeRequests),
  };
};

const getExecutiveReport = async (actor, query = {}) => {
  ensureReportViewer(actor);
  const summary = await getSummaryReport(actor, query);
  const sectionRequests = {
    topHunters: () => listUserReports(actor, { ...query, role: 'hunter', page: 1, limit: 5 }),
    topAccounts: () => listAccountReports(actor, { ...query, page: 1, limit: 5 }),
    topCategories: () => listCategoryReports(actor, { ...query, page: 1, limit: 5 }),
    topMarketplaces: () => listMarketplaceReports(actor, { ...query, page: 1, limit: 5 }),
  };
  const sectionEntries = Object.entries(sectionRequests);
  const settled = await Promise.allSettled(sectionEntries.map(([, loader]) => loader()));
  const warnings = [];
  const resolveItems = (key) => {
    const index = sectionEntries.findIndex(([sectionKey]) => sectionKey === key);
    const result = settled[index];

    if (!result || result.status !== 'fulfilled') {
      const reason = result?.reason;
      warnings.push({
        section: key,
        message: reason?.message || 'Report section could not be loaded.',
      });
      console.error('[report-executive-section-error]', {
        section: key,
        message: reason?.message || String(reason),
        stack: reason?.stack || null,
      });
      return [];
    }

    return result.value?.items || [];
  };

  return {
    summary,
    topHunters: resolveItems('topHunters'),
    topAccounts: resolveItems('topAccounts'),
    topCategories: resolveItems('topCategories'),
    topMarketplaces: resolveItems('topMarketplaces'),
    warnings,
  };
};

const mapUserReportRow = (details) => {
  const roles = normalizeRoles(details.user.roles || details.user.role, details.user.role);
  const primaryRole = resolvePrimaryRole(roles, details.user.role);
  const hunterStats = details.stats.hunter || {};
  const listerStats = details.stats.lister || {};
  const orderProcessorStats = details.stats.orderProcessor || {};
  const hrStats = details.stats.hr || {};
  const adminStats = details.stats.admin || {};

  const roleMetrics = {
    hunter: {
      primary: hunterStats.productsSubmitted || 0,
      secondary: hunterStats.listedProducts || 0,
      tertiary: hunterStats.orderIssues || 0,
      profit: toMoney(hunterStats.totalProfit),
      roi: toMoney(hunterStats.averageRoi),
      primaryLabel: 'Hunted',
      secondaryLabel: 'Listed',
      tertiaryLabel: 'Issues',
    },
    lister: {
      primary: listerStats.productsListed || 0,
      secondary: listerStats.pendingChangeRequests || 0,
      tertiary: listerStats.fixedChangeRequests || 0,
      profit: toMoney(listerStats.totalProfit),
      roi: 0,
      primaryLabel: 'Listed',
      secondaryLabel: 'Pending fixes',
      tertiaryLabel: 'Fixed',
    },
    order_processor: {
      primary: orderProcessorStats.ordersAdded || 0,
      secondary: orderProcessorStats.ordersPlaced || 0,
      tertiary: orderProcessorStats.issueOrders || 0,
      profit: 0,
      roi: 0,
      primaryLabel: 'Orders added',
      secondaryLabel: 'Placed',
      tertiaryLabel: 'Issues',
    },
    hr: {
      primary: hrStats.employeesManaged || 0,
      secondary: hrStats.attendanceActions || 0,
      tertiary: hrStats.payrollActions || 0,
      profit: 0,
      roi: 0,
      primaryLabel: 'Employees',
      secondaryLabel: 'Attendance',
      tertiaryLabel: 'Payroll',
    },
    admin: {
      primary: adminStats.usersCreated || 0,
      secondary: adminStats.accountsManaged || 0,
      tertiary: adminStats.reportsExported || 0,
      profit: 0,
      roi: 0,
      primaryLabel: 'Users created',
      secondaryLabel: 'Accounts',
      tertiaryLabel: 'Reports',
    },
    super_admin: {
      primary: adminStats.usersCreated || 0,
      secondary: adminStats.accountsManaged || 0,
      tertiary: adminStats.reportsExported || 0,
      profit: 0,
      roi: 0,
      primaryLabel: 'Users created',
      secondaryLabel: 'Accounts',
      tertiaryLabel: 'Reports',
    },
  }[primaryRole] || {
    primary: 0,
    secondary: 0,
    tertiary: 0,
    profit: 0,
    roi: 0,
    primaryLabel: 'Primary',
    secondaryLabel: 'Secondary',
    tertiaryLabel: 'Tertiary',
  };

  return {
    id: details.user.id,
    name: details.user.name,
    email: details.user.email,
    role: primaryRole,
    roles,
    status: details.user.status || (details.user.isActive ? 'active' : 'disabled'),
    teamName: details.team?.name || null,
    metrics: roleMetrics,
    details,
  };
};

const listUserReports = async (actor, query = {}) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const filters = buildUserFilterSql(query);
  const defaultLimit = await getConfiguredLimit('users', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        u.id::text AS id
      FROM users u
      ${filters.whereSql}
      ORDER BY u.name
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );

  const ids = result.rows.map((row) => row.id);
  const items = await Promise.all(
    ids.map((id) =>
      getUserDetails(actor, id, { reportQuery: query }).then(mapUserReportRow),
    ),
  );
  const total = result.rows[0]?.totalCount || 0;

  return {
    items,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, total),
  };
};

const getUserReport = async (actor, id, forcedRole = null, query = {}) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const details = await getUserDetails(actor, id, { reportQuery: query });
  const row = mapUserReportRow(details);

  if (forcedRole && !row.roles.includes(forcedRole)) {
    throw new AppError('User not found in this report scope.', 404);
  }

  return row;
};

const listAccountReports = async (actor, query = {}) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const filters = buildAccountFilterSql(query);
  const defaultLimit = await getConfiguredLimit('accounts', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const sortColumns = {
    orders: '"totalOrders"',
    revenue: '"totalRevenue"',
    profit: '"totalProfit"',
    roi: '"averageRoi"',
    delivered: '"deliveredOrders"',
    deliveredOrders: '"deliveredOrders"',
  };
  const sortBy = sortColumns[query.sortBy] || '"totalOrders"';
  const sortDirection = String(query.sortDirection || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const accountMetricsFromSql = `
      FROM accounts account
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT la.lister_id) AS assigned_count
        FROM lister_account_assignments la
        WHERE la.account_id = account.id
      ) assigned ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          STRING_AGG(DISTINCT hunter.name, ', ' ORDER BY hunter.name) AS assigned_hunters,
          COUNT(DISTINCT hunter.id) AS assigned_hunter_count
        FROM products p
        JOIN users hunter ON hunter.id = p.hunter_id
        WHERE p.account_used = account.id
          AND p.deleted_at IS NULL
      ) hunter_metrics ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          STRING_AGG(DISTINCT lister.name, ', ' ORDER BY lister.name) AS assigned_listers
        FROM (
          SELECT la.lister_id
          FROM lister_account_assignments la
          WHERE la.account_id = account.id
          UNION
          SELECT p.assigned_lister_id
          FROM products p
          WHERE p.account_used = account.id
            AND p.deleted_at IS NULL
            AND p.assigned_lister_id IS NOT NULL
          UNION
          SELECT p.listed_by
          FROM products p
          WHERE p.account_used = account.id
            AND p.deleted_at IS NULL
            AND p.listed_by IS NOT NULL
        ) scoped_listers
        JOIN users lister ON lister.id = scoped_listers.lister_id
      ) lister_metrics ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE p.deleted_at IS NULL AND p.status = 'listed') AS listed_count,
          COUNT(*) FILTER (WHERE p.deleted_at IS NULL AND p.status = 'assigned') AS pending_count
        FROM products p
        WHERE p.account_used = account.id
      ) product_metrics ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE o.deleted_at IS NULL) AS total_orders,
          COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND o.order_status = 'DELIVERED') AS delivered_orders,
          COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND o.order_status = 'RETURNED') AS returned_orders,
          COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND o.order_status = 'REFUNDED') AS refunded_orders,
          COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND o.order_status = 'CANCELLED') AS cancelled_orders,
          COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND ${OPEN_ISSUE_SQL}) AS issue_orders,
          COALESCE(SUM(o.sale_price) FILTER (WHERE o.deleted_at IS NULL), 0)::numeric(10,2) AS total_revenue,
          COALESCE(SUM(o.total_cost) FILTER (WHERE o.deleted_at IS NULL), 0)::numeric(10,2) AS total_cost,
          COALESCE(SUM(o.profit) FILTER (WHERE o.deleted_at IS NULL), 0)::numeric(10,2) AS total_profit,
          COALESCE(AVG(NULLIF(o.roi, 0)) FILTER (WHERE o.deleted_at IS NULL), 0)::numeric(10,2) AS average_roi
        FROM orders o
        WHERE o.account_id = account.id
      ) order_metrics ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE ${OPEN_CHANGE_REQUEST_SQL}) AS pending_requests
        FROM product_change_requests request
        WHERE request.account_id = account.id
      ) change_metrics ON TRUE
      ${filters.whereSql}
  `;
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        account.id::text AS id,
        account.name,
        account.marketplace,
        account.country,
        account.currency,
        account.is_active AS "isActive",
        account.client_profit_percentage AS "clientProfitPercentage",
        account.company_profit_percentage AS "companyProfitPercentage",
        account.previous_order_count AS "previousOrderCount",
        account.last_month_profit AS "lastMonthProfit",
        COALESCE(hunter_metrics.assigned_hunters, '') AS "assignedHunterNames",
        COALESCE(hunter_metrics.assigned_hunter_count, 0)::int AS "assignedHunterCount",
        COALESCE(lister_metrics.assigned_listers, '') AS "assignedListerNames",
        COALESCE(assigned.assigned_count, 0)::int AS "assignedListerCount",
        COALESCE(product_metrics.listed_count, 0)::int AS "totalListed",
        COALESCE(product_metrics.pending_count, 0)::int AS "pendingListings",
        COALESCE(order_metrics.total_orders, 0)::int AS "totalOrders",
        COALESCE(order_metrics.delivered_orders, 0)::int AS "deliveredOrders",
        COALESCE(order_metrics.returned_orders, 0)::int AS "returnedOrders",
        COALESCE(order_metrics.refunded_orders, 0)::int AS "refundedOrders",
        COALESCE(order_metrics.cancelled_orders, 0)::int AS "cancelledOrders",
        COALESCE(order_metrics.total_revenue, 0)::numeric(10,2) AS "totalRevenue",
        COALESCE(order_metrics.total_cost, 0)::numeric(10,2) AS "totalCost",
        COALESCE(order_metrics.total_profit, 0)::numeric(10,2) AS "totalProfit",
        COALESCE(order_metrics.average_roi, 0)::numeric(10,2) AS "averageRoi",
        COALESCE(order_metrics.issue_orders, 0)::int AS "openIssues",
        COALESCE(change_metrics.pending_requests, 0)::int AS "pendingChangeRequests"
      ${accountMetricsFromSql}
      ORDER BY ${sortBy} ${sortDirection}, "totalOrders" DESC, "totalRevenue" DESC, account.name
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );
  const summary = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE scoped."totalOrders" > 0)::int AS "totalAccountsWithOrders",
        COALESCE(SUM(scoped."totalOrders"), 0)::int AS "totalOrders",
        COALESCE(SUM(scoped."totalRevenue"), 0)::numeric(10,2) AS "totalRevenue",
        COALESCE(SUM(scoped."totalProfit"), 0)::numeric(10,2) AS "totalProfit"
      FROM (
        SELECT
          account.id,
          COALESCE(order_metrics.total_orders, 0)::int AS "totalOrders",
          COALESCE(order_metrics.total_revenue, 0)::numeric(10,2) AS "totalRevenue",
          COALESCE(order_metrics.total_profit, 0)::numeric(10,2) AS "totalProfit"
        ${accountMetricsFromSql}
      ) scoped
    `,
    filters.params,
  );

  return {
    items: result.rows.map((row, index) => {
      const totalOrders = toInteger(row.totalOrders);
      const refundedOrders = toInteger(row.refundedOrders);
      const cancelledOrders = toInteger(row.cancelledOrders);
      const visualIndicators = [];

      if (pageRequest.page === 1 && index < 3 && totalOrders > 0) {
        visualIndicators.push('Top Performing Account');
      }

      if (totalOrders === 0) {
        visualIndicators.push('No Orders');
      }

      if (totalOrders > 0 && refundedOrders / totalOrders >= 0.1) {
        visualIndicators.push('High Refund Rate');
      }

      if (totalOrders > 0 && cancelledOrders / totalOrders >= 0.1) {
        visualIndicators.push('High Cancellation Rate');
      }

      return {
        ...row,
        totalRevenue: toMoney(row.totalRevenue),
        totalCost: toMoney(row.totalCost),
        totalProfit: toMoney(row.totalProfit),
        averageRoi: toMoney(row.averageRoi),
        clientProfitPercentage: row.clientProfitPercentage === null ? null : Number(row.clientProfitPercentage),
        companyProfitPercentage: row.companyProfitPercentage === null ? null : Number(row.companyProfitPercentage),
        lastMonthProfit: toMoney(row.lastMonthProfit),
        visualIndicators,
      };
    }),
    summary: {
      totalAccountsWithOrders: toInteger(summary.rows[0]?.totalAccountsWithOrders),
      totalOrders: toInteger(summary.rows[0]?.totalOrders),
      totalRevenue: toMoney(summary.rows[0]?.totalRevenue),
      totalProfit: toMoney(summary.rows[0]?.totalProfit),
    },
    ...buildPageMeta(pageRequest.page, pageRequest.limit, result.rows[0]?.totalCount || 0),
  };
};

const getAccountReport = async (actor, id) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const summary = await getAccountSummary(id);
  const companyProfitPercentage = Number(summary.account.companyProfitPercentage || 50);
  const clientProfitPercentage = Number(summary.account.clientProfitPercentage || 50);

  return {
    ...summary,
    split: {
      companyShare: Number(((summary.stats.totalProfit || 0) * companyProfitPercentage) / 100),
      clientShare: Number(((summary.stats.totalProfit || 0) * clientProfitPercentage) / 100),
      companyProfitPercentage,
      clientProfitPercentage,
    },
  };
};

const listProductReports = async (actor, query = {}) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const filters = buildProductFilterSql(query, { accountIdColumn: 'p.account_used' });
  const defaultLimit = await getConfiguredLimit('products', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        p.id::text AS id,
        p.title,
        p.asin,
        p.category,
        p.custom_label AS "customLabel",
        p.status,
        p.amazon_price AS "amazonPrice",
        p.ebay_price AS "ebayPrice",
        p.profit,
        p.roi,
        p.quality_label AS "qualityLabel",
        p.rating,
        p.sold_count AS "soldCount",
        p.created_at AS "createdAt",
        p.listed_at AS "listedAt",
        p.updated_at AS "updatedAt",
        hunter.name AS "hunterName",
        lister.name AS "listerName",
        account.name AS "accountName",
        account.marketplace,
        account.country,
        COALESCE(order_metrics.order_count, 0)::int AS "orderCount",
        COALESCE(order_metrics.issue_count, 0)::int AS "issueCount",
        COALESCE(order_metrics.revenue, 0)::numeric(10,2) AS revenue
      FROM products p
      LEFT JOIN users hunter ON hunter.id = p.hunter_id
      LEFT JOIN users lister ON lister.id = COALESCE(p.listed_by, p.assigned_lister_id)
      LEFT JOIN accounts account ON account.id = p.account_used
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE o.deleted_at IS NULL) AS order_count,
          COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND ${OPEN_ISSUE_SQL}) AS issue_count,
          COALESCE(SUM(o.sale_price) FILTER (WHERE o.deleted_at IS NULL), 0)::numeric(10,2) AS revenue
        FROM orders o
        WHERE o.product_id = p.id
      ) order_metrics ON TRUE
      ${filters.whereSql}
      ORDER BY p.created_at DESC
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );

  return {
    items: result.rows.map((row) => ({
      ...row,
      amazonPrice: row.amazonPrice === null ? null : Number(row.amazonPrice),
      ebayPrice: row.ebayPrice === null ? null : Number(row.ebayPrice),
      profit: toMoney(row.profit),
      roi: toMoney(row.roi),
      rating: row.rating === null ? null : Number(row.rating),
      soldCount: toInteger(row.soldCount),
      revenue: toMoney(row.revenue),
    })),
    ...buildPageMeta(pageRequest.page, pageRequest.limit, result.rows[0]?.totalCount || 0),
  };
};

const getProductReport = async (actor, id) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const product = await getProductById(actor, id);
  const orderMetrics = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS "orderCount",
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND ${OPEN_ISSUE_SQL.replaceAll('o.', '')})::int AS "issueCount",
        COALESCE(SUM(profit) FILTER (WHERE deleted_at IS NULL), 0)::numeric(10,2) AS "profitGenerated",
        MAX(order_date) FILTER (WHERE deleted_at IS NULL) AS "lastOrderDate"
      FROM orders
      WHERE product_id = $1
    `,
    [id],
  );

  return {
    product,
    metrics: {
      orderCount: toInteger(orderMetrics.rows[0]?.orderCount),
      issueCount: toInteger(orderMetrics.rows[0]?.issueCount),
      profitGenerated: toMoney(orderMetrics.rows[0]?.profitGenerated),
      lastOrderDate: orderMetrics.rows[0]?.lastOrderDate || null,
    },
  };
};

const listOrderReports = async (actor, query = {}) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const filters = buildOrderFilterSql(query);
  const defaultLimit = await getConfiguredLimit('orders', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        o.id::text AS id,
        o.order_code AS "orderCode",
        o.ebay_order_id AS "ebayOrderId",
        o.amazon_order_id AS "amazonOrderId",
        o.asin,
        o.product_title AS "productTitle",
        o.order_status AS "orderStatus",
        o.placement_status AS "placementStatus",
        o.issue_status AS "issueStatus",
        o.sale_price AS "salePrice",
        o.total_cost AS "totalCost",
        o.profit,
        o.roi,
        o.order_date AS "orderDate",
        o.delivered_date AS "deliveredDate",
        o.created_at AS "createdAt",
        o.updated_at AS "updatedAt",
        hunter.name AS "hunterName",
        lister.name AS "listerName",
        account.name AS "accountName",
        account.marketplace,
        account.country,
        product.category AS "category"
      FROM orders o
      LEFT JOIN users hunter ON hunter.id = o.hunter_id
      LEFT JOIN users lister ON lister.id = o.lister_id
      LEFT JOIN accounts account ON account.id = o.account_id
      LEFT JOIN products product ON product.id = o.product_id
      ${filters.whereSql}
      ORDER BY o.order_date DESC, o.created_at DESC
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );

  return {
    items: result.rows.map((row) => ({
      ...row,
      salePrice: toMoney(row.salePrice),
      totalCost: toMoney(row.totalCost),
      profit: toMoney(row.profit),
      roi: toMoney(row.roi),
    })),
    ...buildPageMeta(pageRequest.page, pageRequest.limit, result.rows[0]?.totalCount || 0),
  };
};

const getOrderReport = async (actor, id) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const order = await getOrderById(actor, id, { includeDeleted: true });
  return { order };
};

const getHrReport = async (actor, query = {}) => {
  ensureReportViewer(actor);
  if (!hasAnyRole(actor, ['admin', 'super_admin', 'hr'])) {
    throw new AppError('You do not have access to HR reports.', 403);
  }

  await ensureReportDependencies();
  const [dashboard, attendance, payroll, expenses, performance, employees] = await Promise.all([
    getHrDashboard(actor, query),
    getAttendanceReport(actor, query),
    getPayrollReport(actor, query),
    getExpenseReport(actor, query),
    getPerformanceReport(actor),
    listEmployees(actor, query),
  ]);

  return {
    dashboard,
    attendance,
    payroll,
    expenses,
    performance,
    employees,
  };
};

const listTeamReports = async (actor, query = {}) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const teams = await listTeams(actor, { search: query.search });

  const items = await Promise.all(
    teams.map(async (team) => {
      const metrics = await pool.query(
        `
          SELECT
            COUNT(DISTINCT tm.user_id)::int AS "membersCount",
            COUNT(DISTINCT tm.user_id) FILTER (WHERE COALESCE(u.roles, jsonb_build_array(u.role::text)) @> '["hunter"]'::jsonb)::int AS hunters,
            COUNT(DISTINCT tm.user_id) FILTER (WHERE COALESCE(u.roles, jsonb_build_array(u.role::text)) @> '["lister"]'::jsonb)::int AS listers,
            COUNT(DISTINCT tm.user_id) FILTER (WHERE COALESCE(u.roles, jsonb_build_array(u.role::text)) @> '["admin"]'::jsonb)::int AS admins,
            COUNT(DISTINCT tm.user_id) FILTER (WHERE COALESCE(u.roles, jsonb_build_array(u.role::text)) @> '["hr"]'::jsonb)::int AS hrs,
            COUNT(DISTINCT p.id) FILTER (WHERE p.deleted_at IS NULL AND p.status = 'listed')::int AS "listedProducts",
            COUNT(DISTINCT o.id) FILTER (WHERE o.deleted_at IS NULL)::int AS "totalOrders",
            COALESCE(SUM(o.profit) FILTER (WHERE o.deleted_at IS NULL), 0)::numeric(10,2) AS "totalProfit"
          FROM team_members tm
          JOIN users u ON u.id = tm.user_id
          LEFT JOIN products p ON p.hunter_id = u.id OR p.assigned_lister_id = u.id OR p.listed_by = u.id
          LEFT JOIN orders o ON o.hunter_id = u.id OR o.lister_id = u.id OR o.created_by = u.id
          WHERE tm.team_id = $1
        `,
        [team.id],
      );

      return {
        id: team.id,
        name: team.name,
        description: team.description,
        membersCount: toInteger(metrics.rows[0]?.membersCount),
        hunters: toInteger(metrics.rows[0]?.hunters),
        listers: toInteger(metrics.rows[0]?.listers),
        admins: toInteger(metrics.rows[0]?.admins),
        hrs: toInteger(metrics.rows[0]?.hrs),
        listedProducts: toInteger(metrics.rows[0]?.listedProducts),
        totalOrders: toInteger(metrics.rows[0]?.totalOrders),
        totalProfit: toMoney(metrics.rows[0]?.totalProfit),
      };
    }),
  );

  const pageRequest = normalizePageRequest(query, await getConfiguredLimit('users', query.limit));
  const sliced = items.slice(pageRequest.offset, pageRequest.offset + pageRequest.limit);

  return {
    items: sliced,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, items.length),
  };
};

const listCategoryReports = async (actor, query = {}) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const productFilters = buildProductFilterSql({ ...query, category: undefined });
  const orderFilters = buildOrderFilterSql({ ...query, category: undefined });
  const pageRequest = normalizePageRequest(query, await getConfiguredLimit('products', query.limit));

  const [productRows, orderRows] = await Promise.all([
    pool.query(
      `
        SELECT
          COALESCE(NULLIF(p.category, ''), 'Uncategorized') AS "category",
          COUNT(*)::int AS "productCount",
          COUNT(*) FILTER (WHERE p.status = 'listed')::int AS "listedCount",
          COUNT(*) FILTER (WHERE p.status = 'rejected')::int AS "rejectedCount",
          COALESCE(AVG(NULLIF(p.roi, 0)), 0)::numeric(10,2) AS "averageRoi"
        FROM products p
        ${productFilters.whereSql}
        GROUP BY COALESCE(NULLIF(p.category, ''), 'Uncategorized')
      `,
      productFilters.params,
    ),
    pool.query(
      `
        SELECT
          COALESCE(NULLIF(product.category, ''), 'Uncategorized') AS "category",
          COUNT(*)::int AS "orderCount",
          COALESCE(SUM(o.sale_price), 0)::numeric(10,2) AS revenue,
          COALESCE(SUM(o.profit), 0)::numeric(10,2) AS profit,
          COUNT(*) FILTER (WHERE ${OPEN_ISSUE_SQL})::int AS "openIssues"
        FROM orders o
        LEFT JOIN products product ON product.id = o.product_id
        ${orderFilters.whereSql}
        GROUP BY COALESCE(NULLIF(product.category, ''), 'Uncategorized')
      `,
      orderFilters.params,
    ),
  ]);

  const map = new Map();
  for (const row of productRows.rows) {
    map.set(row.category, {
      category: row.category,
      productCount: toInteger(row.productCount),
      listedCount: toInteger(row.listedCount),
      rejectedCount: toInteger(row.rejectedCount),
      orderCount: 0,
      revenue: 0,
      profit: 0,
      averageRoi: toMoney(row.averageRoi),
      openIssues: 0,
    });
  }

  for (const row of orderRows.rows) {
    const current = map.get(row.category) || {
      category: row.category,
      productCount: 0,
      listedCount: 0,
      rejectedCount: 0,
      orderCount: 0,
      revenue: 0,
      profit: 0,
      averageRoi: 0,
      openIssues: 0,
    };
    current.orderCount = toInteger(row.orderCount);
    current.revenue = toMoney(row.revenue);
    current.profit = toMoney(row.profit);
    current.openIssues = toInteger(row.openIssues);
    map.set(row.category, current);
  }

  const items = [...map.values()].sort((left, right) => right.profit - left.profit || left.category.localeCompare(right.category));
  const sliced = items.slice(pageRequest.offset, pageRequest.offset + pageRequest.limit);

  return {
    items: sliced,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, items.length),
  };
};

const listMarketplaceReports = async (actor, query = {}) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const filters = buildAccountFilterSql(query);
  const pageRequest = normalizePageRequest(query, await getConfiguredLimit('accounts', query.limit));
  const result = await pool.query(
    `
      SELECT
        account.marketplace,
        COALESCE(account.country, 'Unspecified') AS country,
        COUNT(*)::int AS "accountsCount",
        COUNT(DISTINCT p.id) FILTER (WHERE p.deleted_at IS NULL AND p.status = 'listed')::int AS "listedCount",
        COUNT(DISTINCT o.id) FILTER (WHERE o.deleted_at IS NULL)::int AS "orderCount",
        COALESCE(SUM(o.sale_price) FILTER (WHERE o.deleted_at IS NULL), 0)::numeric(10,2) AS revenue,
        COALESCE(SUM(o.profit) FILTER (WHERE o.deleted_at IS NULL), 0)::numeric(10,2) AS profit,
        COALESCE(SUM(o.profit * COALESCE(account.company_profit_percentage, 50) / 100.0) FILTER (WHERE o.deleted_at IS NULL), 0)::numeric(10,2) AS "companyShare",
        COALESCE(SUM(o.profit * COALESCE(account.client_profit_percentage, 50) / 100.0) FILTER (WHERE o.deleted_at IS NULL), 0)::numeric(10,2) AS "clientShare"
      FROM accounts account
      LEFT JOIN products p ON p.account_used = account.id
      LEFT JOIN orders o ON o.account_id = account.id
      ${filters.whereSql}
      GROUP BY account.marketplace, COALESCE(account.country, 'Unspecified')
      ORDER BY profit DESC, account.marketplace, country
    `,
    filters.params,
  );

  const items = result.rows.map((row) => ({
    marketplace: row.marketplace,
    country: row.country,
    accountsCount: toInteger(row.accountsCount),
    listedCount: toInteger(row.listedCount),
    orderCount: toInteger(row.orderCount),
    revenue: toMoney(row.revenue),
    profit: toMoney(row.profit),
    companyShare: toMoney(row.companyShare),
    clientShare: toMoney(row.clientShare),
  }));
  const sliced = items.slice(pageRequest.offset, pageRequest.offset + pageRequest.limit);

  return {
    items: sliced,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, items.length),
  };
};

const getActivitySummary = async (query = {}) => {
  const filters = buildActivityFilterPayload(query);
  const clauses = [];
  const params = [];

  if (filters.action) {
    addClause(clauses, params, `log.action = ?`, filters.action);
  }

  if (filters.actorUserId) {
    addClause(clauses, params, `log.actor_user_id = ?`, filters.actorUserId);
  }

  if (filters.actorRole) {
    addClause(clauses, params, `actor.role = ?`, filters.actorRole);
  }

  if (query.teamId) {
    addClause(
      clauses,
      params,
      `EXISTS (
        SELECT 1
        FROM team_members tm
        WHERE tm.user_id = actor.id
          AND tm.team_id = ?
      )`,
      query.teamId,
    );
  }

  if (filters.from) {
    addClause(clauses, params, `log.created_at >= ?`, filters.from);
  }

  if (filters.to) {
    addClause(clauses, params, `log.created_at < (?::date + INTERVAL '1 day')`, filters.to);
  }

  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    const index = params.length;
    clauses.push(`(
      log.action ILIKE $${index}
      OR COALESCE(actor.name, '') ILIKE $${index}
      OR COALESCE(actor.email, '') ILIKE $${index}
      OR COALESCE(log.details::text, '') ILIKE $${index}
    )`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS "totalEvents",
        COUNT(*) FILTER (WHERE log.action = 'auth.login')::int AS logins,
        COUNT(*) FILTER (WHERE log.action = 'REPORT_EXPORTED')::int AS exports,
        COUNT(*) FILTER (WHERE log.action ILIKE 'settings.%')::int AS "settingsActions",
        COUNT(*) FILTER (WHERE log.target_type = 'product')::int AS "productActions",
        COUNT(*) FILTER (WHERE log.target_type = 'order')::int AS "orderActions",
        COUNT(*) FILTER (WHERE log.target_type = 'report')::int AS "reportActions"
      FROM audit_logs log
      LEFT JOIN users actor ON actor.id = log.actor_user_id
      ${whereSql}
    `,
    params,
  );

  return result.rows[0] || {};
};

const listActivityReports = async (actor, query = {}) => {
  ensureReportViewer(actor);
  await ensureReportDependencies();
  const [list, summary] = await Promise.all([
    listAuditLogs(buildActivityFilterPayload(query)),
    getActivitySummary(query),
  ]);

  return {
    ...list,
    summary: {
      totalEvents: toInteger(summary.totalEvents),
      logins: toInteger(summary.logins),
      exports: toInteger(summary.exports),
      settingsActions: toInteger(summary.settingsActions),
      productActions: toInteger(summary.productActions),
      orderActions: toInteger(summary.orderActions),
      reportActions: toInteger(summary.reportActions),
    },
  };
};

const trackReportEvent = async (actor, payload = {}) => {
  ensureReportViewer(actor);
  const kind = String(payload.kind || '').trim().toUpperCase();
  const action = REPORT_EVENT_ACTIONS[kind];

  if (!action) {
    throw new AppError('Invalid report event.', 400);
  }

  await logReportAction(actor, action, {
    section: payload.section || null,
    targetId: payload.targetId || null,
    meta: payload.meta || null,
  });

  return { recorded: true };
};

module.exports = {
  getSummaryReport,
  getExecutiveReport,
  listUserReports,
  getUserReport,
  listAccountReports,
  getAccountReport,
  listProductReports,
  getProductReport,
  listOrderReports,
  getOrderReport,
  getHrReport,
  listTeamReports,
  listCategoryReports,
  listMarketplaceReports,
  listActivityReports,
  trackReportEvent,
};
