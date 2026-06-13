const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');

const schemaPath = path.resolve(__dirname, '../database/schema.sql');
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Password123!';

const IDS = {
  accounts: {
    default: '11111111-1111-4111-8111-111111111111',
    case2: '22222222-2222-4222-8222-222222222222',
    case3: '33333333-3333-4333-8333-333333333333',
  },
  products: {
    listed: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    assigned: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    rejected: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    review: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
  },
  orders: {
    placed: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    delivered: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    returned: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    issue: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
  },
  changeRequest: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  team: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  employees: {
    admin: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
    hr: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
    hunter: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
    lister: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4',
    processor: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5',
  },
};

const users = [
  {
    key: 'superadmin',
    name: 'Super Admin User',
    email: 'superadmin@example.com',
    role: 'super_admin',
    roles: ['super_admin'],
  },
  {
    key: 'admin',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    roles: ['admin'],
    permissions: {
      canManageUsers: true,
      canViewReports: true,
      canExportReports: true,
      canManageSettings: true,
      canManageHr: true,
      canViewPayroll: true,
      canProcessOrders: true,
      canViewAllOrders: true,
    },
  },
  {
    key: 'hunter',
    name: 'Hunter User',
    email: 'hunter@example.com',
    role: 'hunter',
    roles: ['hunter'],
  },
  {
    key: 'hashim',
    name: 'Hashim',
    email: 'hashim@gmail.com',
    role: 'hunter',
    roles: ['hunter'],
  },
  {
    key: 'trainingHunter',
    name: 'Training Hunter',
    email: 'training@example.com',
    role: 'hunter',
    roles: ['hunter'],
    hunterStatus: 'TRAINING',
  },
  {
    key: 'lister',
    name: 'Lister User',
    email: 'lister@example.com',
    role: 'lister',
    roles: ['lister'],
  },
  {
    key: 'sunny',
    name: 'Sunny Lister',
    email: 'sunny@gmail.com',
    role: 'lister',
    roles: ['lister'],
  },
  {
    key: 'processor',
    name: 'Order Processor',
    email: 'order@example.com',
    role: 'order_processor',
    roles: ['order_processor'],
    permissions: { canProcessOrders: true },
  },
  {
    key: 'processorLocal',
    name: 'Local Order Processor',
    email: 'order.processor.local@example.com',
    role: 'order_processor',
    roles: ['order_processor'],
    permissions: { canProcessOrders: true },
  },
  {
    key: 'hr',
    name: 'HR User',
    email: 'hr@example.com',
    role: 'hr',
    roles: ['hr'],
    permissions: { canManageHr: true, canViewPayroll: true, canViewReports: true },
  },
];

const accountRows = [
  [IDS.accounts.default, 'Default eBay Account', 'ebay', 'US', 'USD', 50, 50, 12, 279.86],
  [IDS.accounts.case2, 'Ebay Case 2', 'ebay', 'US', 'USD', 50, 50, 24, 916.71],
  [IDS.accounts.case3, 'Ebay Case 3', 'ebay', 'UK', 'GBP', 55, 45, 7, 458.36],
];

const upsertUser = async (client, passwordHash, user) => {
  const result = await client.query(
    `
      INSERT INTO users (
        name,
        email,
        password_hash,
        role,
        roles,
        permissions,
        is_active,
        status,
        hunter_status,
        training_rules_acknowledged_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, TRUE, 'active', $7, $8)
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          roles = EXCLUDED.roles,
          permissions = EXCLUDED.permissions,
          is_active = TRUE,
          status = 'active',
          hunter_status = EXCLUDED.hunter_status,
          training_rules_acknowledged_at = EXCLUDED.training_rules_acknowledged_at,
          deleted_at = NULL,
          updated_at = NOW()
      RETURNING id
    `,
    [
      user.name,
      user.email,
      passwordHash,
      user.role,
      JSON.stringify(user.roles),
      JSON.stringify(user.permissions || {}),
      user.hunterStatus || 'ACTIVE',
      user.hunterStatus === 'TRAINING' ? new Date().toISOString() : null,
    ],
  );

  return result.rows[0].id;
};

