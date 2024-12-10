import Stripe from 'stripe';
import { CREDITS_PER_USD } from '../config';

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

export interface CreatePaymentIntentParams {
  amount: number; // Amount in USD
  userId: number;
}

export async function createPaymentIntent({ amount, userId }: CreatePaymentIntentParams) {
  try {
    // Amount should be in cents for Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency: 'usd',
      metadata: {
        userId: userId.toString(),
        credits: (amount * CREDITS_PER_USD).toString(), // 1 USD = 1 credit
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw new Error('Failed to create payment intent');
  }
}

export async function confirmPaymentIntent(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent.status === 'succeeded';
  } catch (error) {
    console.error('Error confirming payment intent:', error);
    throw new Error('Failed to confirm payment');
  }
}
