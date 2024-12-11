import { useState, useEffect, useCallback, useMemo } from "react";
import { useStripe, useElements, PaymentElement, Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { purchaseCredits } from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import type { PaymentState } from "../types/payment";

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

  // Initialize payment function defined first
  const initializePayment = useCallback(async () => {
    const requestId = Math.random().toString(36).substring(7);
    console.log('Starting payment initialization...', {
      requestId,
      amount,
      hasStripe: !!stripe,
      timestamp: new Date().toISOString()
    });

    if (!stripe) {
      console.error('Payment initialization failed: Stripe not initialized', {
        requestId,
        timestamp: new Date().toISOString()
      });
      toast({
        title: "Payment Error",
        description: "Payment system not initialized properly. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    if (amount < MIN_CREDITS || amount > MAX_CREDITS) {
      console.error('Payment initialization failed: Invalid amount', {
        requestId,
        amount,
        min: MIN_CREDITS,
        max: MAX_CREDITS,
        timestamp: new Date().toISOString()
      });
      toast({
        title: "Invalid Amount",
        description: `Please choose between ${MIN_CREDITS} and ${MAX_CREDITS} credits`,
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('Initializing credit purchase...', {
        requestId,
        amount,
        timestamp: new Date().toISOString()
      });

      const response = await purchaseCredits(amount);
      
      console.log('Credit purchase response received:', {
        requestId,
        responseData: response,
        timestamp: new Date().toISOString()
      });
      
      if (!response?.clientSecret || !response?.status) {
        const missingFields = [];
        if (!response?.clientSecret) missingFields.push('clientSecret');
        if (!response?.status) missingFields.push('status');
        
        console.error('Missing required fields in response:', {
          requestId,
          missingFields,
          receivedFields: Object.keys(response || {}),
          partialData: response,
          timestamp: new Date().toISOString()
        });
        
        throw new Error(`Invalid response: missing ${missingFields.join(', ')}`);
      }

      console.log('Payment intent created successfully:', {
        requestId,
        amount: response.amount,
        status: response.status,
        creditsToAdd: response.creditsToAdd,
        timestamp: new Date().toISOString()
      });

      setPaymentState(state => ({
        ...state,
        status: 'idle',
        clientSecret: response.clientSecret,
        amount: response.amount,
        creditsToAdd: response.creditsToAdd,
        currentCredits: response.currentCredits,
        projectedTotalCredits: response.projectedTotalCredits,
        transactionId: response.transactionId
      }));

    } catch (error) {
      console.error('Credit purchase initialization failed:', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });

      setPaymentState(state => ({
        ...state,
        status: 'failed',
        error: { 
          message: error instanceof Error ? error.message : 'Failed to initialize payment',
          code: error instanceof Error ? error.name : 'UNKNOWN_ERROR'
        }
      }));

      toast({
        title: "Payment Error",
        description: error instanceof Error ? error.message : "Failed to initialize payment",
        variant: "destructive",
      });
    }
  }, [amount, stripe, toast, MIN_CREDITS, MAX_CREDITS]);

  // Reset payment state when dialog closes
  useEffect(() => {
    if (!open) {
      setPaymentState(initialPaymentState);
      setAmount(10); // Reset amount to default
    }
  }, [open]);

  // Validate if we can show the payment form
  const canShowPaymentForm = useMemo(() => {
    return (
      stripe && 
      elements && 
      paymentState.clientSecret && 
      paymentState.status !== 'succeeded'
    );
  }, [stripe, elements, paymentState.clientSecret, paymentState.status]);

  // Log payment form state changes
  useEffect(() => {
    if (!canShowPaymentForm) {
      console.log('Payment form not ready:', {
        hasStripe: !!stripe,
        hasElements: !!elements,
        hasClientSecret: !!paymentState.clientSecret,
        status: paymentState.status,
        timestamp: new Date().toISOString()
      });
    }
  }, [canShowPaymentForm, stripe, elements, paymentState.clientSecret, paymentState.status]);

  // Initialize payment when dialog opens
  useEffect(() => {
    if (!open || !stripe) return;

    const initializePaymentFlow = async () => {
      // Only initialize if we're in idle state or failed state
      if (paymentState.status !== 'idle' && paymentState.status !== 'failed') {
        console.log('Skipping payment initialization - invalid state:', {
          status: paymentState.status,
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log('Starting payment initialization flow:', {
        amount,
        status: paymentState.status,
        timestamp: new Date().toISOString()
      });

      try {
        setPaymentState(state => ({ ...state, status: 'processing', error: null }));
        await initializePayment();
      } catch (error) {
        console.error('Payment initialization failed:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
        
        setPaymentState(state => ({
          ...state,
          status: 'failed',
          error: {
            message: error instanceof Error ? error.message : 'Payment initialization failed',
            code: error instanceof Error ? error.name : 'UNKNOWN_ERROR'
          }
        }));
      }
    };

    void initializePaymentFlow();
  }, [open, stripe, amount, paymentState.status, initializePayment]);

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

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/credits/confirm`
        }
      });

      if (result.error) {
        console.error('Payment failed:', result.error);
        setPaymentState(state => ({
          ...state,
          status: 'failed',
          error: { 
            message: result.error.message ?? "Payment failed",
            code: result.error.type
          }
        }));
        toast({
          title: "Payment failed",
          description: result.error.message,
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
  
  // Set up Stripe Elements options with proper typing and validation
  const stripeElementsOptions = useMemo<StripeElementsOptions>(() => ({
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
  }), [paymentState.clientSecret]);

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

          {isProcessing && (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              <span className="ml-2">Processing payment...</span>
            </div>
          )}

          {!isProcessing && paymentState.clientSecret && stripe && (
            <Elements stripe={stripe} options={stripeElementsOptions}>
              <PaymentElement 
                options={{
                  layout: 'tabs',
                  fields: {
                    billingDetails: {
                      name: 'auto',
                    }
                  }
                }}
                onChange={(event) => {
                  if (event.complete) {
                    console.log('Payment form is complete');
                  }
                }}
              />
              <Button
                type="submit"
                disabled={isProcessing}
                className="w-full mt-4"
              >
                {isProcessing ? "Processing payment..." : `Pay $${amount}.00`}
              </Button>
            </Elements>
          )}

          {!isProcessing && !paymentState.clientSecret && (
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
        </form>
      </DialogContent>
    </Dialog>
  );
}