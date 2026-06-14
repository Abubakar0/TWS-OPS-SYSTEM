const normalizeProductWorkflowFilterStatus = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return '';
  }

  switch (normalized) {
    case 'approved':
    case 'assigned':
    case 'ready_for_listing':
      return 'ready_for_listing';
    case 'rejected':
    case 'listing_rejected':
      return 'rejected';
    case 'listed_needs_review':
      return 'listed_needs_review';
    case 'listed':
      return 'listed';
    default:
      return normalized;
  }
};

module.exports = {
  normalizeProductWorkflowFilterStatus,
};
