import Stripe from 'stripe';
import type { Stripe as StripeType } from 'stripe';
import { 
  STRIPE_DEFAULT_CURRENCY,
  STRIPE_STATEMENT_DESCRIPTOR,
  STRIPE_STATEMENT_DESCRIPTOR_SUFFIX,
  STRIPE_API_VERSION,
  SUPPORTED_CURRENCIES,
  calculateCredits
} from '../config';

// Define TypeScript interfaces for better type safety
interface StripeError extends Error {
  type?: string;
  code?: string;
  decline_code?: string;
}

// Initialize Stripe with retries and proper error handling
async function initializeStripe(retryCount = 3): Promise<Stripe | null> {
  const environment = process.env.NODE_ENV || 'development';
  const requestId = Math.random().toString(36).substring(7);
  
  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error('STRIPE_SECRET_KEY environment variable is required');
    console.error('Stripe initialization failed:', {
      requestId,
      error: error.message,
      timestamp: new Date().toISOString(),
      environment
    });
    throw error;
  }

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      console.log('Initializing Stripe service...', {
        requestId,
        attempt,
        timestamp: new Date().toISOString(),
        environment,
        apiVersion: STRIPE_API_VERSION
      });

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
        typescript: true,
        telemetry: false
      });

      // Verify the connection
      await stripe.paymentIntents.list({ limit: 1 });
      
      console.log('Stripe service initialized successfully', {
        requestId,
        attempt,
        timestamp: new Date().toISOString(),
        environment
      });
      
      return stripe;
    } catch (error) {
      console.error('Stripe initialization attempt failed:', {
        requestId,
        attempt,
        error: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : 'Unknown',
        environment,
        timestamp: new Date().toISOString()
      });
      
      if (attempt === retryCount) {
        throw error;
      }
      
      const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.log(`Retrying in ${backoffDelay}ms...`, {
        requestId,
        attempt,
        nextAttempt: attempt + 1,
        timestamp: new Date().toISOString()
      });
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`Failed to initialize Stripe after ${retryCount} attempts`);
}

// Singleton instance management
let stripeInstance: Stripe | null = null;
let isInitializing = false;
let initializationError: Error | null = null;

export function getStripe(): Stripe | null {
  if (initializationError) {
    throw initializationError;
  }
  return stripeInstance;
}

export async function initializeStripeService(): Promise<void> {
  if (isInitializing) {
    console.log('Stripe service initialization already in progress');
    return;
  }

  if (stripeInstance) {
    console.log('Stripe service already initialized');
    return;
  }

  isInitializing = true;
  initializationError = null;
  
  try {
    stripeInstance = await initializeStripe();
    
    if (!stripeInstance) {
      throw new Error('Stripe service initialization failed - service is null');
    }
  } catch (error) {
    console.error('Stripe service initialization failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    initializationError = error instanceof Error ? error : new Error('Unknown initialization error');
    throw initializationError;
  } finally {
    isInitializing = false;
  }
}

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
  creditsToAdd: number;
}

export async function createPaymentIntent({ 
  amount, 
  userId, 
  description, 
  receiptEmail 
}: CreatePaymentIntentParams): Promise<PaymentIntentResponse> {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe service not initialized');
    }

    console.log('Creating payment intent:', {
      requestId,
      amount,
      userId,
      amountInCents: amount * 100,
      creditsToAdd: amount * CREDITS_PER_USD,
      timestamp: new Date().toISOString()
    });

    // Amount should be in cents for Stripe
    const amountInCents = Math.round(amount * 100);
    const credits = amount * CREDITS_PER_USD;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: STRIPE_DEFAULT_CURRENCY,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      metadata: {
        userId: userId.toString(),
        credits: credits.toString(),
        purpose: 'story_credits',
        originalAmount: amount.toString(),
        currency: STRIPE_DEFAULT_CURRENCY
      },
      description: description || `Purchase ${credits} story credits`,
      receipt_email: receiptEmail,
      statement_descriptor: STRIPE_STATEMENT_DESCRIPTOR?.substring(0, 22),
      statement_descriptor_suffix: STRIPE_STATEMENT_DESCRIPTOR_SUFFIX?.substring(0, 22)
    });

    console.log('Payment intent created with details:', {
      requestId,
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      currency: STRIPE_DEFAULT_CURRENCY,
      credits,
      status: paymentIntent.status,
      clientSecret: !!paymentIntent.client_secret,
      timestamp: new Date().toISOString()
    });

    console.log('Payment intent created:', {
      requestId,
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
      creditsToAdd: credits
    };
  } catch (error) {
    console.error('Error creating payment intent:', {
      requestId,
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
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe service not initialized');
    }

    console.log('Confirming payment intent:', {
      requestId,
      paymentIntentId,
      timestamp: new Date().toISOString()
    });

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    console.log('Payment intent status:', {
      requestId,
      paymentIntentId,
      status: paymentIntent.status,
      timestamp: new Date().toISOString()
    });

    return paymentIntent.status === 'succeeded';
  } catch (error) {
    console.error('Error confirming payment intent:', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      paymentIntentId,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}