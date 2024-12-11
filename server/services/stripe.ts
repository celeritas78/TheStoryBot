import Stripe from 'stripe';
import { 
  CREDITS_PER_USD, 
  STRIPE_CURRENCY,
  STRIPE_PAYMENT_MODE,
  STRIPE_STATEMENT_DESCRIPTOR,
  STRIPE_STATEMENT_DESCRIPTOR_SUFFIX,
  STRIPE_API_VERSION
} from '../config';

// Initialize Stripe with secret key
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION as any,
  typescript: true,
  appInfo: {
    name: 'Story Credits Purchase',
    version: '1.0.0'
  }
});

export interface CreatePaymentIntentParams {
  amount: number; // Amount in USD
  userId: number;
  description?: string;
  receiptEmail?: string;
}

export interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  status: Stripe.PaymentIntent.Status;
}

export async function createPaymentIntent({ 
  amount, 
  userId, 
  description, 
  receiptEmail 
}: CreatePaymentIntentParams): Promise<PaymentIntentResponse> {
  try {
    console.log('Creating payment intent:', {
      amount,
      userId,
      amountInCents: amount * 100,
      creditsToAdd: amount * CREDITS_PER_USD,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      stripeMode: STRIPE_PAYMENT_MODE
    });

    // Amount should be in cents for Stripe
    const amountInCents = amount * 100;
    const credits = amount * CREDITS_PER_USD;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: STRIPE_CURRENCY,
      automatic_payment_methods: {
        enabled: true
      },
      metadata: {
        userId: userId.toString(),
        credits: credits.toString(),
        purpose: 'story_credits'
      },
      description: description || `Purchase ${credits} story credits`,
      receipt_email: receiptEmail,
      statement_descriptor: STRIPE_STATEMENT_DESCRIPTOR?.substring(0, 22), // Stripe limit
      statement_descriptor_suffix: STRIPE_STATEMENT_DESCRIPTOR_SUFFIX?.substring(0, 22), // Stripe limit
    });

    console.log('Payment intent created:', {
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      credits,
      status: paymentIntent.status,
      timestamp: new Date().toISOString()
    });

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    };
  } catch (error) {
    console.error('Error creating payment intent:', {
      error,
      amount,
      userId,
      timestamp: new Date().toISOString()
    });
    throw new Error('Failed to create payment intent');
  }
}

export async function confirmPaymentIntent(paymentIntentId: string): Promise<boolean> {
  try {
    console.log('Confirming payment intent:', {
      paymentIntentId,
      timestamp: new Date().toISOString()
    });

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    console.log('Payment intent status:', {
      paymentIntentId,
      status: paymentIntent.status,
      timestamp: new Date().toISOString()
    });

    return paymentIntent.status === 'succeeded';
  } catch (error) {
    console.error('Error confirming payment intent:', {
      error,
      paymentIntentId,
      timestamp: new Date().toISOString()
    });
    throw new Error('Failed to confirm payment');
  }
}
