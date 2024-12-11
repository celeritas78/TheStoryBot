import type { PaymentIntent, StripeError } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';

export interface PaymentFormData {
  amount: number;
}

export interface CreatePaymentResponse extends Omit<PaymentIntent, 'status'> {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  status: Stripe.PaymentIntent.Status;
  creditsToAdd: number;
  currentCredits: number;
  projectedTotalCredits: number;
  transactionId: number;
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

export interface PaymentState {
  status: PaymentStatus;
  error: PaymentError | null;
  clientSecret: string | null;
  amount: number | null;
  transactionId: number | null;
  creditsToAdd: number | null;
  currentCredits: number | null;
  projectedTotalCredits: number | null;
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
