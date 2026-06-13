const BASE_URL =
  process.env.API_BASE_URL ||
  "https://tws-ops-system-backend-staging.up.railway.app/api";
const PASSWORD = process.env.API_AUDIT_PASSWORD || "Password123!";
const KNOWN_ASIN = process.env.ORDER_REGRESSION_ASIN || "B0FH4RFYY1";

const USERS = {
  admin: "admin@example.com",
  processor: "order@example.com",
};

async function request(
  path,
  { method = "GET", token, body, expectedStatuses = [200] } = {},
) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
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
  const result = await request("/auth/login", {
    method: "POST",
    body: { email, password: PASSWORD },
    expectedStatuses: [200],
  });

  if (!result.ok || !result.body?.token) {
    throw new Error(
      `Login failed for ${email}: ${result.status} ${JSON.stringify(result.body)}`,
    );
  }

  return result.body.token;
}

function summarize(body) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
}

function buildOrderId(prefix) {
  return `${prefix}-${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}`;
}

async function main() {
  const checks = [];
  const tokens = {};

  const push = (name, result, extra = {}) => {
    checks.push({
      name,
      ok: result.ok,
      status: result.status,
      details: result.ok ? extra.details || "" : summarize(result.body),
    });
  };

  for (const [role, email] of Object.entries(USERS)) {
    try {
      tokens[role] = await login(email);
      checks.push({
        name: `login:${role}`,
        ok: true,
        status: 200,
        details: "",
      });
    } catch (error) {
      checks.push({
        name: `login:${role}`,
        ok: false,
        status: 0,
        details: String(error),
      });
    }
  }

  const adminToken = tokens.admin;
  const processorToken = tokens.processor;

  if (!adminToken || !processorToken) {
    throw new Error(
      "Admin and processor tokens are required for the regression run.",
    );
  }

  const accountsResult = await request("/accounts?page=1&limit=5", {
    token: adminToken,
    expectedStatuses: [200],
  });
  push("admin:accounts", accountsResult);

  const accountId = accountsResult.body?.accounts?.[0]?.id;
  if (!accountId) {
    throw new Error("Could not find an account for the regression run.");
  }

  const cleanupOrderIds = [];

  const createMinimalOrder = async (token, prefix) => {
    const ebayOrderId = buildOrderId(prefix);
    const amazonOrderId = `AMZ-${buildOrderId(prefix)}`;
    const result = await request("/orders", {
      method: "POST",
      token,
      body: {
        ebayOrderId,
        asin: KNOWN_ASIN,
        salePrice: "138.03",
        amazonBuyingPrice: "58.07",
        amazonOrderId,
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
    const amazonOrderId = `AMZ-${buildOrderId(`${prefix}-FULL`)}`;
    const result = await request("/orders", {
      method: "POST",
      token,
      body: {
        ebayOrderId,
        asin: KNOWN_ASIN,
        salePrice: "138.03",
        amazonBuyingPrice: "58.07",
        amazonOrderId,
        accountId,
        orderDate: new Date().toLocaleDateString("en-CA"),
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

  const adminCreate = await createMinimalOrder(adminToken, "ADMIN-ORDER-REG");
  push("admin:create-minimal-order", adminCreate.result, {
    details: adminCreate.result.ok ? adminCreate.ebayOrderId : "",
  });

  const adminWorkflowSeed = adminCreate.orderId
    ? adminCreate
    : await createFallbackOrder(adminToken, "ADMIN-ORDER-REG");

  if (!adminCreate.orderId) {
    push("admin:create-fallback-order-with-date", adminWorkflowSeed.result, {
      details: adminWorkflowSeed.result.ok ? adminWorkflowSeed.ebayOrderId : "",
    });
  }

  if (adminWorkflowSeed.orderId) {
    const createdOrderDetail = await request(
      `/orders/${adminWorkflowSeed.orderId}`,
      {
        token: adminToken,
        expectedStatuses: [200],
      },
    );
    push("admin:created-order-visible", createdOrderDetail, {
      details: createdOrderDetail.ok
        ? JSON.stringify({
          orderStatus: createdOrderDetail.body?.order?.orderStatus,
          placementStatus: createdOrderDetail.body?.order?.placementStatus,
          paymentStatus: createdOrderDetail.body?.order?.paymentStatus,
        })
        : "",
    });

    checks.push({
      name: "admin:created-order-is-paid-and-placed",
      ok:
        createdOrderDetail.body?.order?.orderStatus === "PLACED" &&
        createdOrderDetail.body?.order?.placementStatus === "PLACED" &&
        createdOrderDetail.body?.order?.paymentStatus === "PAID",
      status: createdOrderDetail.status,
      details: createdOrderDetail.ok
        ? JSON.stringify({
          orderStatus: createdOrderDetail.body?.order?.orderStatus,
          placementStatus: createdOrderDetail.body?.order?.placementStatus,
          paymentStatus: createdOrderDetail.body?.order?.paymentStatus,
        })
        : summarize(createdOrderDetail.body),
    });

    const duplicate = await request("/orders", {
      method: "POST",
      token: adminToken,
      body: {
        ebayOrderId: adminWorkflowSeed.ebayOrderId,
        asin: KNOWN_ASIN,
        salePrice: "138.03",
        amazonBuyingPrice: "58.07",
        amazonOrderId: `AMZ-${buildOrderId("ADMIN-DUP")}`,
        accountId,
      },
      expectedStatuses: [409],
    });
    push("admin:create-duplicate-order-blocked", duplicate);

    const unsupportedShippedStatus = await request(
      `/orders/${adminWorkflowSeed.orderId}/status`,
      {
        method: "PATCH",
        token: adminToken,
        body: {
          orderStatus: "SHIPPED",
        },
        expectedStatuses: [400],
      },
    );
    push("admin:status-shipped-not-allowed", unsupportedShippedStatus);

    const unsupportedPlacedStatus = await request(
      `/orders/${adminWorkflowSeed.orderId}/status`,
      {
        method: "PATCH",
        token: adminToken,
        body: {
          orderStatus: "PLACED",
        },
        expectedStatuses: [400],
      },
    );
    push("admin:status-placed-not-allowed", unsupportedPlacedStatus);

    const issueMissingFields = await request(
      `/orders/${adminWorkflowSeed.orderId}/mark-issue`,
      {
        method: "POST",
        token: adminToken,
        body: {
          issueType: "OTHER",
        },
        expectedStatuses: [400],
      },
    );
    push("admin:issue-missing-fields-blocked", issueMissingFields);

    const placed = await request(
      `/orders/${adminWorkflowSeed.orderId}/mark-placed`,
      {
        method: "POST",
        token: adminToken,
        body: {
          amazonBuyingPrice: "58.07",
          amazonOrderId: `AMZ-${buildOrderId("ADMIN")}`,
        },
        expectedStatuses: [409],
      },
    );
    push("admin:mark-placed-blocked-for-created-order", placed);

    const delivered = await request(
      `/orders/${adminWorkflowSeed.orderId}/status`,
      {
        method: "PATCH",
        token: adminToken,
        body: {
          orderStatus: "DELIVERED",
        },
        expectedStatuses: [200],
      },
    );
    push("admin:status-delivered-from-placed", delivered);

    const deliveredAgain = await request(
      `/orders/${adminWorkflowSeed.orderId}/status`,
      {
        method: "PATCH",
        token: adminToken,
        body: {
          orderStatus: "DELIVERED",
        },
        expectedStatuses: [409],
      },
    );
    push("admin:status-delivered-again-blocked", deliveredAgain);

    const returned = await request(
      `/orders/${adminWorkflowSeed.orderId}/status`,
      {
        method: "PATCH",
        token: adminToken,
        body: {
          orderStatus: "RETURNED",
        },
        expectedStatuses: [200],
      },
    );
    push("admin:status-returned-after-delivered", returned);

    const refunded = await request(
      `/orders/${adminWorkflowSeed.orderId}/status`,
      {
        method: "PATCH",
        token: adminToken,
        body: {
          orderStatus: "REFUNDED",
        },
        expectedStatuses: [200],
      },
    );
    push("admin:status-refunded-after-returned", refunded);
  }

  const processorCreate = await createMinimalOrder(
    processorToken,
    "PROC-ORDER-REG",
  );
  push("processor:create-minimal-order", processorCreate.result, {
    details: processorCreate.result.ok ? processorCreate.ebayOrderId : "",
  });

  const processorWorkflowSeed = processorCreate.orderId
    ? processorCreate
    : await createFallbackOrder(processorToken, "PROC-ORDER-REG");

  if (!processorCreate.orderId) {
    push(
      "processor:create-fallback-order-with-date",
      processorWorkflowSeed.result,
      {
        details: processorWorkflowSeed.result.ok
          ? processorWorkflowSeed.ebayOrderId
          : "",
      },
    );
  }

  if (processorWorkflowSeed.orderId) {
    const processorOrderDetail = await request(
      `/orders/${processorWorkflowSeed.orderId}`,
      {
        token: processorToken,
        expectedStatuses: [200],
      },
    );
    push("processor:created-order-visible", processorOrderDetail);

    checks.push({
      name: "processor:created-order-is-paid-and-placed",
      ok:
        processorOrderDetail.body?.order?.orderStatus === "PLACED" &&
        processorOrderDetail.body?.order?.placementStatus === "PLACED" &&
        processorOrderDetail.body?.order?.paymentStatus === "PAID",
      status: processorOrderDetail.status,
      details: processorOrderDetail.ok
        ? JSON.stringify({
          orderStatus: processorOrderDetail.body?.order?.orderStatus,
          placementStatus: processorOrderDetail.body?.order?.placementStatus,
          paymentStatus: processorOrderDetail.body?.order?.paymentStatus,
        })
        : summarize(processorOrderDetail.body),
    });

    const processorDelivered = await request(
      `/orders/${processorWorkflowSeed.orderId}/status`,
      {
        method: "PATCH",
        token: processorToken,
        body: {
          orderStatus: "DELIVERED",
        },
        expectedStatuses: [200],
      },
    );
    push("processor:status-delivered-from-placed", processorDelivered);
  }

  for (const orderId of cleanupOrderIds) {
    const cleanup = await request(`/orders/${orderId}`, {
      method: "DELETE",
      token: adminToken,
      body: { reason: "Order workflow regression cleanup." },
      expectedStatuses: [200],
    });
    push(`cleanup:${orderId}`, cleanup);
  }

  const failures = checks.filter((entry) => !entry.ok);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Checks run: ${checks.length}`);
  console.log(`Failures: ${failures.length}`);
  console.log("");

  for (const entry of checks) {
    console.log(`${entry.ok ? "OK " : "BAD"} ${entry.name} -> ${entry.status}`);
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
