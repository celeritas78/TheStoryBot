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
import { Loader2 } from "lucide-react";

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!stripe || !elements) {
      toast({ title: "Error", description: "Payment system not initialized", variant: "destructive" });
      return;
    }

    setIsProcessing(true);

    try {
      // Validate the card element before confirming payment
      const { error: elementsError } = await elements.submit();
      if (elementsError) {
        toast({ 
          title: "Validation Error", 
          description: elementsError.message || "Please check your card details", 
          variant: "destructive" 
        });
        setIsProcessing(false);
        return;
      }

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
        if (error.type === 'card_error' || error.type === 'validation_error') {
          toast({ 
            title: "Payment Error", 
            description: error.message || "Your card was declined", 
            variant: "destructive" 
          });
        } else {
          console.error('Payment error:', error);
          toast({ 
            title: "Payment Error", 
            description: "An unexpected error occurred", 
            variant: "destructive" 
          });
        }
        return;
      }

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
      }
    } catch (error) {
      console.error('Payment confirmation error:', error);
      toast({ 
        title: "Payment Error", 
        description: "An unexpected error occurred while processing your payment", 
        variant: "destructive" 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4 mt-4">
        <PaymentElement 
          key={clientSecret}
          options={{
            layout: "tabs",
            paymentMethodOrder: ["card"],
          }} 
        />
        <Button 
          type="submit" 
          className="w-full mt-4"
          disabled={!stripe || !elements || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            `Pay $${amount}`
          )}
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
    console.log("Initializing payment with state:", {
      hasClientSecret: !!paymentState.clientSecret,
      amount,
      status: paymentState.status,
      timestamp: new Date().toISOString()
    });

    if (paymentState.clientSecret) {
      console.log("Payment already initialized, skipping");
      return;
    }

    try {
      setPaymentState((state) => ({ ...state, status: "processing", error: null }));
      console.log("Requesting credit purchase from server...");

      const response = await purchaseCredits(amount);
      console.log("Credit purchase response:", {
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

  // Reset payment state when dialog closes
  useEffect(() => {
    if (!open) {
      setPaymentState(initialPaymentState);
    }
  }, [open]);

  // Initialize payment when dialog opens
  useEffect(() => {
    if (open && paymentState.status === "idle") {
      initializePayment();
    }
  }, [open, initializePayment, paymentState.status]);

  

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
