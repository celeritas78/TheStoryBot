import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { Title } from "@/components/ui/title";
import { useUser } from '@/hooks/use-user';
import PurchaseCreditsModal from '@/components/PurchaseCreditsModal';
import { Button } from '@/components/ui/button';

// Initialize Stripe with publishable key
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

console.log('Stripe initialization:', {
  hasKey: !!STRIPE_PUBLISHABLE_KEY,
  keyPrefix: STRIPE_PUBLISHABLE_KEY?.substring(0, 7),
  environment: import.meta.env.MODE,
  isDevelopment: import.meta.env.DEV,
  timestamp: new Date().toISOString()
});

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Log error if Stripe key is missing (only in development)
if (!STRIPE_PUBLISHABLE_KEY) {
  console.error('Stripe Error: Missing publishable key', {
    environment: import.meta.env.MODE,
    isDevelopment: import.meta.env.DEV,
    envVars: {
      hasStripeKey: !!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
    },
    timestamp: new Date().toISOString()
  });
}

// Add debug logs for stripe promise
stripePromise.then(stripe => {
  console.log('Stripe loaded:', {
    isLoaded: !!stripe,
    timestamp: new Date().toISOString()
  });
}).catch(error => {
  console.error('Stripe loading error:', {
    error: error.message,
    timestamp: new Date().toISOString()
  });
});

export default function Credits() {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-8">
      <div className="container mx-auto">
        <div className="max-w-3xl mx-auto">
          <header className="text-center mb-12">
            <Title>Story Credits</Title>
            <p className="mt-4 text-lg text-gray-600">
              Purchase credits to create magical stories for your children
            </p>
          </header>

          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-semibold">Current Balance</h2>
                <p className="text-gray-600">You have {user?.storyCredits || 0} credits remaining</p>
              </div>
              <Button
                onClick={() => setShowPurchaseModal(true)}
                className="bg-gradient-to-r from-purple-600 to-pink-600 text-white"
              >
                Purchase Credits
              </Button>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-semibold">What you can do with credits:</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-600">
                <li>Generate unique, personalized stories</li>
                <li>Create custom illustrations for each story segment</li>
                <li>Get AI-powered audio narration</li>
                <li>Save stories to your personal library</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {showPurchaseModal && (
        <Elements stripe={stripePromise}>
          <PurchaseCreditsModal
            isOpen={showPurchaseModal}
            onClose={() => setShowPurchaseModal(false)}
          />
        </Elements>
      )}
    </div>
  );
}
