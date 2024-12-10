import Stripe from 'stripe';
import { 
  CREDITS_PER_USD, 
  STRIPE_CURRENCY,
  STRIPE_PAYMENT_MODE,
  STRIPE_STATEMENT_DESCRIPTOR,
  STRIPE_STATEMENT_DESCRIPTOR_SUFFIX
} from '../config';

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia', // Latest API version
  typescript: true,
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
      timestamp: new Date().toISOString()
    });

    // Amount should be in cents for Stripe
    const amountInCents = amount * 100;
    const credits = amount * CREDITS_PER_USD;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: STRIPE_CURRENCY,
      metadata: {
        userId: userId.toString(),
        credits: credits.toString(),
        purpose: 'story_credits',
      },
      description: description || `Purchase ${credits} story credits`,
      receipt_email: receiptEmail,
      statement_descriptor: STRIPE_STATEMENT_DESCRIPTOR,
      statement_descriptor_suffix: STRIPE_STATEMENT_DESCRIPTOR_SUFFIX,
      payment_method_types: ['card'],
      setup_future_usage: null,
      confirmation_method: 'automatic'
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
