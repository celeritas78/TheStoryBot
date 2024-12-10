import { useState } from "react";
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { purchaseCredits } from "../lib/api";
import { useToast } from "@/hooks/use-toast";

interface CreditPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreditPurchaseDialog({
  open,
  onOpenChange,
  onSuccess
}: CreditPurchaseDialogProps) {
  const [amount, setAmount] = useState(5);
  const [isProcessing, setIsProcessing] = useState(false);
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      // Create payment intent
      const { clientSecret } = await purchaseCredits(amount);

      // Confirm payment with Stripe
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/credits/confirm`,
        },
        redirect: "if_required",
      });

      if (result.error) {
        toast({
          title: "Payment failed",
          description: result.error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Payment successful",
          description: `Added ${amount} credits to your account`,
        });
        onSuccess?.();
        onOpenChange(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process payment",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
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
              min={1}
              max={100}
            />
            <p className="text-sm text-gray-500">
              Total: ${amount}.00 USD
            </p>
          </div>
          <PaymentElement />
          <Button
            type="submit"
            disabled={isProcessing}
            className="w-full"
          >
            {isProcessing ? "Processing..." : "Purchase Credits"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
