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
      setAmount(10); // Reset amount to default
    }
  }, [open]);

  // Initialize payment when dialog opens or amount changes
  useEffect(() => {
    if (open && amount > 0 && paymentState.status === 'idle') {
      const timer = setTimeout(() => {
        void initializePayment();
      }, 300); // Add small delay to prevent rapid re-initialization
      return () => clearTimeout(timer);
    }
  }, [open, amount, paymentState.status]);

  const initializePayment = async () => {
    if (!stripe) {
      console.error('Stripe not initialized');
      toast({
        title: "Payment Error",
        description: "Payment system not initialized properly. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    if (amount < MIN_CREDITS || amount > MAX_CREDITS) {
      toast({
        title: "Invalid Amount",
        description: `Please choose between ${MIN_CREDITS} and ${MAX_CREDITS} credits`,
        variant: "destructive",
      });
      return;
    }

    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    console.log('Starting payment initialization...', {
      requestId,
      amount,
      timestamp: new Date().toISOString()
    });

    try {
      setPaymentState(state => ({ ...state, status: 'processing', error: null }));
      
      const response = await purchaseCredits(amount);
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to initialize payment');
      }
      
      if (!response?.clientSecret) {
        throw new Error('No client secret received from server');
      }

      console.log('Payment intent created:', {
        requestId,
        amount: response.amount,
        status: response.status,
        transactionId: response.transactionId,
        creditsToAdd: response.creditsToAdd,
        currentCredits: response.currentCredits,
        projectedTotal: response.projectedTotalCredits,
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

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize payment";
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error('Credit purchase initialization failed:', {
        requestId,
        error: errorMessage,
        amount,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        stack: errorStack
      });

      // Handle specific error cases
      let userMessage = errorMessage;
      if (errorMessage.includes('amount must be between')) {
        userMessage = `Please choose between ${MIN_CREDITS} and ${MAX_CREDITS} credits`;
      } else if (errorMessage.includes('No client secret')) {
        userMessage = "Unable to initialize payment. Please try again later.";
      }

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
        description: userMessage,
        variant: "destructive",
      });

      // Only close dialog for certain errors
      if (errorMessage.includes('No client secret') || errorMessage.includes('not initialized')) {
        onOpenChange(false);
      }
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
  
  // Set up Stripe Elements options
  const options: StripeElementsOptions = {
    clientSecret: paymentState.clientSecret || undefined,
    appearance: {
      theme: 'stripe',
    },
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

          {isProcessing ? (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              <span className="ml-2">Processing payment...</span>
            </div>
          ) : showPaymentForm ? (
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
