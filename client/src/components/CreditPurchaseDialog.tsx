import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { purchaseCredits } from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import type { PaymentState, CreatePaymentResponse } from "../types/payment";

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
  transactionId: null,
  creditsToAdd: null,
  currentCredits: null,
  projectedTotalCredits: null,
};

export function CreditPurchaseDialog({
  open,
  onOpenChange,
  onSuccess
}: CreditPurchaseDialogProps) {
  const [amount, setAmount] = useState(10);
  const MIN_CREDITS = 1;
  const MAX_CREDITS = 100;
  const [paymentState, setPaymentState] = useState<PaymentState>(initialPaymentState);
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();

  // Reset payment state when dialog closes
  useEffect(() => {
    if (!open) {
      setPaymentState(initialPaymentState);
    }
  }, [open]);

  // Initialize payment when dialog opens
  useEffect(() => {
    if (open && amount > 0 && paymentState.status === 'idle') {
      initializePayment();
    }
  }, [open, amount]);

  const initializePayment = async () => {
    if (!stripe) {
      console.error('Stripe not initialized');
      toast({
        title: "Payment Error",
        description: "Payment system not initialized properly",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('Starting payment initialization...', {
        amount,
        timestamp: new Date().toISOString()
      });

      setPaymentState(state => ({ ...state, status: 'processing', error: null }));
      
      const response = await purchaseCredits(amount);
      
      if (!response.clientSecret) {
        throw new Error('No client secret received from server');
      }

      console.log('Payment intent created:', {
        amount: response.amount,
        status: response.status,
        timestamp: new Date().toISOString()
      });

      // Set the options for Stripe Elements
      const updatedOptions: StripeElementsOptions = {
        clientSecret: response.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#6366f1',
            colorBackground: '#ffffff',
            colorText: '#1f2937',
          },
        },
      };

      setPaymentState(state => ({
        ...state,
        status: 'idle',
        clientSecret: response.clientSecret,
        amount: response.amount,
        transactionId: response.transactionId,
      }));

      return updatedOptions;

    } catch (error) {
      console.error('Payment initialization failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });

      const errorMessage = error instanceof Error ? error.message : "Failed to initialize payment";
      
      toast({
        title: "Payment Error",
        description: errorMessage,
        variant: "destructive",
      });
      
      setPaymentState(state => ({
        ...state,
        status: 'failed',
        error: {
          message: errorMessage,
          code: error instanceof Error ? error.name : 'UNKNOWN_ERROR'
        }
      }));
      
      onOpenChange(false);
      throw error;
    }

    const startTime = Date.now();
    console.log('Initializing credit purchase:', {
      amount,
      timestamp: new Date().toISOString(),
      stripeLoaded: !!stripe,
      elementsLoaded: !!elements,
      status: paymentState.status
    });

    try {
      setPaymentState(state => ({ ...state, status: 'processing', error: null }));
      
      const response = await purchaseCredits(amount);
      
      console.log('Credit purchase initialized:', {
        amount,
        transactionId: response.transactionId,
        clientSecret: response.clientSecret ? 'exists' : 'missing',
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });

      setPaymentState(state => ({
        ...state,
        status: 'idle',
        clientSecret: response.clientSecret,
        amount: response.amount,
        transactionId: response.transactionId,
        creditsToAdd: response.creditsToAdd,
        currentCredits: response.currentCredits,
        projectedTotalCredits: response.projectedTotalCredits
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize payment";
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('Credit purchase initialization failed:', {
        error: errorMessage,
        amount,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        stack: errorStack
      });

      setPaymentState(state => ({
        ...state,
        status: 'failed',
        error: { 
          message: errorMessage,
          code: error instanceof Error ? error.name : 'UNKNOWN_ERROR'
        }
      }));

      toast({
        title: "Payment Error",
        description: errorMessage,
        variant: "destructive",
      });
      onOpenChange(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !paymentState.clientSecret) {
      toast({
        title: "Error",
        description: "Payment system not initialized",
        variant: "destructive",
      });
      return;
    }

    try {
      setPaymentState(state => ({ ...state, status: 'processing', error: null }));

      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/credits/confirm`
        }
      });

      if (stripeError) {
        console.error('Payment failed:', stripeError);
        setPaymentState(state => ({
          ...state,
          status: 'failed',
          error: { 
            message: stripeError.message ?? "Payment failed",
            code: stripeError.type
          }
        }));
        toast({
          title: "Payment failed",
          description: stripeError.message,
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to process payment";
      setPaymentState(state => ({
        ...state,
        status: 'failed',
        error: { message: errorMessage }
      }));
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const isProcessing = paymentState.status === 'processing';
  const showPaymentForm = paymentState.clientSecret && paymentState.status !== 'succeeded';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Purchase Story Credits</DialogTitle>
          <DialogDescription>
            Add more credits to your account. Each credit allows you to create one story.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
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
              disabled={isProcessing || !!showPaymentForm}
            />
            <p className="text-sm text-gray-500">
              Total: ${amount}.00 USD
            </p>
          </div>
          
          {paymentState.error && (
            <div className="text-red-500 text-sm mb-4">
              {paymentState.error.message}
            </div>
          )}

          {paymentState.status === 'processing' ? (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              <span className="ml-2">Initializing payment...</span>
            </div>
          ) : paymentState.clientSecret ? (
            <>
              <PaymentElement 
                options={{
                  layout: 'tabs',
                  fields: {
                    billingDetails: {
                      name: 'auto',
                    }
                  }
                }}
              />
              <Button
                type="submit"
                disabled={isProcessing || !stripe}
                className="w-full"
              >
                {isProcessing ? "Processing payment..." : `Pay $${amount}.00`}
              </Button>
            </>
          ) : (
            <div className="text-center text-gray-500">
              {paymentState.error ? (
                <div className="text-red-500">{paymentState.error.message}</div>
              ) : (
                "Loading payment form..."
              )}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
