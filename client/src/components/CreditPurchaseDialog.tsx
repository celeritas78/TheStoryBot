import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { purchaseCredits } from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

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
  const [amount, setAmount] = useState(10); // Default to 10 credits
  const MIN_CREDITS = 1;
  const MAX_CREDITS = 100;
  const [isProcessing, setIsProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();

  useEffect(() => {
    if (open && amount > 0) {
      purchaseCredits(amount)
        .then(({ clientSecret }) => {
          setClientSecret(clientSecret);
        })
        .catch((error) => {
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to initialize payment",
            variant: "destructive",
          });
          onOpenChange(false);
        });
    }
  }, [open, amount, toast, onOpenChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      toast({
        title: "Error",
        description: "Payment system not initialized",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/credits/confirm`,
          payment_method: 'card',
        },
      });

      if (error) {
        toast({
          title: "Payment failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
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
              min={MIN_CREDITS}
              max={MAX_CREDITS}
              step={1}
            />
            <p className="text-sm text-gray-500">
              Total: ${amount}.00 USD
            </p>
          </div>
          <PaymentElement options={{
            layout: 'tabs',
            defaultValues: {
              billingDetails: {
                name: ''
              }
            }
          }} />
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
