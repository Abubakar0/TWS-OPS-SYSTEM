import { ValidationErrors, ValidatorFn } from '@angular/forms';

export const marketplaceUrlValidator = (marketplace: 'amazon' | 'ebay'): ValidatorFn => (control) => {
  if (!control.value) {
    return null;
  }

  try {
    const parsed = new URL(String(control.value).trim());
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';

    if (!isHttp) {
      return { url: true };
    }

    const hostname = parsed.hostname.toLowerCase();
    const matchesMarketplace =
      marketplace === 'amazon'
        ? hostname.includes('amazon.') || hostname.includes('amzn.')
        : hostname.includes('ebay.');

    return matchesMarketplace ? null : { marketplace: true };
  } catch {
    return { url: true };
  }
};

export const listingLinkValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = String(control.value || '').trim();

  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase().includes('ebay.') ? null : { ebayUrl: true };
  } catch {
    return { ebayUrl: true };
  }
};
