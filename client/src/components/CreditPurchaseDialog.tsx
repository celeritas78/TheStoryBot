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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log("Payment form submitted");

    if (!stripe || !elements) {
      console.error("Stripe or Elements not initialized");
      toast({ title: "Error", description: "Payment system not initialized", variant: "destructive" });
      return;
    }

    const paymentElement = elements.getElement('payment');
    if (!paymentElement) {
      console.error("Payment Element not found");
      toast({ title: "Error", description: "Payment form not properly loaded", variant: "destructive" });
      return;
    }

    try {
      console.log("Confirming payment...");
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
        console.error("Payment error:", error);
        if (error.type === 'card_error' || error.type === 'validation_error') {
          toast({ 
            title: "Payment Error", 
            description: error.message || "Your card was declined", 
            variant: "destructive" 
          });
        } else {
          toast({ 
            title: "Payment Error", 
            description: "An unexpected error occurred", 
            variant: "destructive" 
          });
        }
        return;
      }

      console.log("Payment intent status:", paymentIntent?.status);
      if (paymentIntent?.status === 'succeeded') {
        toast({ 
          title: "Payment Successful", 
          description: `Added ${amount} credits to your account`, 
        });
        onSuccess?.();
      } else if (paymentIntent?.status === 'requires_action') {
        toast({ 
          title: "Authentication Required", 
          description: "Please complete the authentication process", 
        });
        // The payment requires additional authentication steps
        // The stripe.confirmPayment will handle the redirect automatically
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

    // Prevent multiple initialization attempts
    if (paymentState.status === "processing") {
      console.log("Payment initialization already in progress, skipping", {
        requestId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (paymentState.clientSecret) {
      console.log("Payment already initialized with client secret, skipping", {
        requestId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      setPaymentState((state) => ({ ...state, status: "processing", error: null }));
      console.log("Requesting credit purchase from server...", {
        requestId,
        amount,
        timestamp: new Date().toISOString()
      });

      const response = await purchaseCredits(amount);
      console.log("Credit purchase response:", {
        requestId,
        hasClientSecret: !!response?.clientSecret,
        status: response?.status,
        amount: response?.amount,
        timestamp: new Date().toISOString()
      });

      if (!response?.clientSecret || !response?.status) {
        console.error("Invalid server response:", response);
        throw new Error("Invalid response from server");
      }

      console.log("Setting payment state with client secret");
      // Convert Stripe PaymentIntent status to our PaymentStatus type
      const paymentStatus = response.status === "requires_payment_method" ? "requires_payment_method" :
                           response.status === "succeeded" ? "succeeded" :
                           response.status === "requires_action" ? "requires_action" :
                           response.status === "requires_confirmation" ? "requires_confirmation" :
                           response.status === "requires_capture" ? "requires_capture" :
                           response.status === "canceled" ? "canceled" : "processing";
                           
      setPaymentState((prevState) => ({
        ...prevState,
        status: paymentStatus,
        clientSecret: response.clientSecret,
        amount: response.amount,
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
    if (open && paymentState.status === "idle") initializePayment();
  }, [open, initializePayment, paymentState.status]);

  

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Purchase Story Credits</DialogTitle>
          <DialogDescription>Add credits to your account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Credits to Purchase</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= 1 && value <= 100) {
                  setAmount(value);
                }
              }}
              min={1}
              max={100}
              className="w-full"
            />
            <p className="text-sm text-gray-500">Each credit costs $1 USD</p>
          </div>
          
          {paymentState.status === "processing" ? (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2">Loading payment options...</span>
            </div>
          ) : paymentState.status === "failed" ? (
            <div className="text-red-500 p-4 text-center">
              Failed to load payment options. Please try again.
            </div>
          ) : paymentState.clientSecret ? (
            <div className="mt-4">
              <Elements 
                stripe={stripePromise} 
                options={{
                  clientSecret: paymentState.clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#6366f1',
                      colorBackground: '#ffffff',
                      colorText: '#1f2937',
                      colorDanger: '#dc2626',
                      fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont',
                      spacingUnit: '4px',
                      borderRadius: '6px',
                    },
                  },
                }}
                key={paymentState.clientSecret}
              >
                <PaymentForm 
                  clientSecret={paymentState.clientSecret}
                  amount={amount}
                  onSuccess={onSuccess}
                />
              </Elements>
            </div>
          ) : (
            <div className="text-center p-4">
              <div className="animate-pulse">Initializing payment...</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
