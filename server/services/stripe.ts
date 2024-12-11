import Stripe from 'stripe';
import { 
  CREDITS_PER_USD, 
  STRIPE_CURRENCY,
  STRIPE_STATEMENT_DESCRIPTOR,
  STRIPE_STATEMENT_DESCRIPTOR_SUFFIX,
  STRIPE_API_VERSION
} from '../config';

// Initialize Stripe with secret key and proper error handling
async function initializeStripe(): Promise<Stripe | null> {
  const environment = process.env.NODE_ENV || 'development';
  let stripe: Stripe | null = null;
  const requestId = Math.random().toString(36).substring(7);

  try {
    console.log('Initializing Stripe service...', {
      requestId,
      timestamp: new Date().toISOString(),
      environment,
      apiVersion: STRIPE_API_VERSION,
      hasSecretKey: !!process.env.STRIPE_SECRET_KEY
    });

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      appInfo: {
        name: 'Story Credits Purchase',
        version: '1.0.0'
      }
    });

    // Test the Stripe connection immediately
    try {
      await stripe.paymentMethods.list({ limit: 1 });
      console.log('Stripe API connection test successful', {
        requestId,
        timestamp: new Date().toISOString(),
        environment
      });
    } catch (error) {
      console.error('Stripe API connection test failed:', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : 'Unknown',
        environment,
        timestamp: new Date().toISOString()
      });
      return null;
    }

    console.log('Stripe service initialized successfully', {
      requestId,
      timestamp: new Date().toISOString(),
      environment
    });

    return stripe;
  } catch (error) {
    console.error('Failed to initialize Stripe:', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      environment,
      timestamp: new Date().toISOString()
    });
    
    return null;
  }
}

// Initialize stripe and handle potential initialization failure
let stripeInstance: Stripe | null = null;

// Initialize Stripe immediately but don't block
void (async () => {
  stripeInstance = await initializeStripe();
  if (!stripeInstance) {
    console.error('Failed to initialize Stripe service, payment features will be unavailable');
  }
})();

// Export getter for stripe instance to ensure proper initialization check
export function getStripe(): Stripe | null {
  return stripeInstance;
}

// Export for backward compatibility
export const stripe: Stripe | null = null;

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
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe service not initialized');
    }

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
    if (!stripe) {
      throw new Error('Stripe service not initialized');
    }

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