const upsertProduct = async (client, product) => {
  await client.query(
    `
      INSERT INTO products (
        id,
        hunter_id,
        assigned_lister_id,
        listed_by,
        account_used,
        amazon_url,
        amazon_alt_url,
        ebay_url,
        asin,
        title,
        category,
        custom_label,
        amazon_price,
        ebay_price,
        fees,
        sold_count,
        stock_quantity,
        alternate_stock_quantity,
        rating,
        product_watchers,
        sales_last_two_months,
        basket_count,
        delivery_days,
        monthly_graph_uptrend,
        profit,
        roi,
        status,
        listing_review_status,
        listing_submitted_for_review_at,
        listing_review_rejection_reason,
        original_hunter_id,
        current_hunter_id,
        rejection_reason,
        validation_notes,
        listed_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34::jsonb, $35
      )
      ON CONFLICT (id) DO UPDATE
      SET hunter_id = EXCLUDED.hunter_id,
          assigned_lister_id = EXCLUDED.assigned_lister_id,
          listed_by = EXCLUDED.listed_by,
          account_used = EXCLUDED.account_used,
          amazon_url = EXCLUDED.amazon_url,
          amazon_alt_url = EXCLUDED.amazon_alt_url,
          ebay_url = EXCLUDED.ebay_url,
          asin = EXCLUDED.asin,
          title = EXCLUDED.title,
          category = EXCLUDED.category,
          custom_label = EXCLUDED.custom_label,
          amazon_price = EXCLUDED.amazon_price,
          ebay_price = EXCLUDED.ebay_price,
          fees = EXCLUDED.fees,
          sold_count = EXCLUDED.sold_count,
          stock_quantity = EXCLUDED.stock_quantity,
          alternate_stock_quantity = EXCLUDED.alternate_stock_quantity,
          rating = EXCLUDED.rating,
          product_watchers = EXCLUDED.product_watchers,
          sales_last_two_months = EXCLUDED.sales_last_two_months,
          basket_count = EXCLUDED.basket_count,
          delivery_days = EXCLUDED.delivery_days,
          monthly_graph_uptrend = EXCLUDED.monthly_graph_uptrend,
          profit = EXCLUDED.profit,
          roi = EXCLUDED.roi,
          status = EXCLUDED.status,
          listing_review_status = EXCLUDED.listing_review_status,
          listing_submitted_for_review_at = EXCLUDED.listing_submitted_for_review_at,
          listing_review_rejection_reason = EXCLUDED.listing_review_rejection_reason,
          original_hunter_id = EXCLUDED.original_hunter_id,
          current_hunter_id = EXCLUDED.current_hunter_id,
          rejection_reason = EXCLUDED.rejection_reason,
          validation_notes = EXCLUDED.validation_notes,
          listed_at = EXCLUDED.listed_at,
          deleted_at = NULL,
          updated_at = NOW()
    `,
    [
      product.id,
      product.hunterId,
      product.assignedListerId,
      product.listedBy,
      product.accountId,
      product.amazonUrl,
      product.amazonAltUrl || null,
      product.ebayUrl,
      product.asin,
      product.title,
      product.category,
      product.customLabel,
      product.amazonPrice,
      product.ebayPrice,
      product.fees,
      product.soldCount,
      product.stockQuantity,
      product.alternateStockQuantity,
      product.rating,
      product.productWatchers,
      product.salesLastTwoMonths,
      product.basketCount,
      product.deliveryDays,
      product.monthlyGraphUptrend,
      product.profit,
      product.roi,
      product.status,
      product.listingReviewStatus || 'NOT_REQUIRED',
      product.listingSubmittedForReviewAt || null,
      product.listingReviewRejectionReason || null,
      product.hunterId,
      product.hunterId,
      product.rejectionReason || null,
      JSON.stringify(product.validationNotes || []),
      product.listedAt || null,
    ],
  );
};

