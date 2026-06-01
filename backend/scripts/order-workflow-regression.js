const BASE_URL =
  process.env.API_BASE_URL || 'https://tws-ops-system-backend-staging.up.railway.app/api';
const PASSWORD = process.env.API_AUDIT_PASSWORD || 'Password123!';
const KNOWN_ASIN = process.env.ORDER_REGRESSION_ASIN || 'B0FH4RFYY1';

const USERS = {
  admin: 'admin@example.com',
  processor: 'order@example.com',
};

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
  } catch {
    json = null;
  }

  return {
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

function summarize(body) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
}

function buildOrderId(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

async function main() {
  const checks = [];
  const tokens = {};

  const push = (name, result, extra = {}) => {
    checks.push({
      name,
      ok: result.ok,
      status: result.status,
      details: result.ok ? extra.details || '' : summarize(result.body),
    });
  };

  for (const [role, email] of Object.entries(USERS)) {
    try {
      tokens[role] = await login(email);
      checks.push({ name: `login:${role}`, ok: true, status: 200, details: '' });
    } catch (error) {
      checks.push({ name: `login:${role}`, ok: false, status: 0, details: String(error) });
    }
  }

  const adminToken = tokens.admin;
  const processorToken = tokens.processor;

  if (!adminToken || !processorToken) {
    throw new Error('Admin and processor tokens are required for the regression run.');
  }

  const accountsResult = await request('/accounts?page=1&limit=5', {
    token: adminToken,
    expectedStatuses: [200],
  });
  push('admin:accounts', accountsResult);

  const accountId = accountsResult.body?.accounts?.[0]?.id;
  if (!accountId) {
    throw new Error('Could not find an account for the regression run.');
  }

  const cleanupOrderIds = [];

  const createMinimalOrder = async (token, prefix) => {
    const ebayOrderId = buildOrderId(prefix);
    const result = await request('/orders', {
      method: 'POST',
      token,
      body: {
        ebayOrderId,
        asin: KNOWN_ASIN,
        salePrice: '138.03',
        amazonBuyingPrice: '58.07',
        accountId,
        notes: `${prefix} regression order`,
      },
      expectedStatuses: [201],
    });

    if (result.ok && result.body?.order?.id) {
      cleanupOrderIds.push(result.body.order.id);
    }

    return { ebayOrderId, result, orderId: result.body?.order?.id || null };
  };

  const createFallbackOrder = async (token, prefix) => {
    const ebayOrderId = buildOrderId(`${prefix}-FULL`);
    const result = await request('/orders', {
      method: 'POST',
      token,
      body: {
        ebayOrderId,
        asin: KNOWN_ASIN,
        salePrice: '138.03',
        amazonBuyingPrice: '58.07',
        accountId,
        orderDate: new Date().toISOString().slice(0, 10),
        quantity: 1,
        notes: `${prefix} fallback regression order`,
      },
      expectedStatuses: [201],
    });

    if (result.ok && result.body?.order?.id) {
      cleanupOrderIds.push(result.body.order.id);
    }

    return { ebayOrderId, result, orderId: result.body?.order?.id || null };
  };

  const adminCreate = await createMinimalOrder(adminToken, 'ADMIN-ORDER-REG');
  push('admin:create-minimal-order', adminCreate.result, {
    details: adminCreate.result.ok ? adminCreate.ebayOrderId : '',
  });

  const adminWorkflowSeed =
    adminCreate.orderId ? adminCreate : await createFallbackOrder(adminToken, 'ADMIN-ORDER-REG');

  if (!adminCreate.orderId) {
    push('admin:create-fallback-order-with-date', adminWorkflowSeed.result, {
      details: adminWorkflowSeed.result.ok ? adminWorkflowSeed.ebayOrderId : '',
    });
  }

  if (adminWorkflowSeed.orderId) {
    const duplicate = await request('/orders', {
      method: 'POST',
      token: adminToken,
      body: {
        ebayOrderId: adminWorkflowSeed.ebayOrderId,
        asin: KNOWN_ASIN,
        salePrice: '138.03',
        amazonBuyingPrice: '58.07',
        accountId,
      },
      expectedStatuses: [409],
    });
    push('admin:create-duplicate-order-blocked', duplicate);

    const shipBeforePlaced = await request(`/orders/${adminWorkflowSeed.orderId}/mark-shipped`, {
      method: 'POST',
      token: adminToken,
      body: {
        trackingNumber: 'TRACK-123',
        carrier: 'UPS',
      },
      expectedStatuses: [409],
    });
    push('admin:ship-before-placed-blocked', shipBeforePlaced);

    const deliverBeforeShipped = await request(`/orders/${adminWorkflowSeed.orderId}/mark-delivered`, {
      method: 'POST',
      token: adminToken,
      expectedStatuses: [409],
    });
    push('admin:deliver-before-shipped-blocked', deliverBeforeShipped);

    const issueMissingFields = await request(`/orders/${adminWorkflowSeed.orderId}/mark-issue`, {
      method: 'POST',
      token: adminToken,
      body: {
        issueType: 'OTHER',
      },
      expectedStatuses: [400],
    });
    push('admin:issue-missing-fields-blocked', issueMissingFields);

    const placed = await request(`/orders/${adminWorkflowSeed.orderId}/mark-placed`, {
      method: 'POST',
      token: adminToken,
      body: {
        amazonBuyingPrice: '58.07',
        amazonOrderId: `AMZ-${buildOrderId('ADMIN')}`,
      },
      expectedStatuses: [200],
    });
    push('admin:mark-placed', placed);

    const placedAgain = await request(`/orders/${adminWorkflowSeed.orderId}/mark-placed`, {
      method: 'POST',
      token: adminToken,
      body: {
        amazonBuyingPrice: '58.07',
        amazonOrderId: `AMZ-${buildOrderId('ADMIN-R')}`,
      },
      expectedStatuses: [409],
    });
    push('admin:mark-placed-again-blocked', placedAgain);

    const deliverBeforeRealShipped = await request(`/orders/${adminWorkflowSeed.orderId}/mark-delivered`, {
      method: 'POST',
      token: adminToken,
      expectedStatuses: [409],
    });
    push('admin:deliver-before-real-shipped-blocked', deliverBeforeRealShipped);

    const shipped = await request(`/orders/${adminWorkflowSeed.orderId}/mark-shipped`, {
      method: 'POST',
      token: adminToken,
      body: {
        trackingNumber: `TRACK-${buildOrderId('ADMIN')}`,
        carrier: 'UPS',
      },
      expectedStatuses: [200],
    });
    push('admin:mark-shipped', shipped);

    const shippedAgain = await request(`/orders/${adminWorkflowSeed.orderId}/mark-shipped`, {
      method: 'POST',
      token: adminToken,
      body: {
        trackingNumber: `TRACK-${buildOrderId('ADMIN-RETRY')}`,
        carrier: 'UPS',
      },
      expectedStatuses: [409],
    });
    push('admin:mark-shipped-again-blocked', shippedAgain);

    const delivered = await request(`/orders/${adminWorkflowSeed.orderId}/mark-delivered`, {
      method: 'POST',
      token: adminToken,
      expectedStatuses: [200],
    });
    push('admin:mark-delivered', delivered);

    const deliveredAgain = await request(`/orders/${adminWorkflowSeed.orderId}/mark-delivered`, {
      method: 'POST',
      token: adminToken,
      expectedStatuses: [409],
    });
    push('admin:mark-delivered-again-blocked', deliveredAgain);
  }

  const processorCreate = await createMinimalOrder(processorToken, 'PROC-ORDER-REG');
  push('processor:create-minimal-order', processorCreate.result, {
    details: processorCreate.result.ok ? processorCreate.ebayOrderId : '',
  });

  const processorWorkflowSeed =
    processorCreate.orderId
      ? processorCreate
      : await createFallbackOrder(processorToken, 'PROC-ORDER-REG');

  if (!processorCreate.orderId) {
    push('processor:create-fallback-order-with-date', processorWorkflowSeed.result, {
      details: processorWorkflowSeed.result.ok ? processorWorkflowSeed.ebayOrderId : '',
    });
  }

  if (processorWorkflowSeed.orderId) {
    const processorOrderDetail = await request(`/orders/${processorWorkflowSeed.orderId}`, {
      token: processorToken,
      expectedStatuses: [200],
    });
    push('processor:created-order-visible', processorOrderDetail);

    const processorPlaced = await request(`/orders/${processorWorkflowSeed.orderId}/mark-placed`, {
      method: 'POST',
      token: processorToken,
      body: {
        amazonBuyingPrice: '58.07',
        amazonOrderId: `AMZ-${buildOrderId('PROC')}`,
      },
      expectedStatuses: [200],
    });
    push('processor:mark-placed', processorPlaced);
  }

  for (const orderId of cleanupOrderIds) {
    const cleanup = await request(`/orders/${orderId}`, {
      method: 'DELETE',
      token: adminToken,
      body: { reason: 'Order workflow regression cleanup.' },
      expectedStatuses: [200],
    });
    push(`cleanup:${orderId}`, cleanup);
  }

  const failures = checks.filter((entry) => !entry.ok);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Checks run: ${checks.length}`);
  console.log(`Failures: ${failures.length}`);
  console.log('');

  for (const entry of checks) {
    console.log(`${entry.ok ? 'OK ' : 'BAD'} ${entry.name} -> ${entry.status}`);
    if (entry.details) {
      console.log(`     ${entry.details}`);
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
