import type { PaymentIntent, StripeError } from '@stripe/stripe-js';

export interface PaymentFormData {
  amount: number;
}

export interface CreatePaymentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  status: PaymentIntent['status'];
}

export interface PaymentStateDetails {
  creditsToAdd?: number;
  currentCredits?: number;
  projectedTotalCredits?: number;
  transactionId?: string;
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
}

export interface PaymentConfirmationResponse {
  success: boolean;
  credits: number;
  isPremium: boolean;
}

export type PaymentStatus = 
  | 'idle' 
  | 'processing' 
  | 'succeeded' 
  | 'failed' 
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action';

export interface PaymentState extends PaymentStateDetails {
  status: PaymentStatus;
  error: PaymentError | null;
  clientSecret: string | null;
  amount: number | null;
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
}

export interface CreditBalanceResponse {
  credits: number;
  isPremium: boolean;
}