const upsertOrder = async (client, order) => {
  await client.query(
    `
      INSERT INTO orders (
        id,
        ebay_order_id,
        product_id,
        asin,
        product_title,
        custom_label,
        hunter_id,
        lister_id,
        account_id,
        quantity,
        sale_price,
        ebay_fee,
        amazon_buying_price,
        total_cost,
        profit,
        roi,
        order_date,
        placed_date,
        delivered_date,
        tracking_number,
        carrier,
        amazon_order_id,
        supplier_order_status,
        order_status,
        placement_status,
        payment_status,
        match_status,
        issue_type,
        issue_status,
        order_impact,
        issue_reason,
        issue_created_at,
        issue_created_by,
        created_by,
        updated_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 1,
        $10, $11, $12, $13, $14, $15, $16, $16, $17, $18,
        $19, $20, 'PLACED', $21, 'PLACED', 'PAID', 'matched',
        $22, $23, $24, $25, $26, $27, $28, $28
      )
      ON CONFLICT (id) DO UPDATE
      SET ebay_order_id = EXCLUDED.ebay_order_id,
          product_id = EXCLUDED.product_id,
          asin = EXCLUDED.asin,
          product_title = EXCLUDED.product_title,
          custom_label = EXCLUDED.custom_label,
          hunter_id = EXCLUDED.hunter_id,
          lister_id = EXCLUDED.lister_id,
          account_id = EXCLUDED.account_id,
          sale_price = EXCLUDED.sale_price,
          ebay_fee = EXCLUDED.ebay_fee,
          amazon_buying_price = EXCLUDED.amazon_buying_price,
          total_cost = EXCLUDED.total_cost,
          profit = EXCLUDED.profit,
          roi = EXCLUDED.roi,
          order_date = EXCLUDED.order_date,
          placed_date = EXCLUDED.placed_date,
          delivered_date = EXCLUDED.delivered_date,
          tracking_number = EXCLUDED.tracking_number,
          carrier = EXCLUDED.carrier,
          amazon_order_id = EXCLUDED.amazon_order_id,
          supplier_order_status = EXCLUDED.supplier_order_status,
          order_status = EXCLUDED.order_status,
          placement_status = EXCLUDED.placement_status,
          payment_status = EXCLUDED.payment_status,
          match_status = EXCLUDED.match_status,
          issue_type = EXCLUDED.issue_type,
          issue_status = EXCLUDED.issue_status,
          order_impact = EXCLUDED.order_impact,
          issue_reason = EXCLUDED.issue_reason,
          issue_created_at = EXCLUDED.issue_created_at,
          issue_created_by = EXCLUDED.issue_created_by,
          updated_by = EXCLUDED.updated_by,
          deleted_at = NULL,
          updated_at = NOW()
    `,
    [
      order.id,
      order.ebayOrderId,
      order.productId,
      order.asin,
      order.productTitle,
      order.customLabel,
      order.hunterId,
      order.listerId,
      order.accountId,
      order.salePrice,
      order.ebayFee,
      order.amazonBuyingPrice,
      order.totalCost,
      order.profit,
      order.roi,
      order.orderDate,
      order.deliveredDate || null,
      order.trackingNumber || null,
      order.carrier || null,
      order.amazonOrderId,
      order.orderStatus,
      order.issueType || null,
      order.issueStatus || null,
      order.orderImpact || null,
      order.issueReason || null,
      order.issueCreatedAt || null,
      order.issueCreatedBy || null,
      order.createdBy,
    ],
  );
};

