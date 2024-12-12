import type { PaymentIntent, StripeError } from '@stripe/stripe-js';

// Supported currency codes
export type CurrencyCode = 'usd' | 'eur' | 'gbp' | 'inr';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  creditsPerUnit: number;
  minAmount: number;
  maxAmount: number;
}

export interface PaymentFormData {
  amount: number;
  currency: CurrencyCode;
}

// Define the base response type from server's Stripe service
export interface PaymentIntentResponse {
  clientSecret: string;
  amount: number;
  currency: CurrencyCode;
  status: PaymentIntent['status'];
  creditsToAdd: number;
  currentCredits: number;
  projectedTotalCredits: number;
  transactionId: number;
  stripePaymentId?: string;
  currencyInfo: CurrencyInfo;
  error?: {
    message: string;
    code?: string;
  };
}

// CreatePaymentResponse is the same as PaymentIntentResponse
export type CreatePaymentResponse = PaymentIntentResponse;

export interface PaymentStateDetails {
  creditsToAdd?: number;
  currentCredits?: number;
  projectedTotalCredits?: number;
  transactionId?: number;
  currency?: CurrencyCode;
  currencyInfo?: CurrencyInfo;
}

export interface PaymentError {
  message: string;
  code?: string;
  decline_code?: string;
  type?: string;
  details?: string;
  min?: number;
  max?: number;
  requested?: number;
  currency?: CurrencyCode;
}

export interface PaymentConfirmationResponse {
  success: boolean;
  credits: number;
  isPremium: boolean;
  currency: CurrencyCode;
  amount: number;
}

export type PaymentStatus = 
  | 'idle' 
  | 'processing' 
  | 'succeeded' 
  | 'failed' 
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'requires_capture'
  | 'canceled';

export interface PaymentState extends PaymentStateDetails {
  status: PaymentStatus;
  error: PaymentError | null;
  clientSecret: string | null;
  amount: number | null;
  currency: CurrencyCode;
}

export interface StripePaymentElementOptions {
  clientSecret: string;
  currency?: CurrencyCode;
  appearance?: {
    theme: 'stripe' | 'night' | 'flat';
    variables?: Record<string, string>;
  };
}

export interface StripePaymentResult {
  error?: StripeError;
  paymentIntent?: PaymentIntent | null;
}

export interface StripePaymentConfirmation {
  error?: StripeError;
  paymentIntent?: PaymentIntent;
}

export interface CreditPurchaseError {
  error: string;
  details?: string;
  min?: number;
  max?: number;
  requested?: number;
  currency?: CurrencyCode;
}

export interface CreditBalanceResponse {
  credits: number;
  isPremium: boolean;
}

export interface CurrencyOption {
  value: CurrencyCode;
  label: string;
  symbol: string;
  minAmount: number;
  maxAmount: number;
  creditsPerUnit: number;
}
