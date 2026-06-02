const { test, expect } = require('@playwright/test');

const PASSWORD = process.env.E2E_PASSWORD || 'Password123!';
const USERS = {
  admin: 'admin@example.com',
  hunter: 'hunter@example.com',
  lister: 'lister@example.com',
  processor: 'order@example.com',
};

const KNOWN_ACCOUNTS = ['Default eBay Account', 'Ebay Case 2', 'Ebay Case 3'];

async function login(page, email) {
  let ready = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    try {
      await page.locator('#email').waitFor({ state: 'visible', timeout: 15_000 });
      ready = true;
      break;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
    }
  }

  if (!ready) {
    throw new Error('Login form did not become visible.');
  }

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button').filter({ hasText: /sign in|open workspace|continue/i }).click();
  await page.waitForURL(/\/(admin|hunter|lister|order-processor|orders\/processing|team|dashboard)/, {
    timeout: 15_000,
  });
}

async function expectHeading(page, name) {
  await expect(page.getByRole('heading', { name, exact: false }).first()).toBeVisible();
}

async function openMatSelect(page, label) {
  const field = page
    .locator('mat-form-field')
    .filter({ has: page.locator('mat-label', { hasText: label }) })
    .first();
  await field.locator('[role="combobox"]').click();
}

async function chooseKnownAccount(page) {
  await openMatSelect(page, 'Account');
  for (const accountName of KNOWN_ACCOUNTS) {
    const option = page.getByRole('option', { name: accountName, exact: false });
    if (await option.count()) {
      await option.first().click();
      return accountName;
    }
  }

  const genericOption = page
    .locator('[role="option"]')
    .filter({ hasNotText: /^Select account$/i })
    .first();
  await genericOption.click();
  return 'selected account';
}

function formControl(page, name) {
  return page.locator(`[formcontrolname="${name}"]`).first();
}

test('marketing homepage and login page load', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/TrendWave/i).first()).toBeVisible();
  await page.goto('/login');
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
});

test('admin smoke covers core pages', async ({ page }) => {
  await login(page, USERS.admin);

  await page.goto('/admin/dashboard');
  await expectHeading(page, 'Operations overview');

  await page.goto('/admin/users');
  await expectHeading(page, 'Users');

  await page.goto('/admin/assignments');
  await expectHeading(page, 'Assignments');

  await page.goto('/admin/products');
  await expectHeading(page, 'Products');

  await page.goto('/admin/orders');
  await expectHeading(page, 'Orders');

  await page.goto('/admin/accounts');
  await expectHeading(page, 'Accounts');

  await page.goto('/admin/activity');
  await expectHeading(page, 'Activity Feed');
});

test('admin orders modal enables save when required fields are filled', async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto('/admin/orders');
  await expectHeading(page, 'Orders');

  await page.getByRole('button', { name: /Add Order/i }).click();
  await expect(page.getByRole('heading', { name: /Add Order/i })).toBeVisible();

  const saveButton = page.getByRole('button', { name: /Save Order/i });
  await expect(saveButton).toBeDisabled();

  await formControl(page, 'ebayOrderId').fill(`E2E-${Date.now()}`);
  await formControl(page, 'asin').fill('B0FH4RFYY1');
  await formControl(page, 'amazonOrderId').fill(`AMZ-E2E-${Date.now()}`);
  await chooseKnownAccount(page);
  await formControl(page, 'salePrice').fill('145.50');
  await formControl(page, 'amazonBuyingPrice').fill('95.10');

  await expect(saveButton).toBeEnabled();
  await page.getByRole('button', { name: /^Cancel$/i }).click();
});

test('admin accounts invoice modal opens and shows preview', async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto('/admin/accounts');
  await expectHeading(page, 'Accounts');

  await page.getByRole('button', { name: /Generate Invoice/i }).first().click();
  await expect(page.getByRole('heading', { name: /Generate invoice/i })).toBeVisible();
  await expect(page.getByText(/Payment Instructions/i).first()).toBeVisible();
  await expect(page.getByText(/Total Net Payable/i).first()).toBeVisible();
});

test('hunter smoke covers core pages', async ({ page }) => {
  await login(page, USERS.hunter);

  await page.goto('/hunter/dashboard');
  await expect(page.getByRole('heading').first()).toBeVisible();

  await page.goto('/hunter/submission');
  await expect(page.getByText(/Product Submission|Submit/i).first()).toBeVisible();

  await page.goto('/hunter/products');
  await expectHeading(page, 'Product list');

  await page.goto('/hunter/orders');
  await expectHeading(page, 'Orders');

  await page.goto('/hunter/order-issues');
  await expectHeading(page, 'Order Issues');

  await page.goto('/hunter/changes');
  await expect(page.getByText(/Change Requests|Requested Changes/i).first()).toBeVisible();

  await page.goto('/hunter/review');
  await expect(page.getByText(/Weekly Review|Review/i).first()).toBeVisible();

  await page.goto('/hunter/rules');
  await expect(page.getByText(/Hunting Rules|Rules/i).first()).toBeVisible();
});

test('lister smoke covers core pages', async ({ page }) => {
  await login(page, USERS.lister);

  await page.goto('/lister/dashboard');
  await expect(page.getByRole('heading').first()).toBeVisible();

  await page.goto('/lister/products');
  await expect(page.getByText(/Listing Queue|Pending Listings/i).first()).toBeVisible();

  await page.goto('/lister/changes');
  await expect(page.getByText(/Change Requests|Fix Request/i).first()).toBeVisible();

  await page.goto('/lister/orders');
  await expectHeading(page, 'Orders');

  await page.goto('/lister/account-usage');
  await expect(page.getByText(/Account Usage/i).first()).toBeVisible();
});

test('order processor smoke covers core pages', async ({ page }) => {
  await login(page, USERS.processor);

  await page.goto('/order-processor/dashboard');
  await expectHeading(page, 'Order Processor Dashboard');

  await page.goto('/order-processor/orders');
  await expectHeading(page, 'Orders');

  await page.goto('/order-processor/orders/new');
  await expect(page.getByRole('heading', { name: /Add Order/i }).first()).toBeVisible();
  await expect(page.getByText(/Current Hunter/i)).toHaveCount(0);

  await page.goto('/order-processor/issues');
  await expectHeading(page, 'Order Issues');
});
