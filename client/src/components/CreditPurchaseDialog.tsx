import React, { useState, useEffect, useCallback, FormEvent } from "react";
import { useStripe, useElements, PaymentElement, Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { purchaseCredits } from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import type { PaymentState } from "../types/payment";

interface PaymentFormProps {
  amount: number;
  isProcessing: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}

interface CreditPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const initialPaymentState: PaymentState = {
  status: 'idle',
  error: null,
  clientSecret: null,
  amount: null,
};

// Memoized PaymentForm Component
const PaymentForm: React.FC<PaymentFormProps> = React.memo(function PaymentForm({ amount, isProcessing, onSubmit }) {
  const stripe = useStripe();
  const elements = useElements();

  if (!stripe || !elements) {
    return (
      <div className="text-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2" />
        <p className="text-gray-600">Loading payment form...</p>
      </div>
    );
  }

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/credits/confirm`,
          payment_method_data: {
            billing_details: {
              email: window.localStorage.getItem('userEmail') || undefined,
            },
          },
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Payment error:', error);
    }
    
    onSubmit(e);
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: 'tabs',
          fields: {
            billingDetails: {
              name: 'auto',
            },
          },
        }}
      />
      {/* Test card numbers for development:
          4242 4242 4242 4242 (Visa - Success)
          4000 0000 0000 9995 (Visa - Declined)
          Exp: Any future date, CVC: Any 3 digits */}
      <div className="text-sm text-gray-500 mb-2">
        For testing, use card number: 4242 4242 4242 4242
      </div>
      <Button
        type="submit"
        disabled={isProcessing}
        className="w-full mt-4"
      >
        {isProcessing ? "Processing payment..." : `Pay $${amount}.00`}
      </Button>
    </form>
  );
});

export function CreditPurchaseDialog({ open, onOpenChange, onSuccess }: CreditPurchaseDialogProps) {
  const [amount, setAmount] = useState(10);
  const MIN_CREDITS = 1;
  const MAX_CREDITS = 100;
  const [paymentState, setPaymentState] = useState<PaymentState>(initialPaymentState);
  const { toast } = useToast();

  const initializePayment = useCallback(async () => {
    if (paymentState.clientSecret) return;

    try {
      setPaymentState(state => ({ ...state, status: 'processing', error: null }));

      const response = await purchaseCredits(amount);
      if (!response?.clientSecret || !response?.status) {
        throw new Error('Invalid response from server');
      }

      setPaymentState(state => ({
        ...state,
        status: 'idle',
        clientSecret: response.clientSecret,
        amount: response.amount,
        creditsToAdd: response.creditsToAdd,
        currentCredits: response.currentCredits,
        projectedTotalCredits: response.projectedTotalCredits,
        transactionId: response.transactionId,
      }));
    } catch (error) {
      setPaymentState(state => ({
        ...state,
        status: 'failed',
        error: {
          message: error instanceof Error ? error.message : 'Failed to initialize payment',
          code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
        },
      }));

      toast({
        title: "Payment Error",
        description: error instanceof Error ? error.message : "Failed to initialize payment",
        variant: "destructive",
      });
    }
  }, [amount, stripe, paymentState.clientSecret, toast]);

  useEffect(() => {
    if (!open || paymentState.status !== 'idle') return;
    initializePayment();
  }, [open, initializePayment, paymentState.status]);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setPaymentState(initialPaymentState);
        setAmount(10);
      }, 300); // Add delay to prevent immediate state reset
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    try {
      setPaymentState(state => ({ ...state, status: 'processing', error: null }));

      // The actual payment confirmation is handled in the PaymentForm component
      // This component only needs to handle the state updates and UI feedback
      setPaymentState(state => ({ ...state, status: 'processing' }));

      if (error) {
        setPaymentState(state => ({
          ...state,
          status: 'failed',
          error: {
            message: error.message ?? "Payment failed",
            code: error.type,
          },
        }));
        toast({
          title: "Payment failed",
          description: error.message ?? "Payment failed",
          variant: "destructive",
        });
      } else {
        setPaymentState(state => ({ ...state, status: 'succeeded' }));
        toast({
          title: "Payment successful",
          description: `Added ${amount} credits to your account`,
        });
        onSuccess?.();
        onOpenChange(false);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to process payment";
      setPaymentState(state => ({
        ...state,
        status: 'failed',
        error: { message: errorMessage },
      }));
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const isProcessing = paymentState.status === 'processing';

  const stripeElementsOptions: StripeElementsOptions = {
    clientSecret: paymentState.clientSecret || '',
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#6366f1',
        colorBackground: '#ffffff',
        colorText: '#1f2937',
      },
    },
    loader: 'auto',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Purchase Story Credits</DialogTitle>
          <DialogDescription>
            Add more credits to your account. Each credit allows you to create one story.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="amount">Number of Credits</Label>
            <Input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min={MIN_CREDITS}
              max={MAX_CREDITS}
              step={1}
              disabled={isProcessing || !!paymentState.clientSecret}
            />
            <p className="text-sm text-gray-500">Total: ${amount}.00 USD</p>
          </div>

          {paymentState.error && (
            <div className="text-red-500 text-sm mb-4">{paymentState.error.message}</div>
          )}

          {paymentState.clientSecret ? (
            <Elements stripe={window.Stripe?.(import.meta.env.VITE_STRIPE_PUBLIC_KEY)} options={stripeElementsOptions}>
              <PaymentForm
                amount={amount}
                isProcessing={isProcessing}
                onSubmit={handleSubmit}
              />
            </Elements>
          ) : (
            <div className="text-center text-gray-500 p-4">
              {paymentState.error ? (
                <div className="text-red-500">
                  <p className="font-semibold">Error initializing payment:</p>
                  <p>{paymentState.error.message}</p>
                </div>
              ) : (
                "Loading payment options..."
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
