# Regression Testing

This project now has a repeatable release gate for the main operational workflows.

## Coverage

### Backend / API suites

- `api`
  - broad authenticated API read + safe mutation audit
- `relationships`
  - hunter / lister / order-processor linkage
  - change request blocker flow
- `orders`
  - order creation and lifecycle guards
  - placed / shipped / delivered / issue rules
- `accounts`
  - account summary visibility
  - invoice permission checks
  - optional invoice creation verification

### Browser smoke suite

The browser suite covers:

- marketing homepage and login page
- admin core navigation
- admin add-order modal required-field enablement
- admin invoice modal preview visibility
- hunter core navigation
- lister core navigation
- order processor core navigation

This is intentionally a smoke layer, not a destructive full-data mutation pass.

## Commands

### Whole release gate

From the repo root:

```powershell
npm run regression:release
```

This runs:

1. frontend build
2. backend regression suites
3. browser smoke regression

You can skip parts when needed:

```powershell
$env:SKIP_FRONTEND_BUILD="true"
$env:SKIP_BACKEND_REGRESSION="true"
$env:SKIP_UI_REGRESSION="true"
```

### Browser smoke only

From the repo root:

```powershell
npm run regression:ui
```

### Backend regression only

From the repo root:

```powershell
npm run regression:backend
```

From `backend/`:

```powershell
npm run regression:api
npm run regression:relationships
npm run regression:orders
npm run regression:accounts
npm run regression:all
```

Or from the repo root:

```powershell
cd backend
npm run regression:all
```

## Environment variables

These scripts use the same environment contract:

```powershell
$env:API_BASE_URL="http://localhost:4000/api"
$env:API_AUDIT_PASSWORD="Password123!"
$env:E2E_BASE_URL="http://localhost:4201"
$env:E2E_PASSWORD="Password123!"
```

Optional:

```powershell
$env:REGRESSION_SUITES="orders,accounts"
$env:ACCOUNT_INVOICE_REGRESSION_CREATE="true"
```

## Browser setup

Playwright Chromium is required for UI smoke checks.

Install once:

```powershell
npx playwright install chromium
```

## GitHub Actions

This repo now includes a GitHub Actions workflow:

- [C:\Users\MUHAMMAD\Documents\TWS-OPS-SYSTEM\.github\workflows\regression-gate.yml](C:/Users/MUHAMMAD/Documents/TWS-OPS-SYSTEM/.github/workflows/regression-gate.yml)

It runs automatically on:

- pull requests targeting `master`
- manual `workflow_dispatch` runs

The workflow runs the same release gate command we use locally:

```powershell
npm run regression:release
```

### Recommended repo configuration

Set these GitHub repository variables if you want to override the default staging endpoints:

- `REGRESSION_API_URL`
- `REGRESSION_UI_URL`

Optional secrets:

- `API_AUDIT_PASSWORD`
- `E2E_PASSWORD`

If the secrets are not set, the regression scripts fall back to the current default test password.

### Branch protection

For `master`, enable branch protection and require the status check:

- `Release Regression Gate`

That way, pull requests cannot be merged until the whole regression workflow passes.

## Important safety note

The account/invoice regression suite is **read-only by default**.

Invoice creation is opt-in because there is currently no invoice delete endpoint, so automatic creation would leave extra invoice rows behind on shared environments.

Use this only when you intentionally want to validate the create flow:

```powershell
$env:ACCOUNT_INVOICE_REGRESSION_CREATE="true"
npm run regression:accounts
```

## Suggested usage

### Local release candidate

Start backend and frontend first, then:

```powershell
$env:E2E_BASE_URL="http://localhost:4201"
$env:API_BASE_URL="http://localhost:4000/api"
npm run regression:release
```

### Staging / preview deployment

```powershell
$env:E2E_BASE_URL="https://tws-ops-system-frontend-staging.up.railway.app"
$env:API_BASE_URL="https://tws-ops-system-backend-staging.up.railway.app/api"
npm run regression:release
```

### Focused order debugging

```powershell
$env:API_BASE_URL="http://localhost:4000/api"
$env:REGRESSION_SUITES="orders"
npm run regression:all
```

## What this gives us

- step-by-step pass/fail output
- stable commands for local and staging verification
- repeatable checks before deploys
- browser coverage over the highest-risk screens
- a release gate you can run before merging to `master`

## Recommended merge flow

1. work on a feature branch
2. push branch updates
3. deploy the branch to preview/staging
4. run:

```powershell
$env:E2E_BASE_URL="<preview frontend url>"
$env:API_BASE_URL="<preview backend api url>"
npm run regression:release
```

5. if regression passes, review manually only for brand-new UI behavior
6. make sure the GitHub Actions status check `Release Regression Gate` is green on the PR
7. merge into `master`
8. deploy `master`
9. rerun `npm run regression:release` against production-like staging if needed
