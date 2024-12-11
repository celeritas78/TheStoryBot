import React, { useState, useEffect, useCallback, FormEvent } from "react";
import { Elements, useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { purchaseCredits } from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import type { PaymentState, PaymentStatus } from "../types/payment";
import type { Stripe, StripeElementsOptions } from '@stripe/stripe-js';

const initialPaymentState: PaymentState = {
  status: "idle",
  error: null,
  clientSecret: null,
  amount: null,
};

const PaymentForm = ({
  clientSecret,
  amount,
  onSuccess,
}: {
  clientSecret: string;
  amount: number;
  onSuccess?: () => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (elements) {
        elements.clear();
      }
    };
  }, [elements]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!stripe || !elements) {
      toast({ 
        title: "Error", 
        description: "Payment system not initialized", 
        variant: "destructive" 
      });
      return;
    }

    if (isProcessing) {
      console.log("Payment already processing, preventing duplicate submission");
      return;
    }

    try {
      setIsProcessing(true);
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { 
          return_url: `${window.location.origin}/credits/confirm`,
          payment_method_data: {
            billing_details: {
              email: window.localStorage.getItem('userEmail') || undefined,
            },
          },
        },
        redirect: 'if_required',
      });

      if (error) {
        console.error('Payment error:', {
          type: error.type,
          message: error.message,
          code: error.code,
          timestamp: new Date().toISOString()
        });

        if (error.type === 'card_error' || error.type === 'validation_error') {
          toast({ 
            title: "Payment Error", 
            description: error.message || "Your card was declined", 
            variant: "destructive" 
          });
        } else {
          toast({ 
            title: "Payment Error", 
            description: "An unexpected error occurred. Please try again.", 
            variant: "destructive" 
          });
        }
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        toast({ 
          title: "Payment Successful", 
          description: `Successfully added ${amount} credits to your account`, 
        });
        onSuccess?.();
      } else if (paymentIntent?.status === 'requires_action') {
        toast({ 
          title: "Authentication Required", 
          description: "Additional verification required. Please follow the prompts.", 
        });
      } else {
        console.warn('Unexpected payment intent status:', paymentIntent?.status);
        toast({ 
          title: "Payment Status", 
          description: "Payment is being processed. Please wait.", 
        });
      }
    } catch (error) {
      console.error('Payment confirmation error:', error);
      toast({ 
        title: "Payment Error", 
        description: "An unexpected error occurred while processing your payment", 
        variant: "destructive" 
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4 mt-4">
        <PaymentElement key={clientSecret} />
        <Button type="submit" className="w-full mt-4">
          Pay ${amount}
        </Button>
      </div>
    </form>
  );
};

export const CreditPurchaseDialog = ({
  open,
  onOpenChange,
  onSuccess,
  stripePromise,
  stripeOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  stripePromise: Promise<Stripe | null>;
  stripeOptions?: StripeElementsOptions;
}) => {
  const [amount, setAmount] = useState(10);
  const [paymentState, setPaymentState] = useState<PaymentState>(initialPaymentState);
  const { toast } = useToast();

  console.log("CreditPurchaseDialog rendered with state:", {
    hasClientSecret: !!paymentState.clientSecret,
    status: paymentState.status,
    amount: paymentState.amount,
    timestamp: new Date().toISOString()
  });

  const initializePayment = useCallback(async () => {
    const requestId = Math.random().toString(36).substring(7);
    console.log("Initializing payment with state:", {
      requestId,
      hasClientSecret: !!paymentState.clientSecret,
      amount,
      status: paymentState.status,
      timestamp: new Date().toISOString()
    });

    // Prevent multiple initialization attempts if already processing
    if (paymentState.status === "processing") {
      console.log("Payment already processing, skipping", { requestId });
      return;
    }

    // Clear any existing payment if not in a final state
    if (paymentState.clientSecret && !["succeeded", "canceled"].includes(paymentState.status)) {
      console.log("Resetting existing payment state", { requestId });
      setPaymentState(initialPaymentState);
    }

    try {
      setPaymentState((state) => ({ ...state, status: "processing", error: null }));
      console.log("Requesting credit purchase from server...", { requestId });

      const response = await purchaseCredits(amount);
      console.log("Credit purchase response:", {
        requestId,
        hasClientSecret: !!response?.clientSecret,
        status: response?.status,
        amount: response?.amount,
        timestamp: new Date().toISOString()
      });

      if (!response?.clientSecret || !response?.status) {
        throw new Error("Invalid response from server: missing required fields");
      }

      // Map Stripe PaymentIntent status to our PaymentStatus type
      const statusMap: Record<string, PaymentStatus> = {
        requires_payment_method: "requires_payment_method",
        succeeded: "succeeded",
        requires_action: "requires_action",
        requires_confirmation: "requires_confirmation",
        requires_capture: "requires_capture",
        canceled: "canceled"
      };

      const paymentStatus = statusMap[response.status] || "processing";
      
      setPaymentState((prevState) => ({
        ...prevState,
        status: paymentStatus,
        clientSecret: response.clientSecret,
        amount: response.amount,
        error: null
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize payment";
      console.error("Payment initialization failed:", {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      
      setPaymentState((state) => ({
        ...state,
        status: "failed",
        error: { message: errorMessage },
      }));
      toast({ title: "Payment Error", description: errorMessage, variant: "destructive" });
    }
  }, [amount, paymentState.clientSecret, toast]);

  useEffect(() => {
    let isMounted = true;

    if (open && paymentState.status === "idle") {
      initializePayment().catch(error => {
        if (isMounted) {
          console.error('Failed to initialize payment:', error);
          toast({ 
            title: "Error", 
            description: "Failed to initialize payment. Please try again.", 
            variant: "destructive" 
          });
        }
      });
    }

    // Cleanup function
    return () => {
      isMounted = false;
      // Reset payment state when dialog closes
      if (!open) {
        setPaymentState(initialPaymentState);
        setAmount(10); // Reset to default amount
      }
    };
  }, [open, initializePayment, paymentState.status, toast]);

  // Handle dialog close
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && paymentState.status === "processing") {
      // Show confirmation before closing during processing
      if (window.confirm("Are you sure you want to cancel the payment process?")) {
        onOpenChange(false);
      }
    } else {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Purchase Story Credits</DialogTitle>
          <DialogDescription>Add credits to your account.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="amount">Credits</Label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          {paymentState.status === "processing" ? (
            <div>Loading payment options...</div>
          ) : paymentState.status === "failed" ? (
            <div>Failed to load payment options. Please try again.</div>
          ) : paymentState.clientSecret ? (
            <Elements 
              stripe={stripePromise} 
              options={{
                clientSecret: paymentState.clientSecret!,
                appearance: stripeOptions?.appearance,
              }}
            >
              <PaymentForm 
                clientSecret={paymentState.clientSecret}
                amount={amount}
                onSuccess={onSuccess}
              />
            </Elements>
          ) : (
            <div>Initializing payment...</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
