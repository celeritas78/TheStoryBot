import type { CurrencyCode, CurrencyInfo } from '../types/payment';

export const SUPPORTED_CURRENCIES: Record<string, CurrencyInfo> = {
  USD: {
    code: 'usd',
    symbol: '$',
    name: 'US Dollar',
    creditsPerUnit: 1,
    minAmount: 1,
    maxAmount: 100
  },
  EUR: {
    code: 'eur',
    symbol: '€',
    name: 'Euro',
    creditsPerUnit: 1.1,
    minAmount: 1,
    maxAmount: 85
  },
  GBP: {
    code: 'gbp',
    symbol: '£',
    name: 'British Pound',
    creditsPerUnit: 1.25,
    minAmount: 1,
    maxAmount: 75
  },
  INR: {
    code: 'inr',
    symbol: '₹',
    name: 'Indian Rupee',
    creditsPerUnit: 0.012,
    minAmount: 100,
    maxAmount: 8000
  }
} as const;
