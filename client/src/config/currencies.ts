import type { CurrencyCode, CurrencyInfo } from '../types/payment';

// This should match the server configuration in server/config.ts
export const SUPPORTED_CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  usd: {
    code: 'usd',
    symbol: '$',
    name: 'US Dollar',
    creditsPerUnit: 1, // 1 USD = 1 credit
    minAmount: 1,
    maxAmount: 100
  },
  eur: {
    code: 'eur',
    symbol: '€',
    name: 'Euro',
    creditsPerUnit: 1.1, // 1 EUR ≈ 1.1 credits
    minAmount: 1,
    maxAmount: 85
  },
  gbp: {
    code: 'gbp',
    symbol: '£',
    name: 'British Pound',
    creditsPerUnit: 1.25, // 1 GBP ≈ 1.25 credits
    minAmount: 1,
    maxAmount: 75
  },
  inr: {
    code: 'inr',
    symbol: '₹',
    name: 'Indian Rupee',
    creditsPerUnit: 0.012, // 1 INR ≈ 0.012 credits
    minAmount: 100,
    maxAmount: 8000
  }
} as const;
