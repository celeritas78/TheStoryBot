import Stripe from 'stripe';
import type { Stripe as StripeType } from 'stripe';
import { 
  CREDITS_PER_USD, 
  STRIPE_CURRENCY,
  STRIPE_STATEMENT_DESCRIPTOR,
  STRIPE_STATEMENT_DESCRIPTOR_SUFFIX,
  STRIPE_API_VERSION
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
  let lastError: Error | null = null;

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
        telemetry: false,
        appInfo: {
          name: 'Story Credits Purchase',
          version: '1.0.0',
          url: process.env.NODE_ENV === 'production' ? process.env.APP_URL : undefined
        }
      });

      // Verify the Stripe connection with proper error handling
      try {
        const testResult = await stripe.paymentMethods.list({ limit: 1 });
        console.log('Stripe API connection verified successfully', {
          requestId,
          attempt,
          timestamp: new Date().toISOString(),
          environment,
          hasResults: !!testResult.data
        });
        
        return stripe;
      } catch (error) {
        const verificationError = error instanceof Error ? error : new Error('Unknown error during Stripe verification');
        console.error('Stripe API verification failed:', {
          requestId,
          attempt,
          error: verificationError.message,
          type: verificationError.constructor.name,
          environment,
          timestamp: new Date().toISOString()
        });
        
        if (attempt === retryCount) {
          throw verificationError;
        }
        
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.log(`Retrying Stripe verification in ${backoffDelay}ms...`, {
          requestId,
          attempt,
          nextAttempt: attempt + 1,
          timestamp: new Date().toISOString()
        });
        
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error during Stripe initialization');
      console.error('Stripe initialization attempt failed:', {
        requestId,
        attempt,
        error: lastError.message,
        type: lastError.constructor.name,
        stack: lastError.stack,
        environment,
        timestamp: new Date().toISOString()
      });
      
      if (attempt === retryCount) {
        const finalError = new Error(`Failed to initialize Stripe after ${retryCount} attempts: ${lastError.message}`);
        console.error('All Stripe initialization attempts failed:', {
          requestId,
          attempts: retryCount,
          finalError: finalError.message,
          timestamp: new Date().toISOString()
        });
        throw finalError;
      }
      
      const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.log(`Retrying Stripe initialization in ${backoffDelay}ms...`, {
        requestId,
        attempt,
        nextAttempt: attempt + 1,
        timestamp: new Date().toISOString()
      });
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`Unexpected error: Stripe initialization loop completed without success or error`);
}

// Initialize stripe instance
let stripeInstance: Stripe | null = null;

// Export getter for stripe instance to ensure proper initialization check
export function getStripe(): Stripe | null {
  return stripeInstance;
}

// Initialize Stripe and return promise for server startup
export async function initializeStripeService(): Promise<void> {
  const environment = process.env.NODE_ENV || 'development';
  const startTime = Date.now();
  
  try {
    console.log('Starting Stripe service initialization...', {
      environment,
      timestamp: new Date().toISOString()
    });
    
    stripeInstance = await initializeStripe();
    
    if (!stripeInstance) {
      console.warn('Stripe service initialization incomplete - some features will be disabled', {
        environment,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    console.log('Stripe service initialized successfully', {
      environment,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Stripe service initialization failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      environment,
      duration,
      timestamp: new Date().toISOString()
    });
    
    // Don't throw - allow the application to start without Stripe
    return;
  }
}

// Export for backward compatibility - use getStripe() instead
export const stripe = null;

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

    const response = {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      creditsToAdd: credits,
      currentCredits: 0, // This will be set by the credits service
      projectedTotalCredits: 0, // This will be set by the credits service
      transactionId: 0, // This will be set by the credits service
      stripePaymentId: paymentIntent.id
    };

    console.log('Payment intent response created:', {
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      status: paymentIntent.status,
      timestamp: new Date().toISOString()
    });

    return response;
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
    const stripe = getStripe();
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
