import { AuditLogEntry } from '../services/admin.service';

export interface AuditLogRowViewModel {
  id: string;
  actionLabel: string;
  actorLabel: string;
  roleLabel: string;
  targetLabel: string;
  createdAtLabel: string;
  detailsLabel: string;
}

const humanizeKey = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\bid\b/gi, 'ID')
    .replace(/\bids\b/gi, 'IDs')
    .replace(/^./, (char) => char.toUpperCase());

const formatDetailValue = (key: string, value: unknown): string => {
  if (Array.isArray(value)) {
    return `${value.length} selected`;
  }

  const text = String(value);

  if (/(^|[._])(?:id|ids)$/i.test(key) && text.length > 20) {
    return 'updated';
  }

  return text;
};

const detailsLabel = (log: AuditLogEntry): string => {
  if (!log.details) {
    return 'No extra details';
  }

  if (log.action === 'account.assignment.update') {
    const count = Array.isArray(log.details['listerIds']) ? log.details['listerIds'].length : null;
    return count ? `${count} lister assignment${count === 1 ? '' : 's'} updated.` : 'Lister access updated for this account.';
  }

  if (log.action === 'auth.login') {
    return 'Successful sign-in.';
  }

  const entries = Object.entries(log.details).filter(([, value]) => value !== null && value !== undefined && value !== '');

  if (!entries.length) {
    return 'No extra details';
  }

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${humanizeKey(key)}: ${formatDetailValue(key, value)}`)
    .join(' | ');
};

const targetLabel = (log: AuditLogEntry): string => {
  if (log.targetType === 'product') {
    return log.productTitle || log.productAsin || 'Product';
  }

  if (log.targetType === 'account') {
    return log.accountName || 'Account';
  }

  return log.targetName || log.targetEmail || 'Not set';
};

const actionLabel = (action: string): string =>
  action
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const mapAuditLogRow = (log: AuditLogEntry): AuditLogRowViewModel => ({
  id: log.id,
  actionLabel: actionLabel(log.action),
  actorLabel: log.actorName || log.actorEmail || 'System',
  roleLabel: log.actorRole ? log.actorRole.replace('_', ' ') : 'System',
  targetLabel: targetLabel(log),
  createdAtLabel: log.createdAt,
  detailsLabel: detailsLabel(log),
});
