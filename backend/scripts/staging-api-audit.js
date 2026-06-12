const BASE_URL = process.env.API_BASE_URL || 'https://tws-ops-system-backend-staging.up.railway.app/api';
const PASSWORD = process.env.API_AUDIT_PASSWORD || 'Password123!';

const USERS = {
  superadmin: 'superadmin@example.com',
  admin: 'admin@example.com',
  hunter: 'hunter@example.com',
  lister: 'lister@example.com',
};

const KNOWN_ASIN = process.env.API_AUDIT_ASIN || 'B0FH4RFYY1';
const RANGE = {
  from: process.env.API_AUDIT_FROM || '2026-05-01',
  to: process.env.API_AUDIT_TO || '2026-05-31',
};
const RUN_MUTATION_SMOKE = process.env.API_AUDIT_MUTATIONS !== 'false';

async function request(path, { method = 'GET', token, body, expectedStatuses = [200] } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = null;
  }

  return {
    path,
    method,
    ok: expectedStatuses.includes(response.status),
    status: response.status,
    body: json || text,
  };
}

async function login(email) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
    expectedStatuses: [200],
  });

  if (!result.ok || !result.body?.token) {
    throw new Error(`Login failed for ${email}: ${result.status} ${JSON.stringify(result.body)}`);
  }

  return result.body.token;
}

const timestampSlug = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

function snippet(body) {
  if (body === null || body === undefined) {
    return '';
  }

  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
}

