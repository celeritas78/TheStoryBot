import type { PaymentIntent, StripeError } from '@stripe/stripe-js';

export interface PaymentFormData {
  amount: number;
}

// Define the base response type from server's Stripe service
export interface PaymentIntentResponse {
  clientSecret: string;
  amount: number;
  currency: string;
  status: PaymentIntent['status'];
  creditsToAdd: number;
  currentCredits: number;
  projectedTotalCredits: number;
  transactionId: number;
  stripePaymentId?: string;
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
  | 'requires_action'
  | 'canceled'
  | 'processing'
  | 'requires_capture'
  | 'canceled';

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
