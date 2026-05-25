# TrendWave Commerce Hub Architecture

## Purpose

This document captures the current frontend/backend structure after the performance and scalability refactors. It is meant to make future work on hunters, listers, admins, super admins, reports, accounts, activity feed, validation rules, and marketplace expansion safer and easier.

## Frontend Structure

### Core

- `frontend/src/app/core/api`
  - thin HTTP clients grouped by domain
  - maps backend responses into typed page or entity models
- `frontend/src/app/core/auth`
  - session handling
  - auth bootstrap
  - token acceptance and logout
- `frontend/src/app/core/config`
  - roles
  - routes
  - statuses
  - quality labels
  - validation constants
  - branding
- `frontend/src/app/core/facades`
  - page-level orchestration
  - API calls
  - state composition
  - optimistic/local updates
- `frontend/src/app/core/http`
  - auth
  - loading
  - error
  - retry interceptors
- `frontend/src/app/core/state`
  - shared reference-data cache
  - lightweight workspace sync signals
  - page query models
- `frontend/src/app/core/ui`
  - loader
  - toast
  - confirm
  - validation messaging
  - global error handling

### Shared

- `frontend/src/app/shared/forms`
  - typed form factories and defaults
- `frontend/src/app/shared/validators`
  - reusable ASIN, price, listing-link, integer validators
- `frontend/src/app/shared/components`
  - reused UI surfaces like tables, empty/error states, dialogs
- `frontend/src/app/shared/grid`
  - sort helpers and small grid utilities

### Features

- `frontend/src/app/features/hunter`
- `frontend/src/app/features/lister`
- `frontend/src/app/features/admin`
- `frontend/src/app/features/superadmin`

Each feature keeps UI components thin and leans on `core/facades`, `core/api`, and shared forms/validators for behavior.

## Backend Structure

- `backend/src/modules/auth`
  - login and profile/session handling
- `backend/src/modules/products`
  - product listing, queue actions, deletion/restore
- `backend/src/modules/users`
  - users, assignments, audit logs, permissions
- `backend/src/modules/accounts`
  - account listing and lister assignment
- `backend/src/modules/dashboard`
  - aggregate stats and reporting surfaces
- `backend/src/modules/system`
  - API limits
  - IP restriction settings
- `backend/src/utils`
  - pagination helpers
  - product analysis and validation helpers

## State Flow

### Page State

Pages should prefer signals for:

- `loading`
- `saving`
- `error`
- `items`
- `total`
- `pageIndex`
- `pageSize`
- selected row or modal state

### Shared Cache

`ReferenceDataService` caches:

- criteria
- users
- accounts

These requests hydrate across multiple pages when needed instead of stopping at the first backend page.

### Workspace Sync

`WorkspaceSyncService` is intentionally lightweight. It is used only when another page truly needs to know a shared area changed.

## API Flow

### Read Path

1. component triggers facade action
2. facade builds filters or payload
3. API service makes request
4. response is mapped into typed result
5. facade updates signals
6. component renders the new state

### Mutation Path

1. component triggers facade action
2. facade validates local state first
3. API service sends mutation
4. success updates local signals first where safe
5. workspace sync is emitted only when another page really depends on the mutation

## Pagination Rules

All list surfaces should assume server pagination.

Current paginated backend support now covers:

- users
- assignments
- products
- accounts
- audit logs

Frontend pages updated in this pass:

- lister queue
- admin products
- admin activity
- hunter product list
- admin assignments

Exports fetch filtered pages in batches and merge them into one `.xlsx` file instead of exporting only the visible page.

## Forms And Validation

Forms are moving toward shared factories:

- `product-submission.form.ts`
- `user.form.ts`

Validation is centralized through shared validators and `ValidationMessageService`.

## Performance Notes

Key reductions already applied:

- lister mark-listed no longer reloads the full queue
- assignment updates no longer reload unrelated dashboard or user pages
- product, assignment, and admin product exports now fetch paginated batches instead of relying on visible rows
- cached dropdown/reference data avoids repeated repeated calls
- backend list endpoints cap page size and return `page`, `limit`, `total`, `hasMore`

## Audit Findings

### Fixed In This Refactor

- repeated full-page reloads after single-row actions
- backend list endpoints without consistent pagination metadata
- frontend callers assuming raw arrays after paginated backend changes
- missing system settings route support in the local backend process
- auth middleware masking non-JWT errors as invalid-token errors

### Still Worth Continuing

- some legacy components still use the older `AdminService` instead of newer API/facade paths
- some templates still invoke simple signal getters directly; the heaviest business logic has already been moved out
- some legacy tables still sort client-side on the current page rather than using server-side sort
- bundle and style budget warnings remain and should be trimmed in a later cleanup

## Future Extension Notes

- add per-domain sync channels if cross-page coordination grows further
- move remaining legacy admin/superadmin pages onto paginated facades
- add server-side sort contracts where grids grow beyond current scale
- consider virtual scroll for very dense queue/detail views
- keep all new list surfaces on the `PageResult<T>` contract