const cleanupRegressionArtifacts = async (client) => {
  await client.query(`
    DELETE FROM product_change_requests
    WHERE order_id IN (
      SELECT id
      FROM orders
      WHERE ebay_order_id LIKE 'ORDER-AUDIT-%'
         OR ebay_order_id LIKE 'ADMIN-ORDER-REG-%'
         OR ebay_order_id LIKE 'PROC-ORDER-REG-%'
         OR ebay_order_id LIKE 'REL-LINK-%'
         OR notes ILIKE '%regression order%'
         OR notes ILIKE '%staging API audit%'
    )
       OR issue_reason ILIKE '%staging API audit%'
       OR requested_changes ILIKE '%staging API audit%'
       OR requested_changes ILIKE '%regression%'
  `);

  await client.query(`
    DELETE FROM orders
    WHERE ebay_order_id LIKE 'ORDER-AUDIT-%'
       OR ebay_order_id LIKE 'ADMIN-ORDER-REG-%'
       OR ebay_order_id LIKE 'PROC-ORDER-REG-%'
       OR ebay_order_id LIKE 'REL-LINK-%'
       OR notes ILIKE '%regression order%'
       OR notes ILIKE '%staging API audit%'
  `);

  await client.query(`
    DO $$
    BEGIN
      IF to_regclass('public.product_categories') IS NOT NULL THEN
        EXECUTE 'DELETE FROM product_categories WHERE name LIKE ''API Audit %''';
      END IF;
    END $$;
  `);
};

