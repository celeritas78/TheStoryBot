import React, { useState, useEffect, useCallback, FormEvent } from "react";
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { purchaseCredits } from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import type { PaymentState } from "../types/payment";

const initialPaymentState: PaymentState = {
  status: "idle",
  error: null,
  clientSecret: null,
  amount: null,
};

export const CreditPurchaseDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) => {
  const [amount, setAmount] = useState(10);
  const [paymentState, setPaymentState] = useState<PaymentState>(initialPaymentState);
  const { toast } = useToast();

  const stripe = useStripe();
  const elements = useElements();

  console.log("CreditPurchaseDialog rendered with clientSecret:", paymentState.clientSecret);
  console.log("Stripe instance:", stripe);
  console.log("Elements instance:", elements);

  const initializePayment = useCallback(async () => {
    if (paymentState.clientSecret) return;

    try {
      setPaymentState((state) => ({ ...state, status: "processing", error: null }));

      const response = await purchaseCredits(amount);
      if (!response?.clientSecret || !response?.status) {
        throw new Error("Invalid response from server");
      }

      setPaymentState((state) => ({
        ...state,
        status: "idle",
        clientSecret: response.clientSecret,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize payment";
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!stripe || !elements || !paymentState.clientSecret) {
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
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Payment failed";
      toast({ title: "Payment Error", description: errorMessage, variant: "destructive" });
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
          {paymentState.clientSecret ? (
            <form onSubmit={handleSubmit}>
              <PaymentElement />
              <Button type="submit">Pay</Button>
            </form>
          ) : (
            <div>Loading payment options...</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
