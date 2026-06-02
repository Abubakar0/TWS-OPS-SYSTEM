# TrendWave Commerce Hub Architecture

## Purpose

This document captures the current application structure after the API audit and performance cleanup pass. The goal is to keep Hunters, Listers, Order Processors, Admins, and Super Admins moving on a codebase that is predictable, cache-aware, and easier to extend.

## Frontend Folder Structure

### `frontend/src/app/core`

- `api/`
  - thin HTTP adapters grouped by domain
  - request caching, deduplication, and targeted invalidation now live here
- `auth/`
  - token storage
  - session bootstrap
  - role-aware route landing
- `config/`
  - routes
  - roles
  - statuses
  - validation constants
  - branding
  - cache TTL / namespace contracts
- `facades/`
  - page-level orchestration
  - view model composition
  - targeted optimistic updates
- `http/`
  - auth
  - loading
  - retry
  - error interceptors
- `models/`
  - typed app entities
- `mappers/`
  - table row / audit row transforms
- `state/`
  - `ReferenceDataService`
  - `RequestCacheService`
  - `SessionCacheService`
  - workspace sync signals
  - query state contracts
- `ui/`
  - toast
  - confirm
  - loading
  - validation messaging
  - global error handling

### `frontend/src/app/shared`

- `forms/`
  - typed form factories
- `validators/`
  - ASIN
  - price
  - integer
  - listing-link validators
- `grid/`
  - sort helpers
  - client-side paging helpers where still needed
- `products-table/`
  - reusable hunter/list product grid shell
- `empty-state/`, `error-state/`, `confirmation-dialog/`, `global-loader/`
  - shared UX surfaces

### `frontend/src/app/features`

- `hunter/`
- `lister/`
- `orders/`
- `admin/`
- `superadmin/`
- `team/`

The rule is still: features render, facades coordinate, APIs fetch, state services cache.

## Backend Structure

- `backend/src/modules/auth`
- `backend/src/modules/users`
- `backend/src/modules/accounts`
- `backend/src/modules/products`
- `backend/src/modules/orders`
- `backend/src/modules/order-issues`
- `backend/src/modules/change-requests`
- `backend/src/modules/dashboard`
- `backend/src/modules/system`
- `backend/src/modules/teams`
- `backend/src/utils`

The backend remains module-based, with list endpoints standardized around `page`, `limit`, `total`, and `hasMore`.

## Cache Flow

### 1. Request cache

`RequestCacheService` is the shared in-memory cache for GET requests.

It provides:

- in-flight request deduplication
- TTL-based reuse
- prefix invalidation on mutations

Namespaces:

- `users`
- `accounts`
- `criteria`
- `dashboards`
- `orders`
- `products`
- `assigned-hunters`
- `change-requests`
- `order-issues`
- `system`
- `teams`
- `audit`
- `reports`

TTL policy:

- short: 15 seconds
- medium: 60 seconds
- long: 5 minutes

### 2. Reference cache

`ReferenceDataService` now sits on top of `RequestCacheService`.

It keeps long-lived shared streams for:

- criteria
- users
- accounts

Important detail:

Refresh still works for existing subscribers. The service invalidates the request cache and emits through internal refresh subjects so pages do not need to resubscribe manually.

### 3. Session cache

`SessionCacheService` is session-scoped and hydrates once the authenticated user is known.

It stores:

- current role context
- assigned hunters
- assigned accounts
- cached criteria snapshot
- API limits
- IP restriction flags
- dashboard preferences

The snapshot is persisted in `sessionStorage` and refreshed in the background. This keeps role-specific startup data available between route changes without repeatedly hitting the backend.

## API Flow

### Read path

1. component triggers facade or page action
2. facade/service builds filters
3. API layer checks cache key
4. if request is active or warm, cached observable is reused
5. otherwise HTTP executes
6. result is mapped into typed models
7. state signals update

### Mutation path

1. component triggers action
2. facade validates local form/state
3. API mutation runs
4. affected local row/state is updated immediately where safe
5. only related cache namespaces are invalidated
6. cross-page sync emits only for truly shared domains

## Smart Invalidation Rules

These are the working conventions now:

- create/update/delete user
  - invalidate `users`, `audit`, `reports`
- create/update/toggle account
  - invalidate `accounts`
- criteria/settings update
  - invalidate `criteria`
- order create/update/status/issue/delete/restore
  - invalidate `orders`
- lister mark listed / reject
  - invalidate `products`, `assigned-hunters`
- change request create/start/fix/reject/reassign/close
  - invalidate `change-requests`
- order issue update/close
  - invalidate `order-issues`
- team create/update/delete
  - invalidate `teams`

The operating principle is:

> Invalidate the smallest domain that can become stale.

## State Flow

### Local page state

Most pages still use signals for:

