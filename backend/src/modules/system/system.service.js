const { randomUUID } = require('crypto');
const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { writeAuditLog } = require('../users/audit.service');

const SETTING_KEYS = {
  apiLimits: 'api_limits',
  ipRestriction: 'ip_restriction',
};

const DEFAULT_API_LIMITS = {
  users: 30,
  hunters: 30,
  listers: 30,
  products: 30,
  orders: 30,
  accounts: 30,
  reports: 100,
  assignments: 30,
  activity: 50,
  listingQueue: 30,
  rejections: 30,
};

const DEFAULT_IP_RESTRICTION = {
  enabled: false,
  allowedIps: [],
};

const settingsCache = new Map();
const CACHE_TTL_MS = 30_000;
let ensureTablePromise = null;

const sanitizeLimitValue = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, 10), 200);
};

const sanitizeApiLimits = (value = {}) =>
  Object.fromEntries(
    Object.entries(DEFAULT_API_LIMITS).map(([key, fallback]) => [key, sanitizeLimitValue(value[key], fallback)]),
  );

const normalizeIp = (input) => {
  const value = String(input || '')
    .trim()
    .replace(/^::ffff:/i, '')
    .replace(/^\[|\]$/g, '');

  if (!value) {
    return '';
  }

  return value;
};

const sanitizeAllowedIps = (allowedIps = []) =>
  (Array.isArray(allowedIps) ? allowedIps : [])
    .map((entry) => ({
      id: entry?.id || randomUUID(),
      ip: normalizeIp(entry?.ip),
      label: String(entry?.label || '').trim() || 'Allowed IP',
      active: entry?.active !== false,
    }))
    .filter((entry) => Boolean(entry.ip));

const sanitizeIpRestriction = (value = {}) => ({
  enabled: Boolean(value.enabled),
  allowedIps: sanitizeAllowedIps(value.allowedIps),
});

const normalizeSettingRow = (key, value) => {
  if (key === SETTING_KEYS.apiLimits) {
    return sanitizeApiLimits(value);
  }

  if (key === SETTING_KEYS.ipRestriction) {
    return sanitizeIpRestriction(value);
  }

  return value || {};
};

const ensureSystemSettingsTable = async () => {
  if (!ensureTablePromise) {
    ensureTablePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_by UUID NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  return ensureTablePromise;
};

const getSetting = async (key, fallback) => {
  await ensureSystemSettingsTable();
  const cached = settingsCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const result = await pool.query('SELECT value FROM system_settings WHERE key = $1 LIMIT 1', [key]);
  const value = result.rows[0]?.value ? normalizeSettingRow(key, result.rows[0].value) : fallback;

  settingsCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return value;
};

const saveSetting = async (user, key, value) => {
  await ensureSystemSettingsTable();
  const result = await pool.query(
    `
      INSERT INTO system_settings (key, value, updated_by, updated_at)
      VALUES ($1, $2::jsonb, $3, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      RETURNING value
    `,
    [key, JSON.stringify(value), user?.id || null],
  );

  const normalizedValue = normalizeSettingRow(key, result.rows[0]?.value || value);
  settingsCache.delete(key);

  return normalizedValue;
};

const getApiLimits = async () => getSetting(SETTING_KEYS.apiLimits, DEFAULT_API_LIMITS);

const getConfiguredLimit = async (category, requestedLimit) => {
  const limits = await getApiLimits();
  const configuredLimit = limits[category] || DEFAULT_API_LIMITS[category] || DEFAULT_API_LIMITS.products;

  if (requestedLimit === undefined || requestedLimit === null || requestedLimit === '') {
    return configuredLimit;
  }

  return Math.min(sanitizeLimitValue(requestedLimit, configuredLimit), configuredLimit);
};

const updateApiLimits = async (user, payload = {}) => {
  const next = sanitizeApiLimits(payload);
  const saved = await saveSetting(user, SETTING_KEYS.apiLimits, next);

  await writeAuditLog({
    actorUserId: user.id,
    action: 'settings.api_limits.update',
    targetType: 'system',
    targetId: user.id,
    details: saved,
  });

  return saved;
};

const getIpRestriction = async () => getSetting(SETTING_KEYS.ipRestriction, DEFAULT_IP_RESTRICTION);

const updateIpRestriction = async (user, payload = {}) => {
  const next = sanitizeIpRestriction(payload);
  const saved = await saveSetting(user, SETTING_KEYS.ipRestriction, next);

  await writeAuditLog({
    actorUserId: user.id,
    action: 'settings.ip_restriction.update',
    targetType: 'system',
    targetId: user.id,
    details: {
      enabled: saved.enabled,
      allowedIpCount: saved.allowedIps.length,
    },
  });

  return saved;
};

const getCurrentRequestIp = (req) => {
  const forwarded = req.get('x-forwarded-for');

  if (forwarded) {
    return normalizeIp(forwarded.split(',')[0]);
  }

  return normalizeIp(req.ip || req.socket?.remoteAddress || '');
};

const evaluateIpRestriction = async (user, req) => {
  const settings = await getIpRestriction();
  const currentIp = getCurrentRequestIp(req);
  const activeIps = settings.allowedIps.filter((entry) => entry.active);

  if (user?.role === 'super_admin' || !settings.enabled) {
    return {
      allowed: true,
      currentIp,
      settings,
      warning: settings.enabled && activeIps.length === 0 ? 'No allowed IP configured. System currently open.' : '',
    };
  }

  if (activeIps.length === 0) {
    return {
      allowed: true,
      currentIp,
      settings,
      warning: 'No allowed IP configured. System currently open.',
    };
  }

  const allowed = activeIps.some((entry) => entry.ip === currentIp);

  return {
    allowed,
    currentIp,
    settings,
    warning: '',
  };
};

const assertIpAllowed = async (user, req) => {
  const evaluation = await evaluateIpRestriction(user, req);

  if (!evaluation.allowed) {
    throw new AppError('Access restricted. Please connect from office network or contact admin.', 403);
  }

  return evaluation;
};

const getSystemSettings = async (req) => {
  const [apiLimits, ipRestriction] = await Promise.all([getApiLimits(), getIpRestriction()]);
  const currentIp = getCurrentRequestIp(req);
  const activeIps = ipRestriction.allowedIps.filter((entry) => entry.active);

  return {
    apiLimits,
    ipRestriction,
    currentIp,
    ipRestrictionWarning:
      ipRestriction.enabled && activeIps.length === 0 ? 'No allowed IP configured. System currently open.' : '',
  };
};

module.exports = {
  DEFAULT_API_LIMITS,
  DEFAULT_IP_RESTRICTION,
  getApiLimits,
  getConfiguredLimit,
  updateApiLimits,
  getIpRestriction,
  updateIpRestriction,
  getCurrentRequestIp,
  evaluateIpRestriction,
  assertIpAllowed,
  getSystemSettings,
};
