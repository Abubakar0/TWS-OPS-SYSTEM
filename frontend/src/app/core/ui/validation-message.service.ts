import { Injectable } from '@angular/core';
import { AbstractControl } from '@angular/forms';

import { HuntingCriteria } from '../models/product.models';
import { SubmissionControlName } from '../../shared/forms/product-submission.form';

@Injectable({ providedIn: 'root' })
export class ValidationMessageService {
  submissionFieldError(
    control: AbstractControl | null,
    field: SubmissionControlName,
    criteria: HuntingCriteria,
    touched: boolean,
  ): string {
    if (!control || !touched) {
      return '';
    }

    if (control.hasError('required')) {
      switch (field) {
        case 'title':
          return 'Product title is required.';
        case 'amazonUrl':
          return 'Amazon link is required.';
        case 'ebayUrl':
          return 'eBay link is required.';
        case 'customLabel':
          return 'Custom label is required by the current admin settings.';
        case 'amazonStockCount':
          return 'Amazon stock count is required.';
        case 'soldCount':
          return 'Sold count is required.';
        case 'rating':
          return 'Rating is required.';
        case 'productWatchers':
          return 'Product watchers are required by the current admin settings.';
        case 'salesLastTwoMonths':
          return 'Sales in the past two months are required.';
        case 'basketCount':
          return 'Basket count is required by the current admin settings.';
        case 'deliveryDays':
          return 'Delivery days are required by the current admin settings.';
        case 'monthlyGraphUptrend':
          return 'Choose whether the one month graph is in an up-price trend.';
        case 'amazonPrice':
          return 'Amazon price is required.';
        case 'ebayPrice':
          return 'eBay price is required.';
        default:
          return 'This field is required.';
      }
    }

    if (control.hasError('url')) {
      return 'Enter a valid http or https URL.';
    }

    if (control.hasError('marketplace')) {
      return field === 'ebayUrl' ? 'Enter a valid eBay URL.' : 'Enter a valid Amazon URL.';
    }

    if (control.hasError('integer')) {
      return 'Whole numbers only.';
    }

    if (control.hasError('decimal')) {
      return 'Use numbers with up to 2 decimal places.';
    }

    if (control.hasError('asin')) {
      return 'Enter a valid 10-character ASIN.';
    }

    if (control.hasError('email')) {
      return 'Enter a valid email address.';
    }

    if (control.hasError('minlength')) {
      return field === 'customLabel' ? 'Use a longer value.' : 'Password must be at least 8 characters.';
    }

    if (control.hasError('min')) {
      switch (field) {
        case 'amazonStockCount':
          return `Minimum stock is ${criteria.minStockCount}.`;
        case 'alternateAmazonStockCount':
          return `Minimum alternate stock is ${criteria.minAlternateStockCount}.`;
        case 'soldCount':
          return `Minimum sold count is ${criteria.minSoldCount}.`;
        case 'rating':
          return `Minimum rating is ${criteria.minRating}.`;
        case 'productWatchers':
          return `Minimum watcher count is ${criteria.minWatcherCount}.`;
        case 'salesLastTwoMonths':
          return `Minimum sales is ${criteria.minSalesLastTwoMonths}.`;
        case 'deliveryDays':
          return `Maximum delivery days is ${criteria.maxDeliveryDays}.`;
        case 'amazonPrice':
        case 'ebayPrice':
          return 'Enter a value greater than zero.';
        default:
          return 'Enter a valid value.';
      }
    }

    if (control.hasError('ebayUrl')) {
      return 'Enter a valid eBay URL.';
    }

    return '';
  }

  submissionHelper(field: SubmissionControlName, criteria: HuntingCriteria): string {
    switch (field) {
      case 'customLabel':
        return criteria.customLabelRequired ? 'Required by the current rules.' : 'Defaults to your name.';
      case 'amazonStockCount':
        return `Minimum ${criteria.minStockCount}.`;
      case 'alternateAmazonStockCount':
        return `Optional. Minimum ${criteria.minAlternateStockCount}.`;
      case 'soldCount':
        return `Whole number. Minimum ${criteria.minSoldCount}.`;
      case 'rating':
        return `Minimum ${criteria.minRating}.`;
      case 'productWatchers':
        return criteria.watchersRequired
          ? `Required. Minimum ${criteria.minWatcherCount}.`
          : `Optional. Minimum ${criteria.minWatcherCount}.`;
      case 'salesLastTwoMonths':
        return `Minimum ${criteria.minSalesLastTwoMonths}.`;
      case 'basketCount':
        return criteria.basketCountRequired ? 'Required for this workflow.' : 'Optional basket count.';
      case 'deliveryDays':
        return criteria.deliveryDaysRequired
          ? `Required. Maximum ${criteria.maxDeliveryDays} days.`
          : `Optional. Maximum ${criteria.maxDeliveryDays} days.`;
      case 'monthlyGraphUptrend':
        return criteria.monthlyGraphRequired
          ? 'Required. Use Yes only when the 1-month graph trends up.'
          : 'Should be using up-price trend.';
      case 'amazonPrice':
      case 'ebayPrice':
        return 'Keeps your decimals while you type.';
      default:
        return '';
    }
  }

  asinError(control: AbstractControl | null, touched: boolean): string {
    if (!control || !touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'ASIN is required to unlock the submission form.';
    }

    if (control.hasError('asin')) {
      return 'Enter a valid 10-character ASIN.';
    }

    return '';
  }

  userFieldError(control: AbstractControl | null, touched: boolean): string {
    if (!control || !touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required.';
    }

    if (control.hasError('email')) {
      return 'Enter a valid email address.';
    }

    if (control.hasError('minlength')) {
      return 'Password must be at least 8 characters.';
    }

    return '';
  }
}
