export const CACHE_TTL = {
  short: 15_000,
  medium: 60_000,
  long: 5 * 60_000,
} as const;

export const CACHE_NAMESPACE = {
  users: 'users',
  accounts: 'accounts',
  criteria: 'criteria',
  dashboards: 'dashboards',
  orders: 'orders',
  products: 'products',
  assignedHunters: 'assigned-hunters',
  changeRequests: 'change-requests',
  orderIssues: 'order-issues',
  system: 'system',
  teams: 'teams',
  audit: 'audit',
  reports: 'reports',
  categories: 'categories',
} as const;

export const makeCacheKey = (namespace: string, params?: unknown): string =>
  params === undefined ? namespace : `${namespace}:${stableSerialize(params)}`;

const stableSerialize = (value: unknown): string => JSON.stringify(sortValue(value));

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
};
