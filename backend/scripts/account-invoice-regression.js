const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const PASSWORD = process.env.API_AUDIT_PASSWORD || 'Password123!';
const RUN_CREATE_FLOW = process.env.ACCOUNT_INVOICE_REGRESSION_CREATE === 'true';

const USERS = {
  admin: 'admin@example.com',
  superadmin: 'superadmin@example.com',
  hunter: 'hunter@example.com',
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
  return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
}

function buildInvoicePayload(accountName) {
  return {
    billToName: accountName,
    invoiceMonth: new Date().toISOString().slice(0, 7),
    invoiceDate: new Date().toISOString().slice(0, 10),
    currency: 'USD',
    lineItems: [
      {
        title: 'Total Profit',
        description: 'Regression validation amount.',
        amount: 275.5,
        includeInTotal: false,
      },
      {
        title: 'Company Profit',
        description: 'Included in payable total.',
        amount: 135,
        includeInTotal: true,
      },
      {
        title: 'Tracking Fees',
        description: 'Included in payable total.',
        amount: 18.75,
        includeInTotal: true,
      },
    ],
    primaryPayment: {
      title: 'Primary Account',
      bankName: 'Trend Wave Solutions | Bank Alfalah (BAF)',
      accountNumber: '00081010150545',
      iban: 'PK54ALFH0008001010150545',
      branch: 'S. Town Branch',
    },
    alternatePayment: {
      title: 'Alternate Account',
      bankName: 'M Adil Ghaffar | Meezan Bank Limited (MBL)',
      accountNumber: '03120102615756',
      iban: 'PK50MEZN0003120102615756',
      branch: 'I-8 Branch',
    },
    notes: 'Regression invoice validation payload.',
  };
}

async function main() {
  const checks = [];
  const tokens = {};

  const push = (name, result, details = '') => {
    checks.push({
      name,
      ok: result.ok,
      status: result.status,
      details: result.ok ? details : summarize(result.body),
    });
  };

  const pushManual = (name, ok, details = '', status = ok ? 200 : 0) => {
    checks.push({ name, ok, status, details });
  };

  for (const [role, email] of Object.entries(USERS)) {
    try {
      tokens[role] = await login(email);
      pushManual(`login:${role}`, true);
    } catch (error) {
      pushManual(`login:${role}`, false, String(error));
    }
  }

  const adminToken = tokens.admin;
  const superAdminToken = tokens.superadmin;
  const hunterToken = tokens.hunter;

  const requiredRoles = [
    ['admin', adminToken],
    ['superadmin', superAdminToken],
    ['hunter', hunterToken],
  ].filter(([, token]) => !token);

  if (requiredRoles.length) {
    pushManual(
      'setup:required-test-users-available',
      false,
      `Missing tokens for: ${requiredRoles.map(([role]) => role).join(', ')}`,
    );

    const failures = checks.filter((entry) => !entry.ok);
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Checks run: ${checks.length}`);
    console.log(`Failures: ${failures.length}`);
    console.log('');

    for (const entry of checks) {
      const label = entry.ok ? 'OK ' : 'BAD';
      console.log(`${label} ${entry.name} -> ${entry.status}`);
      if (entry.details) {
        console.log(`     ${entry.details}`);
      }
    }

    process.exitCode = 1;
    return;
  }

  const accounts = await request('/accounts?page=1&limit=5', {
    token: adminToken,
    expectedStatuses: [200],
  });
  push('admin:list-accounts', accounts);

  const account = accounts.body?.accounts?.[0];
  if (!account?.id) {
    throw new Error('Could not find an account to run the invoice regression against.');
  }

  const adminSummary = await request(`/accounts/${account.id}/summary`, {
    token: adminToken,
    expectedStatuses: [200],
  });
  push('admin:account-summary', adminSummary);

  const superAdminSummary = await request(`/accounts/${account.id}/summary`, {
    token: superAdminToken,
    expectedStatuses: [200],
  });
  push('superadmin:account-summary', superAdminSummary);

  const hunterSummaryBlocked = await request(`/accounts/${account.id}/summary`, {
    token: hunterToken,
    expectedStatuses: [403],
  });
  push('hunter:account-summary-forbidden', hunterSummaryBlocked);

  if (adminSummary.ok) {
    const stats = adminSummary.body?.stats || {};
    const invoices = adminSummary.body?.invoices || [];

    pushManual(
      'admin:summary-has-stats-shape',
      typeof stats.totalListed === 'number'
        && typeof stats.totalOrders === 'number'
        && typeof stats.totalProfit === 'number'
        && typeof stats.openChangeRequests === 'number',
      JSON.stringify({
        totalListed: stats.totalListed,
        totalOrders: stats.totalOrders,
        totalProfit: stats.totalProfit,
        openChangeRequests: stats.openChangeRequests,
      }),
    );

    pushManual(
      'admin:summary-has-invoice-list',
      Array.isArray(invoices),
      `invoiceCount=${Array.isArray(invoices) ? invoices.length : 'invalid'}`,
    );
  }

  const hunterInvoiceBlocked = await request(`/accounts/${account.id}/invoices`, {
    method: 'POST',
    token: hunterToken,
    body: buildInvoicePayload(account.name),
    expectedStatuses: [403],
  });
  push('hunter:create-invoice-forbidden', hunterInvoiceBlocked);

  if (!RUN_CREATE_FLOW) {
    pushManual(
      'admin:create-invoice-skipped',
      true,
      'Skipped by default. Set ACCOUNT_INVOICE_REGRESSION_CREATE=true to validate invoice creation.',
      204,
    );
  } else {
    const payload = buildInvoicePayload(account.name);
    const createInvoice = await request(`/accounts/${account.id}/invoices`, {
      method: 'POST',
      token: adminToken,
      body: payload,
      expectedStatuses: [201],
    });
    push('admin:create-invoice', createInvoice);

    if (createInvoice.ok) {
      const invoice = createInvoice.body?.invoice;
      const expectedTotal = 153.75;
      pushManual(
        'admin:created-invoice-total-correct',
        Number(invoice?.totalNetPayable) === expectedTotal,
        `expected=${expectedTotal}; actual=${invoice?.totalNetPayable}`,
      );

      pushManual(
        'admin:created-invoice-payment-fields-reflected',
        invoice?.primaryPayment?.bankName === payload.primaryPayment.bankName
          && invoice?.alternatePayment?.bankName === payload.alternatePayment.bankName,
        JSON.stringify({
          primary: invoice?.primaryPayment?.bankName,
          alternate: invoice?.alternatePayment?.bankName,
        }),
      );

      const refreshedSummary = await request(`/accounts/${account.id}/summary`, {
        token: adminToken,
        expectedStatuses: [200],
      });
      push('admin:summary-after-invoice-create', refreshedSummary);

      if (refreshedSummary.ok) {
        const invoiceFound = (refreshedSummary.body?.invoices || []).some(
          (entry) => entry.id === invoice?.id || entry.invoiceCode === invoice?.invoiceCode,
        );
        pushManual(
          'admin:new-invoice-visible-in-summary',
          invoiceFound,
          invoiceFound ? invoice?.invoiceCode || invoice?.id : 'Invoice not found in summary list.',
        );
      }
    }
  }

  const failures = checks.filter((entry) => !entry.ok);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Checks run: ${checks.length}`);
  console.log(`Failures: ${failures.length}`);
  console.log('');

  for (const entry of checks) {
    const label = entry.ok ? 'OK ' : 'BAD';
    console.log(`${label} ${entry.name} -> ${entry.status}`);
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
