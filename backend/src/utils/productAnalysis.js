const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toInteger = (value) => {
  const number = toNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
};

const toBoolean = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no"].includes(normalized)) {
      return false;
    }
  }

  return Boolean(value);
};

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
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
  hostnameMatches(
    value,
    (hostname) => hostname.includes("amazon.") || hostname.includes("amzn."),
  );

const isEbayUrl = (value) =>
  hostnameMatches(value, (hostname) => hostname.includes("ebay."));

const calculateEconomics = (input, criteria) => {
  const hasPrices = input.amazonPrice !== null && input.ebayPrice !== null;

  if (!hasPrices) {
    return {
      hasPrices: false,
      fees: 0,
      profit: 0,
      roi: 0,
    };
  }

  const fees = Number(
    ((input.ebayPrice * criteria.feePercent) / 100).toFixed(2),
  );
  const profit = Number(
    (input.ebayPrice - input.amazonPrice - fees).toFixed(2),
  );
  const roi =
    input.amazonPrice > 0
      ? Number(((profit / input.amazonPrice) * 100).toFixed(2))
      : 0;

  return {
    hasPrices,
    fees,
    profit,
    roi,
  };
};

const getQualityLabel = (input, criteria, analysis) => {
  if (!analysis || analysis.status === "rejected") {
    return "Rejected";
  }

  let strongSignals = 0;
  const strongChecks = [
    analysis.roi >= Math.max(criteria.minRoi + 15, criteria.minRoi * 1.35, 35),
    analysis.profit >=
      Math.max(criteria.minProfit + 5, criteria.minProfit * 1.5, 5),
    (input.salesLastTwoMonths || 0) >=
      Math.max(
        criteria.minSalesLastTwoMonths + 12,
        criteria.minSalesLastTwoMonths * 1.4,
        12,
      ),
    (input.amazonStockCount || 0) >=
      Math.max(criteria.minStockCount + 4, criteria.minStockCount * 1.3, 12),
    (input.rating || 0) >= Math.max(criteria.minRating + 0.5, 4.2),
  ];

  strongSignals = strongChecks.filter(Boolean).length;

  if (strongSignals >= 4) {
    return "Best Hunt";
  }

  if (strongSignals >= 2) {
    return "Good Hunt";
  }

  return "Avg Hunt";
};

const getPrimaryValidationFailure = (notes = []) =>
  notes.find((note) => !note.passed)?.message ||
  "This product did not pass the current rules.";

const extractAsin = (amazonUrl) => {
  if (!amazonUrl) {
    return "";
  }

  const trimmed = String(amazonUrl).trim();
  const pathMatch = trimmed.match(
    /\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?]|$)/i,
  );

  if (pathMatch) {
    return pathMatch[1].toUpperCase();
  }

  try {
    const parsed = new URL(trimmed);
    const asinParam =
      parsed.searchParams.get("asin") || parsed.searchParams.get("ASIN");
    return asinParam && /^[A-Z0-9]{10}$/i.test(asinParam)
      ? asinParam.toUpperCase()
      : "";
  } catch (error) {
    return "";
  }
};

const normalizeProductPayload = (payload = {}) => ({
  title: String(payload.title || "").trim(),
  category: String(payload.category || "").trim(),
  asin: String(payload.asin || extractAsin(payload.amazonUrl))
    .trim()
    .toUpperCase(),
  amazonUrl: String(payload.amazonUrl || "").trim(),
  amazonAltUrl: String(payload.amazonAltUrl || "").trim(),
  ebayUrl: String(payload.ebayUrl || "").trim(),
  customLabel: String(payload.customLabel || "").trim(),
  amazonStockCount: toInteger(
    payload.amazonStockCount ?? payload.stockQuantity,
  ),
  alternateAmazonStockCount: toInteger(
    payload.alternateAmazonStockCount ?? payload.alternateStockQuantity,
  ),
  soldCount: toInteger(payload.soldCount),
  rating: toNumber(payload.rating),
  productWatchers: toInteger(payload.productWatchers),
  salesLastTwoMonths: toInteger(payload.salesLastTwoMonths),
  basketCount: toInteger(payload.basketCount),
  amazonPrice: toNumber(payload.amazonPrice),
  ebayPrice: toNumber(payload.ebayPrice),
  deliveryDays: toInteger(payload.deliveryDays),
  monthlyGraphUptrend: toBoolean(payload.monthlyGraphUptrend),
});