- `loading`
- `saving`
- `error`
- `items`
- `total`
- paging
- selection
- modal state

### Shared state

Current shared stores/services:

- `AuthService`
- `ReferenceDataService`
- `SessionCacheService`
- `WorkspaceSyncService`

### Workspace sync

`WorkspaceSyncService` is intentionally lightweight and remains a version-signal broadcaster.

Current channels:

- products
- settings
- users
- orders
- change requests

It is not a full store. It only tells interested pages that a shared area changed.

## Pagination Rules

All list pages should assume server-side pagination.

Contract:

- `page`
- `limit`
- `total`
- `hasMore`

Default page sizes in the UI:

- normal lists: `30`
- dense/admin variants: `50`
- large export fetches: `100`

Current paginated surfaces include:

- users
- assignments
- products
- queue
- orders
- order issues
- change requests
- accounts
- audit/activity

## Export Strategy

Exports fetch filtered data in batches:

1. request page 1
2. read `total` and `limit`
3. request remaining pages
4. merge in memory
5. build final `.xlsx`

This keeps exports accurate even when the visible table only shows a subset of the data.

## Order And Issue Modules

### Orders

Orders are now linked to:

- product
- hunter
- lister
- account

Order list/stats/report reads are cached in the `orders` namespace with short TTL and cleared after order mutations.

### Order issues

Order issues now flow into:

- hunter issue visibility
- lister product change requests
- listing blocker state
- admin oversight

The lister block-status call is cached briefly and invalidated when change requests move.

## Role Hierarchy

- `super_admin`
  - full system access
- `admin`
  - operational control
- `order_processor`
  - order entry and lifecycle updates
- `lister`
  - listing queue and product fixes
- `hunter`
  - product submission, product review, own issues/orders visibility

## Audit Findings

### High-impact issues found

- repeated reference-data fetches across role pages
- pages using refresh plus full manual reload after mutations
- duplicate long-lived subscriptions created by re-running setup methods
- order and queue pages reloading whole sections after single-row mutations
- legacy services bypassing the newer API layer
- pages holding onto stale subscriptions because refresh was tied to re-subscribing

### Fixed in this pass

- added shared request cache with TTL + deduplication
- restored refreshable cached reference streams
- added session-scoped user context cache
- cached high-traffic GETs in orders, products, dashboards, change requests, system settings, accounts, users, audit, teams
- removed redundant `loadAccounts()` refetches after admin account mutations
- removed repeated reference-data subscription setup inside order management facade
- updated team management to apply local state changes instead of hard reloading after save/delete
- moved admin settings onto the newer `AdminApiService`

## Request Reduction Report

These counts come from the audited code paths after the cleanup, comparing the previous behavior to the new behavior for common same-session navigation and mutation flows.

### Login bootstrap

- before: 5 to 7 role/context fetches across route transitions
- after: 2 to 4 network calls on first session hydrate, then cache reuse for route changes

### Lister queue open

- before: assigned hunters + accounts + queue + block status, then full queue reload again after mark listed
- after: same initial shape on cold load, but assigned hunters/accounts reuse cache and mark-listed updates the row locally

Estimated request change:

- before: 4 initial + 1 full queue reload after each list action
- after: 2 to 4 initial on cold open, 0 same-page reload after each list action

### Admin accounts mutation

- before: mutation + `refreshAccounts()` + manual `loadAccounts()` resubscribe/fetch
- after: mutation + targeted account cache invalidation + existing subscription refresh

Estimated request change:

- before: 2 account refresh paths after each mutation
- after: 1 refresh path after each mutation

### Orders workspace

- before: repeated reference-data subscriptions on each configure call plus full list/stat reload habits
- after: one reference-data subscription setup per facade instance, cached list/stat reads, targeted row updates after mutations

Estimated request change:

- before: 4 to 6 calls when bouncing between processor order subroutes
- after: 2 to 3 calls on cold open, cache reuse on subroute changes

### Team management

- before: save/delete triggered full team list reload
- after: save/delete update local team state and invalidate team cache for future readers

## Developer Guidance

When adding a new feature:

1. start in `core/api`
2. add cache namespace and TTL if the read is reusable
3. invalidate by domain, not globally
4. keep components thin
5. prefer a facade or shared state service for page orchestration
6. use `PageResult<T>` for list contracts
7. never export just the visible page

## Future Scaling Notes

- continue migrating legacy admin/superadmin pages away from `core/services/*` wrappers and into `core/api + facade`
- add query-keyed state stores for the busiest list surfaces if the app grows further
- move dashboard/report aggregate endpoints toward dedicated summary APIs wherever frontend pages still mix preview rows and stats
- consider virtual scroll for very dense processor/listing grids
- consider background refresh policies for live operational views like order processor and listing queue
