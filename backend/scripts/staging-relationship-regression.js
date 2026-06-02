const BASE_URL =
  process.env.API_BASE_URL || 'https://tws-ops-system-backend-staging.up.railway.app/api';
const PASSWORD = process.env.API_AUDIT_PASSWORD || 'Password123!';

const USERS = {
  admin: 'admin@example.com',
  hunter: 'hunter@example.com',
  lister: 'lister@example.com',
  sunny: 'sunny@gmail.com',
  processor: 'order@example.com',
  processorLocal: 'order.processor.local@example.com',
};

const TARGETS = {
  hunterListerListedAsin: process.env.REGRESSION_LISTED_ASIN || 'B0FH4RFYY1',
  hunterSunnyAssignedAsin: process.env.REGRESSION_ASSIGNED_ASIN || 'B0DZVFL29R',
};

function buildOrderId(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

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

function getArray(body, key) {
  return body?.[key] || body?.items || [];
}

async function main() {
  const checks = [];
  const tokens = {};

  const push = (name, ok, details = {}) => {
    checks.push({ name, ok, ...details });
  };

  for (const [label, email] of Object.entries(USERS)) {
    try {
      tokens[label] = await login(email);
      push(`login:${label}`, true, { status: 200 });
    } catch (error) {
      push(`login:${label}`, false, { status: 0, details: String(error) });
    }
  }

  const adminToken = tokens.admin;
  const hunterToken = tokens.hunter;
  const listerToken = tokens.lister;
  const sunnyToken = tokens.sunny;
  const processorLocalToken = tokens.processorLocal;
  const processorToken = tokens.processor;
  const cleanupOrderIds = [];

  if (!adminToken || !hunterToken || !listerToken || !sunnyToken || !processorLocalToken || !processorToken) {
    throw new Error('Missing one or more required auth tokens for the regression run.');
  }

  const adminProductsResult = await request('/products?page=1&limit=100&hunterName=Hunter%20User', {
    token: adminToken,
  });
  push('admin:products:hunter-user', adminProductsResult.ok, {
    status: adminProductsResult.status,
    details: adminProductsResult.ok ? undefined : summarize(adminProductsResult.body),
  });

  const products = getArray(adminProductsResult.body, 'products');
  const listedProduct = products.find(
    (product) =>
      product.asin === TARGETS.hunterListerListedAsin
      && product.hunterName === 'Hunter User'
      && product.assignedListerName === 'Lister User',
  );
  const sunnyAssignedProduct = products.find(
    (product) =>
      product.asin === TARGETS.hunterSunnyAssignedAsin
      && product.hunterName === 'Hunter User'
      && product.assignedListerName === 'Sunny Lister',
  );

  push('fixture:listed-product-found', Boolean(listedProduct), {
    details: listedProduct ? listedProduct.id : 'Could not find listed Hunter User -> Lister User product.',
  });
  push('fixture:sunny-assigned-product-found', Boolean(sunnyAssignedProduct), {
    details: sunnyAssignedProduct ? sunnyAssignedProduct.id : 'Could not find assigned Hunter User -> Sunny Lister product.',
  });

  const accountsResult = await request('/accounts?page=1&limit=5', { token: adminToken });
  push('admin:accounts:list', accountsResult.ok, {
    status: accountsResult.status,
    details: accountsResult.ok ? undefined : summarize(accountsResult.body),
  });

  const regressionAccountId = accountsResult.body?.accounts?.[0]?.id || listedProduct?.accountId || null;
  push('fixture:regression-account-found', Boolean(regressionAccountId), {
    details: regressionAccountId || 'Could not find an account for linked order regression.',
  });

  let linkedOrder = null;

  if (regressionAccountId) {
    const createLinkedOrderResult = await request('/orders', {
      method: 'POST',
      token: processorLocalToken,
      body: {
        ebayOrderId: buildOrderId('REL-LINK'),
        asin: TARGETS.hunterListerListedAsin,
        salePrice: '138.03',
        amazonBuyingPrice: '58.07',
        amazonOrderId: `AMZ-${buildOrderId('REL-LINK')}`,
        accountId: regressionAccountId,
        notes: 'Relationship regression linked order.',
      },
      expectedStatuses: [201],
    });
    push('processor-local:create-linked-order', createLinkedOrderResult.ok, {
      status: createLinkedOrderResult.status,
      details: createLinkedOrderResult.ok ? undefined : summarize(createLinkedOrderResult.body),
    });

    linkedOrder = createLinkedOrderResult.body?.order || null;
    if (linkedOrder?.id) {
      cleanupOrderIds.push(linkedOrder.id);
    }
  }

  push('fixture:processor-linked-order-found', Boolean(linkedOrder), {
    details: linkedOrder ? linkedOrder.id : 'Could not create a linked processor order for Hunter User.',
  });

  if (linkedOrder) {
    push(
      'processor-linked-order:relation-shape',
      linkedOrder.listerName === 'Lister User' && linkedOrder.matchStatus === 'matched',
      {
        details: JSON.stringify({
          hunterName: linkedOrder.hunterName,
          listerName: linkedOrder.listerName,
          matchStatus: linkedOrder.matchStatus,
          orderStatus: linkedOrder.orderStatus,
          issueType: linkedOrder.issueType,
          issueStatus: linkedOrder.issueStatus,
        }),
      },
    );

    const orderAccessChecks = [
      ['admin', adminToken],
      ['hunter', hunterToken],
      ['lister', listerToken],
      ['processor-local', processorLocalToken],
    ];

    for (const [label, token] of orderAccessChecks) {
      const result = await request(`/orders/${linkedOrder.id}`, { token });
      push(`${label}:order-detail:${linkedOrder.id}`, result.ok, {
        status: result.status,
        details: result.ok
          ? JSON.stringify({
              hunterName: result.body?.order?.hunterName || result.body?.hunterName,
              listerName: result.body?.order?.listerName || result.body?.listerName,
              asin: result.body?.order?.asin || result.body?.asin,
              orderStatus: result.body?.order?.orderStatus || result.body?.orderStatus,
            })
          : summarize(result.body),
      });
    }
  }

  const processorPermissions = await request('/users?page=1&limit=1', {
    token: processorToken,
    expectedStatuses: [403],
  });
  push('processor:users-forbidden', processorPermissions.ok, {
    status: processorPermissions.status,
    details: summarize(processorPermissions.body),
  });

  const hunterSystemAccess = await request('/system/settings', {
    token: hunterToken,
    expectedStatuses: [403],
  });
  push('hunter:system-settings-forbidden', hunterSystemAccess.ok, {
    status: hunterSystemAccess.status,
    details: summarize(hunterSystemAccess.body),
  });

  const sunnyBlockBefore = await request('/lister/change-request-block-status', { token: sunnyToken });
  const sunnyBeforeOpen = sunnyBlockBefore.body?.openRequests ?? null;
  push('sunny:block-status:before', sunnyBlockBefore.ok, {
    status: sunnyBlockBefore.status,
    details: summarize(sunnyBlockBefore.body),
  });

  let createdRequestId = null;

  if (sunnyAssignedProduct) {
    const requestedChanges = `Regression request ${new Date().toISOString()} - verify hunter to sunny lister workflow.`;
    const createRequestResult = await request('/change-requests', {
      method: 'POST',
      token: hunterToken,
      body: {
        asin: sunnyAssignedProduct.asin,
        requestedChanges,
      },
      expectedStatuses: [201],
    });
    push('hunter:create-change-request:for-sunny', createRequestResult.ok, {
      status: createRequestResult.status,
      details: createRequestResult.ok ? undefined : summarize(createRequestResult.body),
    });

    createdRequestId = createRequestResult.body?.changeRequest?.id || createRequestResult.body?.id || null;
    push('hunter:create-change-request:id', Boolean(createdRequestId), {
      details: createdRequestId || 'API response did not include a request id.',
    });

    if (createdRequestId) {
      for (const [label, token] of [
        ['hunter', hunterToken],
        ['sunny', sunnyToken],
        ['admin', adminToken],
      ]) {
        const result = await request(`/change-requests/${createdRequestId}`, { token });
        push(`${label}:change-request-detail:${createdRequestId}`, result.ok, {
          status: result.status,
          details: result.ok
            ? JSON.stringify({
                status: result.body?.changeRequest?.status || result.body?.status,
                asin: result.body?.changeRequest?.asin || result.body?.asin,
                listerName: result.body?.changeRequest?.listerName || result.body?.listerName,
              })
            : summarize(result.body),
        });
      }

      const sunnyBlockDuring = await request('/lister/change-request-block-status', { token: sunnyToken });
      push(
        'sunny:block-status:during',
        sunnyBlockDuring.ok
          && sunnyBlockDuring.body?.blocked === true
          && Number(sunnyBlockDuring.body?.openRequests || 0) >= Number(sunnyBeforeOpen || 0) + 1,
        {
          status: sunnyBlockDuring.status,
          details: summarize(sunnyBlockDuring.body),
        },
      );

      const rejectBlocked = await request(`/products/${sunnyAssignedProduct.id}/reject`, {
        method: 'PATCH',
        token: sunnyToken,
        body: { rejectionReason: 'Regression blocker probe.' },
        expectedStatuses: [409],
      });
      push('sunny:product-reject-blocked-while-change-request-open', rejectBlocked.ok, {
        status: rejectBlocked.status,
        details: summarize(rejectBlocked.body),
      });

      const startRequest = await request(`/change-requests/${createdRequestId}/start`, {
        method: 'PATCH',
        token: sunnyToken,
        expectedStatuses: [200],
      });
      const startedStatus = startRequest.body?.changeRequest?.status || startRequest.body?.status;
      push('sunny:start-change-request', startRequest.ok && startedStatus === 'IN_PROGRESS', {
        status: startRequest.status,
        details: summarize(startRequest.body),
      });

      const fixRequest = await request(`/change-requests/${createdRequestId}/fix`, {
        method: 'PATCH',
        token: sunnyToken,
        body: { notes: 'Regression fix completed by Sunny.' },
        expectedStatuses: [200],
      });
      const fixedStatus = fixRequest.body?.changeRequest?.status || fixRequest.body?.status;
      push('sunny:fix-change-request', fixRequest.ok && fixedStatus === 'FIXED', {
        status: fixRequest.status,
        details: summarize(fixRequest.body),
      });

      const sunnyBlockAfter = await request('/lister/change-request-block-status', { token: sunnyToken });
      push(
        'sunny:block-status:after',
        sunnyBlockAfter.ok && sunnyBlockAfter.body?.blocked === false && Number(sunnyBlockAfter.body?.openRequests || 0) === Number(sunnyBeforeOpen || 0),
        {
          status: sunnyBlockAfter.status,
          details: summarize(sunnyBlockAfter.body),
        },
      );

      const hunterSeesFixed = await request(`/change-requests/${createdRequestId}`, { token: hunterToken });
      const hunterFixedStatus = hunterSeesFixed.body?.changeRequest?.status || hunterSeesFixed.body?.status;
      push('hunter:sees-fixed-change-request', hunterSeesFixed.ok && hunterFixedStatus === 'FIXED', {
        status: hunterSeesFixed.status,
        details: summarize(hunterSeesFixed.body),
      });

      await request(`/change-requests/${createdRequestId}/close`, {
        method: 'POST',
        token: adminToken,
        body: { notes: 'Regression cleanup close.' },
        expectedStatuses: [200],
      });
    }
  }

  for (const orderId of cleanupOrderIds) {
    const cleanup = await request(`/orders/${orderId}`, {
      method: 'DELETE',
      token: adminToken,
      body: { reason: 'Relationship regression cleanup.' },
      expectedStatuses: [200],
    });
    push(`cleanup:${orderId}`, cleanup.ok, {
      status: cleanup.status,
      details: cleanup.ok ? undefined : summarize(cleanup.body),
    });
  }

  const failures = checks.filter((entry) => !entry.ok);

  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Checks run: ${checks.length}`);
  console.log(`Failures: ${failures.length}`);
  console.log('');

  for (const entry of checks) {
    console.log(`${entry.ok ? 'OK ' : 'BAD'} ${entry.name}${entry.status ? ` -> ${entry.status}` : ''}`);
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
