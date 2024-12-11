import Stripe from 'stripe';
import { 
  CREDITS_PER_USD, 
  STRIPE_CURRENCY,
  STRIPE_STATEMENT_DESCRIPTOR,
  STRIPE_STATEMENT_DESCRIPTOR_SUFFIX,
  STRIPE_API_VERSION
} from '../config';

// Initialize Stripe with secret key and proper error handling
function initializeStripe() {
  const environment = process.env.NODE_ENV || 'development';
  console.log('Initializing Stripe service...', {
    timestamp: new Date().toISOString(),
    environment,
    apiVersion: STRIPE_API_VERSION,
    hasSecretKey: !!process.env.STRIPE_SECRET_KEY
  });

  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error('STRIPE_SECRET_KEY environment variable is required');
    console.error('Stripe initialization failed:', {
      error: error.message,
      environment,
      timestamp: new Date().toISOString()
    });
    throw error;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      appInfo: {
        name: 'Story Credits Purchase',
        version: '1.0.0'
      }
    });

    // Test the Stripe connection
    stripe.paymentMethods.list({ limit: 1 })
      .then(() => {
        console.log('Stripe API connection test successful', {
          timestamp: new Date().toISOString(),
          environment
        });
      })
      .catch((error) => {
        console.error('Stripe API connection test failed:', {
          error: error.message,
          type: error.type,
          environment,
          timestamp: new Date().toISOString()
        });
      });

    console.log('Stripe service initialized successfully', {
      timestamp: new Date().toISOString(),
      environment
    });

    return stripe;
  } catch (error) {
    console.error('Failed to initialize Stripe:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      environment,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

export const stripe = initializeStripe();

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
      environment: process.env.NODE_ENV
    });

    // Amount should be in cents for Stripe
    const amountInCents = amount * 100;
    const credits = amount * CREDITS_PER_USD;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: STRIPE_CURRENCY,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      metadata: {
        userId: userId.toString(),
        credits: credits.toString(),
        purpose: 'story_credits'
      },
      description: description || `Purchase ${credits} story credits`,
      receipt_email: receiptEmail,
      statement_descriptor: STRIPE_STATEMENT_DESCRIPTOR?.substring(0, 22),
      statement_descriptor_suffix: STRIPE_STATEMENT_DESCRIPTOR_SUFFIX?.substring(0, 22),
      confirm: false
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
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      amount,
      userId,
      timestamp: new Date().toISOString()
    });
    throw error;
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
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      paymentIntentId,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}