const run = async () => {
  const client = await pool.connect();

  try {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schema);

    await client.query('BEGIN');
    await cleanupRegressionArtifacts(client);

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const userIds = {};

    for (const user of users) {
      userIds[user.key] = await upsertUser(client, passwordHash, user);
    }

    const teamResult = await client.query(
      `
        INSERT INTO teams (id, name, description, created_by, updated_by)
        VALUES ($1, 'Team Abubakar', 'Local regression team for linked workflow checks.', $2, $2)
        ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            created_by = COALESCE(teams.created_by, EXCLUDED.created_by),
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
        RETURNING id
      `,
      [IDS.team, userIds.admin],
    );
    const teamId = teamResult.rows[0].id;

    for (const userId of [userIds.hunter, userIds.hashim, userIds.trainingHunter, userIds.lister, userIds.sunny, userIds.processor, userIds.hr]) {
      await client.query(
        `
          INSERT INTO team_members (team_id, user_id, assigned_by)
          VALUES ($1, $2, $3)
          ON CONFLICT (team_id, user_id) DO UPDATE
          SET assigned_by = EXCLUDED.assigned_by,
              updated_at = NOW()
        `,
        [teamId, userId, userIds.admin],
      );
    }

    for (const account of accountRows) {
      await client.query(
        `
          INSERT INTO accounts (
            id,
            name,
            marketplace,
            country,
            currency,
            client_profit_percentage,
            company_profit_percentage,
            previous_order_count,
            last_month_profit,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
          ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              marketplace = EXCLUDED.marketplace,
              country = EXCLUDED.country,
              currency = EXCLUDED.currency,
              client_profit_percentage = EXCLUDED.client_profit_percentage,
              company_profit_percentage = EXCLUDED.company_profit_percentage,
              previous_order_count = EXCLUDED.previous_order_count,
              last_month_profit = EXCLUDED.last_month_profit,
              is_active = TRUE,
              updated_at = NOW()
        `,
        account,
      );
    }

    for (const [hunterId, listerId] of [
      [userIds.hunter, userIds.lister],
      [userIds.hashim, userIds.lister],
      [userIds.trainingHunter, userIds.sunny],
    ]) {
      await client.query(
        `
          INSERT INTO hunter_lister_assignments (hunter_id, lister_id)
          VALUES ($1, $2)
          ON CONFLICT (hunter_id) DO UPDATE
          SET lister_id = EXCLUDED.lister_id,
              updated_at = NOW()
        `,
        [hunterId, listerId],
      );
    }

    for (const [accountId, listerId] of [
      [IDS.accounts.default, userIds.lister],
      [IDS.accounts.case2, userIds.lister],
      [IDS.accounts.case2, userIds.sunny],
      [IDS.accounts.case3, userIds.sunny],
    ]) {
      await client.query(
        `
          INSERT INTO lister_account_assignments (account_id, lister_id)
          VALUES ($1, $2)
          ON CONFLICT (account_id, lister_id) DO NOTHING
        `,
        [accountId, listerId],
      );
    }

    const products = [
      {
        id: IDS.products.listed,
        hunterId: userIds.hunter,
        assignedListerId: userIds.lister,
        listedBy: userIds.lister,
        accountId: IDS.accounts.default,
        amazonUrl: 'https://www.amazon.com/dp/B0FH4RFYY1',
        ebayUrl: 'https://www.ebay.com/itm/365712841731',
        asin: 'B0FH4RFYY1',
        title: 'Black Rear Step Bumper Assembly Compatible with 1997-2003 Ford F-150 Flareside/S',
        category: 'Automotive',
        customLabel: 'Hunter User',
        amazonPrice: 58.07,
        ebayPrice: 138.03,
        fees: 28.99,
        soldCount: 12,
        stockQuantity: 16,
        alternateStockQuantity: 10,
        rating: 4.4,
        productWatchers: 6,
        salesLastTwoMonths: 18,
        basketCount: 3,
        deliveryDays: 4,
        monthlyGraphUptrend: true,
        profit: 50.97,
        roi: 87.78,
        status: 'listed',
        listedAt: '2026-05-21T12:00:00.000Z',
      },
      {
        id: IDS.products.assigned,
        hunterId: userIds.hunter,
        assignedListerId: userIds.sunny,
        listedBy: null,
        accountId: IDS.accounts.case2,
        amazonUrl: 'https://www.amazon.com/dp/B0DZVFL29R',
        ebayUrl: 'https://www.ebay.com/itm/365700000001',
        asin: 'B0DZVFL29R',
        title: 'PCV Valve Tubing Hose with Bypass',
        category: 'Automotive',
        customLabel: 'Hunter User',
        amazonPrice: 19.69,
        ebayPrice: 35.44,
        fees: 7.44,
        soldCount: 8,
        stockQuantity: 20,
        alternateStockQuantity: 9,
        rating: 4.1,
        productWatchers: 2,
        salesLastTwoMonths: 11,
        basketCount: 1,
        deliveryDays: 5,
        monthlyGraphUptrend: true,
        profit: 8.31,
        roi: 42.2,
        status: 'assigned',
      },
      {
        id: IDS.products.rejected,
        hunterId: userIds.trainingHunter,
        assignedListerId: userIds.sunny,
        listedBy: null,
        accountId: IDS.accounts.case3,
        amazonUrl: 'https://www.amazon.com/dp/B0TRAIN0001',
        ebayUrl: 'https://www.ebay.com/itm/365700000002',
        asin: 'B0TRAIN0001',
        title: 'Training Sample Product Below Profit Rule',
        category: 'Electronics',
        customLabel: 'Training Hunter',
        amazonPrice: 22,
        ebayPrice: 25,
        fees: 5,
        soldCount: 1,
        stockQuantity: 4,
        alternateStockQuantity: 2,
        rating: 3.8,
        productWatchers: 0,
        salesLastTwoMonths: 1,
        basketCount: 0,
        deliveryDays: 8,
        monthlyGraphUptrend: false,
        profit: -2,
        roi: -9.09,
        status: 'rejected',
        rejectionReason: 'Profit must be at least 10.',
        validationNotes: [{ passed: false, message: 'Profit must be at least 10.' }],
      },
      {
        id: IDS.products.review,
        hunterId: userIds.hashim,
        assignedListerId: userIds.lister,
        listedBy: userIds.lister,
        accountId: IDS.accounts.case2,
        amazonUrl: 'https://www.amazon.com/dp/B0REVIEW001',
        ebayUrl: 'https://www.ebay.com/itm/365700000003',
        asin: 'B0REVIEW001',
        title: 'Tail Light Assembly Review Fixture',
        category: 'Automotive',
        customLabel: 'Hashim',
        amazonPrice: 44.99,
        ebayPrice: 80.39,
        fees: 16.88,
        soldCount: 10,
        stockQuantity: 11,
        alternateStockQuantity: 8,
        rating: 4.3,
        productWatchers: 5,
        salesLastTwoMonths: 12,
        basketCount: 2,
        deliveryDays: 4,
        monthlyGraphUptrend: true,
        profit: 18.52,
        roi: 41.16,
        status: 'listed',
        listingReviewStatus: 'PENDING',
        listingSubmittedForReviewAt: '2026-05-22T12:00:00.000Z',
        listedAt: '2026-05-22T12:00:00.000Z',
      },
    ];

    for (const product of products) {
      await upsertProduct(client, product);
    }

    for (const listing of [
      [IDS.products.listed, userIds.lister, IDS.accounts.default, 'https://www.ebay.com/itm/365712841731', '365712841731'],
      [IDS.products.review, userIds.lister, IDS.accounts.case2, 'https://www.ebay.com/itm/365700000003', '365700000003'],
    ]) {
      await client.query(
        `
          INSERT INTO listings (product_id, lister_id, account_id, listing_url, item_id)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (product_id) DO UPDATE
          SET lister_id = EXCLUDED.lister_id,
              account_id = EXCLUDED.account_id,
              listing_url = EXCLUDED.listing_url,
              item_id = EXCLUDED.item_id,
              updated_at = NOW()
        `,
        listing,
      );
    }

    const orders = [
      {
        id: IDS.orders.placed,
        ebayOrderId: 'LOCAL-PLACED-001',
        amazonOrderId: 'AMZ-LOCAL-PLACED-001',
        productId: IDS.products.listed,
        asin: 'B0FH4RFYY1',
        productTitle: products[0].title,
        customLabel: 'Hunter User',
        hunterId: userIds.hunter,
        listerId: userIds.lister,
        accountId: IDS.accounts.default,
        salePrice: 138.03,
        ebayFee: 28.99,
        amazonBuyingPrice: 58.07,
        totalCost: 58.07,
        profit: 50.97,
        roi: 87.78,
        orderDate: '2026-05-26T12:00:00.000Z',
        orderStatus: 'PLACED',
        createdBy: userIds.processor,
      },
      {
        id: IDS.orders.delivered,
        ebayOrderId: 'LOCAL-DELIVERED-001',
        amazonOrderId: 'AMZ-LOCAL-DELIVERED-001',
        productId: IDS.products.listed,
        asin: 'B0FH4RFYY1',
        productTitle: products[0].title,
        customLabel: 'Hunter User',
        hunterId: userIds.hunter,
        listerId: userIds.lister,
        accountId: IDS.accounts.default,
        salePrice: 149.99,
        ebayFee: 31.49,
        amazonBuyingPrice: 63,
        totalCost: 63,
        profit: 55.5,
        roi: 88.1,
        orderDate: '2026-05-27T12:00:00.000Z',
        deliveredDate: '2026-05-31T12:00:00.000Z',
        trackingNumber: 'TRACK-LOCAL-1',
        carrier: 'UPS',
        orderStatus: 'DELIVERED',
        createdBy: userIds.processor,
      },
      {
        id: IDS.orders.returned,
        ebayOrderId: 'LOCAL-RETURNED-001',
        amazonOrderId: 'AMZ-LOCAL-RETURNED-001',
        productId: IDS.products.review,
        asin: 'B0REVIEW001',
        productTitle: products[3].title,
        customLabel: 'Hashim',
        hunterId: userIds.hashim,
        listerId: userIds.lister,
        accountId: IDS.accounts.case2,
        salePrice: 80.39,
        ebayFee: 16.88,
        amazonBuyingPrice: 44.99,
        totalCost: 44.99,
        profit: 18.52,
        roi: 41.16,
        orderDate: '2026-05-28T12:00:00.000Z',
        deliveredDate: '2026-06-01T12:00:00.000Z',
        trackingNumber: 'TRACK-LOCAL-2',
        carrier: 'FedEx',
        orderStatus: 'RETURNED',
        createdBy: userIds.processor,
      },
      {
        id: IDS.orders.issue,
        ebayOrderId: 'LOCAL-ISSUE-001',
        amazonOrderId: 'AMZ-LOCAL-ISSUE-001',
        productId: IDS.products.listed,
        asin: 'B0FH4RFYY1',
        productTitle: products[0].title,
        customLabel: 'Hunter User',
        hunterId: userIds.hunter,
        listerId: userIds.lister,
        accountId: IDS.accounts.default,
        salePrice: 49.99,
        ebayFee: 10.5,
        amazonBuyingPrice: 58.07,
        totalCost: 58.07,
        profit: -18.58,
        roi: -31.99,
        orderDate: '2026-05-29T12:00:00.000Z',
        orderStatus: 'ISSUE',
        issueType: 'PRICE_INCREASED',
        issueStatus: 'OPEN',
        orderImpact: 'Price changed',
        issueReason: 'Supplier price moved above the approved buying target.',
        issueCreatedAt: '2026-05-29T13:00:00.000Z',
        issueCreatedBy: userIds.processor,
        createdBy: userIds.processor,
      },
    ];

    for (const order of orders) {
      await upsertOrder(client, order);
    }

    await client.query(
      `
        INSERT INTO product_change_requests (
          id,
          product_id,
          order_id,
          hunter_id,
          lister_id,
          account_id,
          asin,
          product_title,
          requested_changes,
          issue_type,
          issue_reason,
          current_amazon_link,
          current_ebay_link,
          current_price,
          status,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'B0FH4RFYY1', $7, $8, 'PRICE_INCREASED', $9, $10, $11, $12, 'OPEN', $13)
        ON CONFLICT (id) DO UPDATE
        SET order_id = EXCLUDED.order_id,
            issue_type = EXCLUDED.issue_type,
            issue_reason = EXCLUDED.issue_reason,
            status = EXCLUDED.status,
            updated_at = NOW()
      `,
      [
        IDS.changeRequest,
        IDS.products.listed,
        IDS.orders.issue,
        userIds.hunter,
        userIds.lister,
        IDS.accounts.default,
        products[0].title,
        'Review supplier price and update product economics.',
        'Supplier price moved above the approved buying target.',
        products[0].amazonUrl,
        products[0].ebayUrl,
        products[0].ebayPrice,
        userIds.processor,
      ],
    );

    const employees = [
      [IDS.employees.admin, userIds.admin, 'EMP-ADM-001', 'Management', 'Admin', '1990-01-10', 2500],
      [IDS.employees.hr, userIds.hr, 'EMP-HR-001', 'Human Resources', 'HR Manager', '1992-05-15', 1800],
      [IDS.employees.hunter, userIds.hunter, 'EMP-HUN-001', 'Research', 'Hunter', '1996-07-20', 1200],
      [IDS.employees.lister, userIds.lister, 'EMP-LIS-001', 'Listing', 'Lister', '1995-09-02', 1300],
      [IDS.employees.processor, userIds.processor, 'EMP-ORD-001', 'Orders', 'Order Processor', '1994-11-12', 1400],
    ];

    for (const employee of employees) {
      await client.query(
        `
          INSERT INTO employee_profiles (
            id,
            user_id,
            employee_code,
            department,
            designation,
            joining_date,
            date_of_birth,
            employment_type,
            employment_status,
            basic_salary,
            payment_method,
            created_by,
            updated_by
          )
          VALUES ($1, $2, $3, $4, $5, '2025-01-01', $6, 'FULL_TIME', 'ACTIVE', $7, 'BANK', $8, $8)
          ON CONFLICT (id) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              employee_code = EXCLUDED.employee_code,
              department = EXCLUDED.department,
              designation = EXCLUDED.designation,
              date_of_birth = EXCLUDED.date_of_birth,
              basic_salary = EXCLUDED.basic_salary,
              updated_by = EXCLUDED.updated_by,
              updated_at = NOW()
        `,
        [...employee, userIds.hr],
      );
    }

    await client.query(
      `
        INSERT INTO hr_attendance (employee_profile_id, attendance_date, status, check_in_time, check_out_time, marked_by)
        VALUES
          ($1, '2026-06-12', 'PRESENT', '09:02', '18:00', $4),
          ($2, '2026-06-12', 'PRESENT', '09:10', '18:05', $4),
          ($3, '2026-06-12', 'LATE', '09:45', '18:10', $4)
        ON CONFLICT (employee_profile_id, attendance_date) DO UPDATE
        SET status = EXCLUDED.status,
            check_in_time = EXCLUDED.check_in_time,
            check_out_time = EXCLUDED.check_out_time,
            marked_by = EXCLUDED.marked_by,
            updated_at = NOW()
      `,
      [IDS.employees.hr, IDS.employees.hunter, IDS.employees.lister, userIds.hr],
    );

    await client.query(
      `
        INSERT INTO hr_leave_requests (employee_profile_id, leave_type, start_date, end_date, total_days, status, reason)
        VALUES ($1, 'ANNUAL', '2026-06-13', '2026-06-13', 1, 'PENDING', 'Local regression leave request')
        ON CONFLICT DO NOTHING
      `,
      [IDS.employees.lister],
    );

    await client.query(
      `
        INSERT INTO hr_payroll (employee_profile_id, payroll_month, basic_salary, allowances, deductions, net_salary, status, created_by, updated_by)
        VALUES ($1, '2026-06-01', 1300, 100, 0, 1400, 'APPROVED', $2, $2)
        ON CONFLICT (employee_profile_id, payroll_month) DO UPDATE
        SET basic_salary = EXCLUDED.basic_salary,
            allowances = EXCLUDED.allowances,
            net_salary = EXCLUDED.net_salary,
            status = EXCLUDED.status,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
      `,
      [IDS.employees.lister, userIds.hr],
    );

    await client.query(
      `
        INSERT INTO hr_expenses (employee_profile_id, category, title, amount, expense_date, status)
        VALUES ($1, 'SOFTWARE', 'Research tool subscription', 29.99, '2026-06-10', 'SUBMITTED')
        ON CONFLICT DO NOTHING
      `,
      [IDS.employees.hunter],
    );

    await client.query(
      `
        INSERT INTO hunting_criteria (
          id,
          min_roi,
          min_profit,
          min_sold_count,
          fee_percent,
          asin_required,
          min_stock_count,
          min_alt_stock_count,
          min_rating,
          custom_label_required,
          watchers_required,
          min_watcher_count,
          min_sales_last_two_months,
          category_required,
          training_min_approval_rate_for_activation,
          training_min_listed_products_for_activation,
          training_min_orders_generated_for_activation
        )
        VALUES (1, 30, 10, 1, 21, TRUE, 8, 8, 0, FALSE, FALSE, 0, 0, FALSE, 60, 5, 1)
        ON CONFLICT (id) DO UPDATE
        SET min_roi = EXCLUDED.min_roi,
            min_profit = EXCLUDED.min_profit,
            min_sold_count = EXCLUDED.min_sold_count,
            fee_percent = EXCLUDED.fee_percent,
            asin_required = EXCLUDED.asin_required,
            min_stock_count = EXCLUDED.min_stock_count,
            min_alt_stock_count = EXCLUDED.min_alt_stock_count,
            category_required = EXCLUDED.category_required,
            updated_at = NOW()
      `,
    );

    await client.query('COMMIT');
    console.log('Database schema applied and realistic local regression data seeded.');
    console.log(`Demo password for all seeded users: ${DEMO_PASSWORD}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
