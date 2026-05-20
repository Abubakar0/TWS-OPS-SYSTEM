const toNumber = (value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toInteger = (value) => {
  const number = toNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
};

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

const hostnameMatches = (value, matcher) => {
  try {
    const parsed = new URL(String(value).trim());
    return matcher(parsed.hostname.toLowerCase());
  } catch (error) {
    return false;
  }
};

const isAmazonUrl = (value) =>
  hostnameMatches(value, (hostname) => hostname.includes('amazon.') || hostname.includes('amzn.'));

const isEbayUrl = (value) => hostnameMatches(value, (hostname) => hostname.includes('ebay.'));

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
  title: String(payload.title || '').trim(),
  asin: String(payload.asin || extractAsin(payload.amazonUrl)).trim().toUpperCase(),
  amazonUrl: String(payload.amazonUrl || '').trim(),
  amazonAltUrl: String(payload.amazonAltUrl || '').trim(),
  ebayUrl: String(payload.ebayUrl || '').trim(),
  customLabel: String(payload.customLabel || '').trim(),
  amazonStockCount: toInteger(payload.amazonStockCount ?? payload.stockQuantity),
  alternateAmazonStockCount: toInteger(
    payload.alternateAmazonStockCount ?? payload.alternateStockQuantity,
  ),
  soldCount: toInteger(payload.soldCount),
  rating: toNumber(payload.rating),
  productWatchers: toInteger(payload.productWatchers),
  salesLastTwoMonths: toInteger(payload.salesLastTwoMonths),
  amazonPrice: toNumber(payload.amazonPrice),
  ebayPrice: toNumber(payload.ebayPrice),
  deliveryDays: toInteger(payload.deliveryDays),
});

const analyzeProduct = (input, criteria, options = {}) => {
  const notes = [];
  const addNote = (rule, passed, message) => {
    notes.push({ rule, passed, message });
  };

  const amazonUrlValid = isHttpUrl(input.amazonUrl) && isAmazonUrl(input.amazonUrl);
  const amazonAltUrlValid =
    !input.amazonAltUrl || (isHttpUrl(input.amazonAltUrl) && isAmazonUrl(input.amazonAltUrl));
  const ebayUrlValid = isHttpUrl(input.ebayUrl) && isEbayUrl(input.ebayUrl);
  const hasPrices = input.amazonPrice !== null && input.ebayPrice !== null;
  const fees = hasPrices ? Number(((input.ebayPrice * criteria.feePercent) / 100).toFixed(2)) : 0;
  const profit = hasPrices ? Number((input.ebayPrice - input.amazonPrice - fees).toFixed(2)) : 0;
  const roi =
    hasPrices && input.amazonPrice > 0
      ? Number(((profit / input.amazonPrice) * 100).toFixed(2))
      : 0;

  addNote('title', Boolean(input.title), 'Product title is required.');
  addNote('amazon_url', amazonUrlValid, 'Amazon product link must be a valid Amazon URL.');
  addNote(
    'amazon_alt_url',
    amazonAltUrlValid,
    'Amazon alternate link must be a valid Amazon URL when provided.',
  );
  addNote('ebay_url', ebayUrlValid, 'eBay product link must be a valid eBay URL.');
  addNote('asin', !criteria.asinRequired || Boolean(input.asin), 'ASIN is required for this hunting criteria.');
  addNote('duplicate_asin', !options.hasDuplicateAsin, 'ASIN already exists in the product queue.');
  addNote(
    'custom_label',
    !criteria.customLabelRequired || Boolean(input.customLabel),
    'Custom label is required for this hunting criteria.',
  );
  addNote(
    'amazon_stock_count',
    input.amazonStockCount !== null && input.amazonStockCount >= criteria.minStockCount,
    `Amazon stock count must be at least ${criteria.minStockCount}.`,
  );
  addNote(
    'alternate_stock_count',
    input.alternateAmazonStockCount === null ||
      input.alternateAmazonStockCount >= criteria.minAlternateStockCount,
    `Alternate Amazon stock count must be at least ${criteria.minAlternateStockCount} when provided.`,
  );
  addNote(
    'sold_count',
    input.soldCount !== null && input.soldCount >= criteria.minSoldCount,
    `Sold count must be a whole number and at least ${criteria.minSoldCount}.`,
  );
  addNote(
    'rating',
    input.rating !== null && input.rating >= criteria.minRating,
    `Rating must be at least ${criteria.minRating}.`,
  );
  addNote(
    'product_watchers',
    (!criteria.watchersRequired && input.productWatchers === null) ||
      (input.productWatchers !== null && input.productWatchers >= criteria.minWatcherCount),
    criteria.watchersRequired
      ? `Product watchers are required and must be at least ${criteria.minWatcherCount}.`
      : `Product watchers must be at least ${criteria.minWatcherCount} when provided.`,
  );
  addNote(
    'sales_last_two_months',
    input.salesLastTwoMonths !== null && input.salesLastTwoMonths >= criteria.minSalesLastTwoMonths,
    `Minimum sales in the past two months must be at least ${criteria.minSalesLastTwoMonths}.`,
  );
  addNote(
    'prices',
    hasPrices && input.amazonPrice > 0 && input.ebayPrice > 0,
    'Amazon and eBay prices must be positive numbers.',
  );
  addNote('profit', profit >= criteria.minProfit, `Profit must be at least ${criteria.minProfit}.`);
  addNote('roi', roi >= criteria.minRoi, `ROI must be at least ${criteria.minRoi}%.`);

  const failures = notes.filter((note) => !note.passed);

  return {
    fees,
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
