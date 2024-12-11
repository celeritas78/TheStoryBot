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

    if (!stripe || !elements) {
      toast({ title: "Error", description: "Payment system not initialized", variant: "destructive" });
      return;
    }

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/credits/confirm` },
      });

      if (error) {
        throw error;
      }

      toast({ title: "Payment successful", description: `Added ${amount} credits to your account` });
      onSuccess?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Payment failed";
      toast({ title: "Payment Error", description: errorMessage, variant: "destructive" });
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
      const paymentStatus = response.status as PaymentStatus;
      setPaymentState((state) => ({
        ...state,
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
