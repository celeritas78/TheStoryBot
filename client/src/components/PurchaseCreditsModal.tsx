import React, { useState } from 'react';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

interface PurchaseCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  line1: z.string().min(1, "Address line 1 is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  postal_code: z.string().min(6, "Postal code must be at least 6 characters"),
  country: z.string().min(1, "Country is required"),
});

export default function PurchaseCreditsModal({ isOpen, onClose }: PurchaseCreditsModalProps) {
  const [credits, setCredits] = useState(10);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customerDetails, setCustomerDetails] = useState({
    name: '',
    line1: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'IN', // Default to India
  });
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      // Create payment intent
      console.log('Creating payment intent:', {
        credits,
        amount: credits * 100,
        customer: customerDetails,
        timestamp: new Date().toISOString()
      });

      // Validate customer details
      const result = customerSchema.safeParse(customerDetails);
      if (!result.success) {
        const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        throw new Error(`Please complete all required fields: ${errors}`);
      }

      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credits,
          amount: credits * 100, // Amount in cents
          customer: customerDetails,
        }),
        credentials: 'include', // Important for session cookie
      });

      const data = await response.json();

      console.log('Payment intent response:', {
        status: response.status,
        ok: response.ok,
        data,
        timestamp: new Date().toISOString()
      });

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create payment intent');
      }

      // Complete payment
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      console.log('Confirming card payment...', {
        hasClientSecret: !!data.clientSecret,
        timestamp: new Date().toISOString()
      });

      const { error, paymentIntent } = await stripe.confirmCardPayment(
        data.clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: customerDetails.name,
              address: {
                line1: customerDetails.line1,
                city: customerDetails.city,
                state: customerDetails.state,
                postal_code: customerDetails.postal_code,
                country: customerDetails.country,
              },
            },
          },
        }
      );

      if (error) {
        console.error('Stripe payment confirmation error:', {
          type: error.type,
          message: error.message,
          code: error.code
        });
        throw new Error(error.message);
      }

      if (paymentIntent.status === 'succeeded') {
          console.log('Payment succeeded:', {
            paymentIntentId: paymentIntent.id,
            status: paymentIntent.status,
            timestamp: new Date().toISOString()
          });

          toast({
            title: "Payment successful!",
            description: `${credits} credits have been added to your account.`,
          });

          // Force refresh user data to update credits
          console.log('Refreshing user data...', {
            timestamp: new Date().toISOString()
          });
          
          await queryClient.invalidateQueries({ queryKey: ['user'] });
          await queryClient.refetchQueries({ queryKey: ['user'] });
          
          console.log('User data refresh completed', {
            timestamp: new Date().toISOString()
          });
          
          onClose();
        }
    } catch (error) {
      console.error('Payment error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      
      let errorMessage = 'An unexpected error occurred during payment';
      if (error instanceof Error) {
        errorMessage = error.message;
        // Handle specific Stripe error messages
        if (errorMessage.includes('Indian regulations')) {
          errorMessage = 'Payment failed due to regulatory requirements. Please try again.';
        }
      }
      
      toast({
        title: "Payment failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 100) {
      setCredits(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Purchase Story Credits</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="credits">Number of Credits</Label>
            <Input
              id="credits"
              type="number"
              min="1"
              max="100"
              value={credits}
              onChange={handleCreditChange}
              className="w-full"
            />
            <p className="text-sm text-gray-500">
              Total: ${credits}.00 (1 credit = $1)
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={customerDetails.name}
                onChange={(e) => setCustomerDetails(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="line1">Address Line 1</Label>
              <Input
                id="line1"
                value={customerDetails.line1}
                onChange={(e) => setCustomerDetails(prev => ({ ...prev, line1: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={customerDetails.city}
                  onChange={(e) => setCustomerDetails(prev => ({ ...prev, city: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={customerDetails.state}
                  onChange={(e) => setCustomerDetails(prev => ({ ...prev, state: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postal_code">Postal Code</Label>
                <Input
                  id="postal_code"
                  value={customerDetails.postal_code}
                  onChange={(e) => setCustomerDetails(prev => ({ ...prev, postal_code: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={customerDetails.country}
                  onChange={(e) => setCustomerDetails(prev => ({ ...prev, country: e.target.value }))}
                  required
                  disabled
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Card Details</Label>
              <div className="border rounded-md p-3">
                <CardElement
                  options={{
                    style: {
                      base: {
                        fontSize: '16px',
                        color: '#424770',
                        '::placeholder': {
                          color: '#aab7c4',
                        },
                      },
                      invalid: {
                        color: '#9e2146',
                      },
                    },
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!stripe || isProcessing}
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white"
            >
              {isProcessing ? 'Processing...' : `Pay $${credits}.00`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}