async function main() {
  const report = [];

  report.push(await request('/health', { expectedStatuses: [200] }));

  const tokens = {};
  for (const [role, email] of Object.entries(USERS)) {
    try {
      tokens[role] = await login(email);
      report.push({ role, method: 'POST', path: '/auth/login', ok: true, status: 200, body: 'ok' });
    } catch (error) {
      report.push({ role, method: 'POST', path: '/auth/login', ok: false, status: 0, body: String(error) });
    }
  }

  const adminToken = tokens.admin;
  const hunterToken = tokens.hunter;
  const listerToken = tokens.lister;
  const superAdminToken = tokens.superadmin;

  const adminProducts = adminToken
    ? await request(`/products?page=1&limit=5&from=${RANGE.from}&to=${RANGE.to}&category=Electronics`, {
        token: adminToken,
      })
    : null;
  if (adminProducts) report.push({ role: 'admin', ...adminProducts });

  const adminOrders = adminToken
    ? await request(`/orders?page=1&limit=5&from=${RANGE.from}&to=${RANGE.to}&category=Electronics`, {
        token: adminToken,
      })
    : null;
  if (adminOrders) report.push({ role: 'admin', ...adminOrders });

  const adminIssues = adminToken
    ? await request(`/order-issues?page=1&limit=5`, { token: adminToken })
    : null;
  if (adminIssues) report.push({ role: 'admin', ...adminIssues });

  const adminRequests = adminToken
    ? await request(`/change-requests?page=1&limit=5`, { token: adminToken })
    : null;
  if (adminRequests) report.push({ role: 'admin', ...adminRequests });
  const hunterRequests = hunterToken
    ? await request(`/change-requests?page=1&limit=5`, { token: hunterToken })
    : null;
  const listerRequests = listerToken
    ? await request(`/change-requests?page=1&limit=5`, { token: listerToken })
    : null;
  const adminAccounts = adminToken
    ? await request('/accounts?page=1&limit=5', { token: adminToken })
    : null;
  if (adminAccounts) report.push({ role: 'admin', ...adminAccounts });

  const sampleProductId = adminProducts?.body?.products?.[0]?.id || adminProducts?.body?.items?.[0]?.id;
  const sampleOrderId = adminOrders?.body?.orders?.[0]?.id || adminOrders?.body?.items?.[0]?.id;
  const sampleIssueId = adminIssues?.body?.orderIssues?.[0]?.id || adminIssues?.body?.items?.[0]?.id;
  const sampleAdminRequestId = adminRequests?.body?.changeRequests?.[0]?.id || adminRequests?.body?.items?.[0]?.id;
  const sampleHunterRequestId = hunterRequests?.body?.changeRequests?.[0]?.id || hunterRequests?.body?.items?.[0]?.id;
  const sampleListerRequestId = listerRequests?.body?.changeRequests?.[0]?.id || listerRequests?.body?.items?.[0]?.id;
  const sampleAccountId = adminAccounts?.body?.accounts?.[0]?.id
    || adminProducts?.body?.products?.find((product) => product.accountId)?.accountId
    || adminOrders?.body?.orders?.find((order) => order.accountId)?.accountId
    || null;

  const checks = [
    { role: 'admin', token: adminToken, path: '/auth/me' },
    { role: 'superadmin', token: superAdminToken, path: '/auth/me' },
    { role: 'hunter', token: hunterToken, path: '/auth/me' },
    { role: 'lister', token: listerToken, path: '/auth/me' },

    { role: 'admin', token: adminToken, path: `/dashboard/admin?from=${RANGE.from}&to=${RANGE.to}&category=Electronics` },
    { role: 'hunter', token: hunterToken, path: `/dashboard/hunter?from=${RANGE.from}&to=${RANGE.to}&category=Electronics` },
    { role: 'lister', token: listerToken, path: `/dashboard/lister?from=${RANGE.from}&to=${RANGE.to}` },
    { role: 'lister', token: listerToken, path: '/dashboard/lister-account-usage' },
    { role: 'superadmin', token: superAdminToken, path: `/dashboard/super-admin?from=${RANGE.from}&to=${RANGE.to}&category=Electronics` },
    { role: 'hunter', token: hunterToken, path: '/hr/me' },
    { role: 'lister', token: listerToken, path: '/hr/me' },
    { role: 'admin', token: adminToken, path: '/hr/me', expectedStatuses: [200, 404] },
    { role: 'superadmin', token: superAdminToken, path: '/hr/me', expectedStatuses: [200, 404] },
    { role: 'admin', token: adminToken, path: `/reports/summary?dateFrom=${RANGE.from}&dateTo=${RANGE.to}` },
    { role: 'superadmin', token: superAdminToken, path: `/reports/summary?dateFrom=${RANGE.from}&dateTo=${RANGE.to}` },
    { role: 'admin', token: adminToken, path: `/reports/executive?dateFrom=${RANGE.from}&dateTo=${RANGE.to}` },
    { role: 'superadmin', token: superAdminToken, path: `/reports/executive?dateFrom=${RANGE.from}&dateTo=${RANGE.to}` },

    { role: 'hunter', token: hunterToken, path: `/products?page=1&limit=5&from=${RANGE.from}&to=${RANGE.to}&category=Electronics` },
    { role: 'lister', token: listerToken, path: `/products?page=1&limit=5&status=assigned&category=Electronics` },
    { role: 'admin', token: adminToken, path: '/products?page=1&limit=5&status=listed_needs_review' },
    { role: 'superadmin', token: superAdminToken, path: '/products?page=1&limit=5&status=listed_needs_review' },
    { role: 'admin', token: adminToken, path: '/products/check-asin?asin=' + KNOWN_ASIN },
    { role: 'hunter', token: hunterToken, path: '/products/check-asin?asin=' + KNOWN_ASIN },
    { role: 'lister', token: listerToken, path: '/products/assigned-hunters' },
    { role: 'admin', token: adminToken, path: '/products/assigned-hunters' },

    { role: 'admin', token: adminToken, path: '/users?page=1&limit=5' },
    { role: 'admin', token: adminToken, path: '/users/assignments?page=1&limit=5' },
    { role: 'admin', token: adminToken, path: '/users/audit?page=1&limit=5' },
    { role: 'superadmin', token: superAdminToken, path: '/users/permissions/matrix' },

    { role: 'admin', token: adminToken, path: '/accounts?page=1&limit=5' },
    { role: 'lister', token: listerToken, path: '/accounts?page=1&limit=5' },
    { role: 'admin', token: adminToken, path: '/criteria' },
    { role: 'hunter', token: hunterToken, path: '/criteria' },
    { role: 'superadmin', token: superAdminToken, path: '/system/settings' },
    { role: 'hunter', token: hunterToken, path: '/weekly-review/status' },
    { role: 'admin', token: adminToken, path: '/weekly-review/status' },

    { role: 'hunter', token: hunterToken, path: '/change-requests?page=1&limit=5' },
    { role: 'lister', token: listerToken, path: '/change-requests?page=1&limit=5' },
    { role: 'admin', token: adminToken, path: '/change-requests?page=1&limit=5' },
    { role: 'lister', token: listerToken, path: '/change-requests/summary' },
    { role: 'hunter', token: hunterToken, path: '/change-requests/summary' },
    { role: 'admin', token: adminToken, path: '/change-requests/summary' },
    { role: 'lister', token: listerToken, path: '/lister/change-request-block-status' },
    { role: 'admin', token: adminToken, path: '/lister/change-request-block-status' },

    { role: 'admin', token: adminToken, path: '/teams' },
    { role: 'hunter', token: hunterToken, path: '/teams' },
    { role: 'admin', token: adminToken, path: '/product-categories' },
    { role: 'hunter', token: hunterToken, path: '/product-categories' },

    { role: 'hunter', token: hunterToken, path: `/orders?page=1&limit=5&from=${RANGE.from}&to=${RANGE.to}` },
    { role: 'lister', token: listerToken, path: `/orders?page=1&limit=5&from=${RANGE.from}&to=${RANGE.to}` },
    { role: 'admin', token: adminToken, path: `/orders?page=1&limit=5&search=%25` },
    { role: 'admin', token: adminToken, path: `/orders?page=1&limit=5&search=%27` },
    { role: 'admin', token: adminToken, path: `/orders/stats?from=${RANGE.from}&to=${RANGE.to}` },
    { role: 'hunter', token: hunterToken, path: `/orders/stats?from=${RANGE.from}&to=${RANGE.to}` },
    { role: 'lister', token: listerToken, path: `/orders/stats?from=${RANGE.from}&to=${RANGE.to}` },
    { role: 'admin', token: adminToken, path: `/orders/reports?from=${RANGE.from}&to=${RANGE.to}&category=Electronics` },
    { role: 'superadmin', token: superAdminToken, path: `/orders/reports?from=${RANGE.from}&to=${RANGE.to}&category=Electronics` },
    { role: 'admin', token: adminToken, path: '/orders/export?page=1&limit=5' },
    { role: 'admin', token: adminToken, path: `/orders/match-by-asin?asin=${KNOWN_ASIN}&limit=3` },
    { role: 'admin', token: adminToken, path: `/orders/match-product?asin=${KNOWN_ASIN}&limit=3` },

    { role: 'hunter', token: hunterToken, path: '/order-issues?page=1&limit=5' },
    { role: 'lister', token: listerToken, path: '/order-issues?page=1&limit=5' },
    { role: 'admin', token: adminToken, path: '/order-issues?page=1&limit=5' },
  ];

  if (sampleProductId) {
    checks.push(
      { role: 'hunter', token: hunterToken, path: `/products/${sampleProductId}` },
      { role: 'admin', token: adminToken, path: `/products/${sampleProductId}` },
    );
  }
  if (sampleOrderId) {
    checks.push(
      { role: 'hunter', token: hunterToken, path: `/orders/${sampleOrderId}` },
      { role: 'lister', token: listerToken, path: `/orders/${sampleOrderId}` },
      { role: 'admin', token: adminToken, path: `/orders/${sampleOrderId}` },
    );
  }
  if (sampleIssueId) {
    checks.push(
      { role: 'hunter', token: hunterToken, path: `/order-issues/${sampleIssueId}`, expectedStatuses: [200, 404] },
      { role: 'admin', token: adminToken, path: `/order-issues/${sampleIssueId}` },
    );
  }
  if (sampleHunterRequestId) {
    checks.push({ role: 'hunter', token: hunterToken, path: `/change-requests/${sampleHunterRequestId}` });
  }
  if (sampleListerRequestId) {
    checks.push({ role: 'lister', token: listerToken, path: `/change-requests/${sampleListerRequestId}` });
  }
  if (sampleAdminRequestId) {
    checks.push({ role: 'admin', token: adminToken, path: `/change-requests/${sampleAdminRequestId}` });
  }

  for (const check of checks) {
    if (!check.token) {
      report.push({ ...check, ok: false, status: 0, body: 'no token available' });
      continue;
    }
    try {
      const result = await request(check.path, {
        token: check.token,
        expectedStatuses: check.expectedStatuses || [200],
      });
      report.push({ role: check.role, ...result });
    } catch (error) {
      report.push({ role: check.role, path: check.path, method: 'GET', ok: false, status: 0, body: String(error) });
    }
  }

  if (RUN_MUTATION_SMOKE && adminToken) {
    const runId = timestampSlug();
    const tempCategoryName = `API Audit ${runId}`;
    const tempOrderId = `ORDER-AUDIT-${runId}`;
    let createdCategoryId = null;
    let createdOrderId = null;

    const pushMutation = async (role, path, options) => {
      try {
        const result = await request(path, options);
        report.push({ role, ...result });
        return result;
      } catch (error) {
        report.push({
          role,
          path,
          method: options?.method || 'GET',
          ok: false,
          status: 0,
          body: String(error),
        });
        return null;
      }
    };

    const createCategoryResult = await pushMutation('admin', '/product-categories', {
      method: 'POST',
      token: adminToken,
      body: { name: tempCategoryName, active: true },
      expectedStatuses: [201],
    });
    createdCategoryId = createCategoryResult?.body?.categories?.find(
      (entry) => entry.name === tempCategoryName,
    )?.id || null;

    if (createdCategoryId) {
      await pushMutation('admin', `/product-categories/${createdCategoryId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { name: `${tempCategoryName} Updated`, active: false },
        expectedStatuses: [200],
      });
    }

    if (sampleAccountId) {
      const createOrderResult = await pushMutation('admin', '/orders', {
        method: 'POST',
        token: adminToken,
        body: {
          ebayOrderId: tempOrderId,
          accountId: sampleAccountId,
          asin: KNOWN_ASIN,
          amazonOrderId: `AMZ-AUDIT-${runId}`,
          productTitle: `API Audit Order ${runId}`,
          orderDate: RANGE.to,
          quantity: 1,
          salePrice: '29.99',
          amazonBuyingPrice: '18.50',
          notes: 'Temporary staging API audit order.',
        },
        expectedStatuses: [201],
      });
      createdOrderId = createOrderResult?.body?.order?.id || null;

      if (createdOrderId) {
        await pushMutation('admin', `/orders/${createdOrderId}`, {
          method: 'PATCH',
          token: adminToken,
          body: {
            notes: 'Temporary staging API audit order updated.',
            amazonBuyingPrice: '18.75',
          },
          expectedStatuses: [200],
        });

        await pushMutation('admin', `/orders/${createdOrderId}/status`, {
          method: 'PATCH',
          token: adminToken,
          body: {
            orderStatus: 'PLACED',
            amazonBuyingPrice: '18.75',
            amazonOrderId: `AMZ-${runId}`,
          },
          expectedStatuses: [200],
        });

        await pushMutation('admin', `/orders/${createdOrderId}/mark-issue`, {
          method: 'POST',
          token: adminToken,
          body: {
            issueType: 'OTHER',
            issueReason: 'Temporary staging API audit issue.',
            orderImpact: 'Other',
          },
          expectedStatuses: [200],
        });

        await pushMutation('admin', `/order-issues/${createdOrderId}`, {
          method: 'PATCH',
          token: adminToken,
          body: {
            issueStatus: 'IN_REVIEW',
            notes: 'Issue moved to review by audit script.',
          },
          expectedStatuses: [200],
        });

        await pushMutation('admin', `/order-issues/${createdOrderId}/close`, {
          method: 'POST',
          token: adminToken,
          body: {
            notes: 'Issue closed by staging API audit script.',
          },
          expectedStatuses: [200],
        });

        await pushMutation('admin', `/orders/${createdOrderId}`, {
          method: 'DELETE',
          token: adminToken,
          body: {
            reason: 'Temporary staging API audit cleanup.',
          },
          expectedStatuses: [200],
        });
      }
    }

    if (createdCategoryId) {
      await pushMutation('admin', `/product-categories/${createdCategoryId}`, {
        method: 'DELETE',
        token: adminToken,
        expectedStatuses: [200],
      });
    }
  }

  const failures = report.filter((entry) => !entry.ok || entry.status >= 500 || entry.status === 0);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Checks run: ${report.length}`);
  console.log(`Failures: ${failures.length}`);
  console.log('');

  for (const entry of report) {
    const tag = entry.ok ? 'OK ' : 'BAD';
    const role = entry.role ? `[${entry.role}]` : '[public]';
    console.log(`${tag} ${role} ${entry.method || 'GET '} ${entry.path} -> ${entry.status}`);
    if (!entry.ok || entry.status >= 500 || entry.status === 0) {
      console.log(`     ${snippet(entry.body)}`);
    }
  }

  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
