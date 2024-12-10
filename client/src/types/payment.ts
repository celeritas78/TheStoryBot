import type { PaymentIntent, StripeError } from '@stripe/stripe-js';

export interface PaymentFormData {
  amount: number;
}

export interface CreatePaymentResponse {
  clientSecret: string;
  transactionId: number;
  amount: number;
  currency: string;
}

export interface PaymentError {
  message: string;
  code?: string;
  decline_code?: string;
  type?: string;
}

export interface PaymentConfirmationResponse {
  success: boolean;
  credits: number;
  isPremium: boolean;
}

export type PaymentStatus = 'idle' | 'processing' | 'succeeded' | 'failed' | 'requires_action';

export interface PaymentState {
  status: PaymentStatus;
  error: PaymentError | null;
  clientSecret: string | null;
  amount: number | null;
  transactionId: number | null;
}

export interface StripePaymentResult {
  error?: StripeError;
  paymentIntent?: PaymentIntent | null;
}

export interface StripePaymentConfirmation {
  error?: StripeError;
}
