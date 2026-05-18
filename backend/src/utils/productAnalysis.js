const { env } = require('../config/env');

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

const extractAsin = (amazonUrl) => {
  if (!amazonUrl) {
    return '';
  }

  const trimmed = String(amazonUrl).trim();
  const pathMatch = trimmed.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);

  if (pathMatch) {
    return pathMatch[1].toUpperCase();
  }

  try {
    const parsed = new URL(trimmed);
    const asinParam = parsed.searchParams.get('asin') || parsed.searchParams.get('ASIN');
    return asinParam && /^[A-Z0-9]{10}$/i.test(asinParam) ? asinParam.toUpperCase() : '';
  } catch (error) {
    return '';
  }
};

const normalizeProductPayload = (payload = {}) => ({
  amazonUrl: String(payload.amazonUrl || '').trim(),
  ebayUrl: String(payload.ebayUrl || '').trim(),
  asin: String(payload.asin || extractAsin(payload.amazonUrl)).trim().toUpperCase(),
  title: String(payload.title || '').trim(),
  amazonPrice: toNumber(payload.amazonPrice),
  ebayPrice: toNumber(payload.ebayPrice),
  fees: toNumber(payload.fees) || 0,
  stockQuantity: toNumber(payload.stockQuantity),
  deliveryDays: toNumber(payload.deliveryDays),
});

const analyzeProduct = (input, options = {}) => {
  const notes = [];
  const addNote = (rule, passed, message) => {
    notes.push({ rule, passed, message });
  };

  const amazonUrlValid = isHttpUrl(input.amazonUrl);
  const ebayUrlValid = isHttpUrl(input.ebayUrl);
  const hasPrices = input.amazonPrice !== null && input.ebayPrice !== null;
  const profit = hasPrices ? Number((input.ebayPrice - input.amazonPrice - input.fees).toFixed(2)) : 0;
  const roi =
    hasPrices && input.amazonPrice > 0
      ? Number(((profit / input.amazonPrice) * 100).toFixed(2))
      : 0;

  addNote('amazon_url', amazonUrlValid, 'Amazon product link must be a valid URL.');
  addNote('ebay_url', ebayUrlValid, 'eBay product link must be a valid URL.');
  addNote('asin', Boolean(input.asin), 'ASIN should be present or parseable from the Amazon URL.');
  addNote('duplicate_asin', !options.hasDuplicateAsin, 'ASIN already exists in the product queue.');
  addNote('prices', hasPrices && input.amazonPrice > 0 && input.ebayPrice > 0, 'Prices must be positive numbers.');
  addNote('profit', profit >= env.validation.minProfit, `Profit must be at least ${env.validation.minProfit}.`);
  addNote('roi', roi >= env.validation.minRoi, `ROI must be at least ${env.validation.minRoi}%.`);
  addNote(
    'stock',
    input.stockQuantity !== null && input.stockQuantity >= env.validation.minStock,
    `Stock must be at least ${env.validation.minStock}.`,
  );
  addNote(
    'delivery',
    input.deliveryDays !== null && input.deliveryDays <= env.validation.maxDeliveryDays,
    `Delivery must be ${env.validation.maxDeliveryDays} days or less.`,
  );

  const failures = notes.filter((note) => !note.passed);

  return {
    profit,
    roi,
    status: failures.length === 0 ? 'approved' : 'rejected',
    rejectionReason: failures.map((failure) => failure.message).join(' '),
    validationNotes: notes,
  };
};

module.exports = {
  extractAsin,
  normalizeProductPayload,
  analyzeProduct,
};
