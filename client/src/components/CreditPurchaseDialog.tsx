import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { purchaseCredits } from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import type { PaymentState } from "../types/payment";
import type { StripeError } from "@stripe/stripe-js";

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
  const [amount, setAmount] = useState(10); // Default to 10 credits
  const MIN_CREDITS = 1;
  const MAX_CREDITS = 100;
  const [paymentState, setPaymentState] = useState<PaymentState>(initialPaymentState);
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();

  // Update Elements configuration when amount changes
  useEffect(() => {
    if (elements) {
      elements.update({
        amount: amount * 100, // Convert to cents
        currency: 'usd'
      });
    }
  }, [amount, elements]);

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

      if (elements) {
        elements.update({ 
          amount: response.amount * 100,
          currency: 'usd'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize payment";
      console.error('Credit purchase initialization failed:', {
        error: errorMessage,
        amount,
        timestamp: new Date().toISOString(),
        stack: error instanceof Error ? error.stack : undefined
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

  console.log('Rendering CreditPurchaseDialog:', {
    stripeLoaded: !!stripe,
    elementsLoaded: !!elements,
    amount,
    paymentState,
    timestamp: new Date().toISOString()
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Purchase Story Credits</DialogTitle>
          <DialogDescription>
            Add more credits to your account. Each credit allows you to create one story.
          </DialogDescription>
        </DialogHeader>
        
        {!stripe || !elements ? (
          <div className="p-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Initializing payment system...</p>
          </div>
        ) : (
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

            {showPaymentForm ? (
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
                  disabled={isProcessing || !stripe || !elements}
                  className="w-full"
                >
                  {isProcessing ? "Processing payment..." : `Pay $${amount}.00`}
                </Button>
              </>
            ) : (
              <div className="flex items-center justify-center p-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              </div>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}