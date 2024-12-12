import React, { useState, useEffect, useCallback, FormEvent } from "react";
import { Elements, useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { purchaseCredits } from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import type { PaymentState, PaymentStatus, CurrencyCode } from "../types/payment";
import type { Stripe, StripeElementsOptions } from '@stripe/stripe-js';
import { SUPPORTED_CURRENCIES } from "../config/currencies";

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