const analyzeProduct = (input, criteria, options = {}) => {
  const notes = [];
  const addNote = (rule, passed, message) => {
    notes.push({ rule, passed, message });
  };

  const amazonUrlValid =
    isHttpUrl(input.amazonUrl) && isAmazonUrl(input.amazonUrl);
  const amazonAltUrlValid =
    !input.amazonAltUrl ||
    (isHttpUrl(input.amazonAltUrl) && isAmazonUrl(input.amazonAltUrl));
  const ebayUrlValid = isHttpUrl(input.ebayUrl) && isEbayUrl(input.ebayUrl);
  const { hasPrices, fees, profit, roi } = calculateEconomics(input, criteria);

  addNote("title", Boolean(input.title), "Product title is required.");
  addNote(
    "amazon_url",
    amazonUrlValid,
    "Amazon product link must be a valid Amazon URL.",
  );
  addNote(
    "category",
    !criteria.categoryRequired || Boolean(input.category),
    "Category is required for this hunting criteria.",
  );
  addNote(
    "amazon_alt_url",
    (!criteria.amazonAltUrlRequired && amazonAltUrlValid) ||
      (criteria.amazonAltUrlRequired && Boolean(input.amazonAltUrl) && amazonAltUrlValid),
    criteria.amazonAltUrlRequired
      ? "Amazon alternate link is required and must be a valid Amazon URL."
      : "Amazon alternate link must be a valid Amazon URL when provided.",
  );
  addNote(
    "ebay_url",
    ebayUrlValid,
    "eBay product link must be a valid eBay URL.",
  );
  addNote(
    "asin",
    !criteria.asinRequired || Boolean(input.asin),
    "ASIN is required for this hunting criteria.",
  );
  addNote(
    "duplicate_asin",
    !options.hasDuplicateAsin,
    "ASIN already exists in the product queue.",
  );
  addNote(
    "custom_label",
    !criteria.customLabelRequired || Boolean(input.customLabel),
    "Custom label is required for this hunting criteria.",
  );
  addNote(
    "amazon_stock_count",
    input.amazonStockCount !== null &&
      input.amazonStockCount >= criteria.minStockCount,
    `Amazon stock count must be at least ${criteria.minStockCount}.`,
  );
  addNote(
    "alternate_stock_count",
    input.alternateAmazonStockCount === null ||
      input.alternateAmazonStockCount >= criteria.minAlternateStockCount,
    `Alternate Amazon stock count must be at least ${criteria.minAlternateStockCount} when provided.`,
  );
  addNote(
    "sold_count",
    input.soldCount !== null && input.soldCount >= criteria.minSoldCount,
    `Sold count must be a whole number and at least ${criteria.minSoldCount}.`,
  );
  addNote(
    "rating",
    input.rating !== null && input.rating >= criteria.minRating,
    `Rating must be at least ${criteria.minRating}.`,
  );
  addNote(
    "product_watchers",
    (!criteria.watchersRequired && input.productWatchers === null) ||
      (input.productWatchers !== null &&
        input.productWatchers >= criteria.minWatcherCount),
    criteria.watchersRequired
      ? `Product watchers are required and must be at least ${criteria.minWatcherCount}.`
      : `Product watchers must be at least ${criteria.minWatcherCount} when provided.`,
  );
  addNote(
    "sales_last_two_months",
    input.salesLastTwoMonths !== null &&
      input.salesLastTwoMonths >= criteria.minSalesLastTwoMonths,
    `Minimum sales in the past one month must be at least ${criteria.minSalesLastTwoMonths}.`,
  );
  addNote(
    "basket_count",
    !criteria.basketCountRequired || input.basketCount !== null,
    "Basket count is required for this hunting criteria.",
  );
  addNote(
    "delivery_days",
    (!criteria.deliveryDaysRequired && input.deliveryDays === null) ||
      (input.deliveryDays !== null &&
        input.deliveryDays <= criteria.maxDeliveryDays),
    criteria.deliveryDaysRequired
      ? `Delivery days are required and must be ${criteria.maxDeliveryDays} days or less.`
      : `Delivery days must be ${criteria.maxDeliveryDays} days or less when provided.`,
  );
  addNote(
    "monthly_graph_uptrend",
    !criteria.monthlyGraphRequired || input.monthlyGraphUptrend === true,
    "One month graph must show an up-price trend.",
  );
  addNote(
    "prices",
    hasPrices && input.amazonPrice > 0 && input.ebayPrice > 0,
    "Amazon and eBay prices must be positive numbers.",
  );
  addNote(
    "profit",
    profit >= criteria.minProfit,
    `Profit must be at least ${criteria.minProfit}.`,
  );
  addNote(
    "roi",
    roi >= criteria.minRoi,
    `ROI must be at least ${criteria.minRoi}%.`,
  );

  const failures = notes.filter((note) => !note.passed);
  const status = failures.length === 0 ? "approved" : "rejected";
  const rejectionReason =
    status === "rejected"
      ? failures.map((failure) => failure.message).join(" ")
      : null;
  const qualityLabel = getQualityLabel(input, criteria, {
    status,
    profit,
    roi,
  });

  return {
    fees,
    profit,
    roi,
    status,
    rejectionReason,
    primaryFailure: getPrimaryValidationFailure(notes),
    qualityLabel,
    validationNotes: notes,
  };
};

module.exports = {
  extractAsin,
  normalizeProductPayload,
  analyzeProduct,
  isAmazonUrl,
  isEbayUrl,
  calculateEconomics,
  getQualityLabel,
  getPrimaryValidationFailure,
};
