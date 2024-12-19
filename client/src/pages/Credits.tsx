import React from 'react';
import { Title } from "@/components/ui/title";
import { useUser } from '@/hooks/use-user';
import { Button } from '@/components/ui/button';

// Stripe Payment Link URL - this should be configured per environment
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/7sIcO0aiG8D09I46oC';

export default function Credits() {
  const { user } = useUser();
  const [showSuccess, setShowSuccess] = React.useState(false);
  const { refetch } = useUser();

  // Check for successful payment return
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_success') === 'true') {
      console.log('Payment success detected', {
        timestamp: new Date().toISOString()
      });
      setShowSuccess(true);
      // Clean up URL
      window.history.replaceState({}, '', '/credits');
      // Refresh user data to get updated credits
      refetch?.().catch(error => {
        console.error('Failed to refresh user data after payment:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      });
    }
  }, [refetch]);

  const handlePurchaseClick = () => {
    console.log('Opening Stripe payment link', {
      url: STRIPE_PAYMENT_LINK,
      timestamp: new Date().toISOString()
    });
    window.open(STRIPE_PAYMENT_LINK, '_blank');
  };

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

          {showSuccess && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
              <strong className="font-bold">Payment Successful! </strong>
              <span className="block sm:inline">Your credits have been updated.</span>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-semibold">Current Balance</h2>
                <p className="text-gray-600">You have {user?.storyCredits || 0} credits remaining</p>
              </div>
              <Button
                onClick={handlePurchaseClick}
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
    </div>
  );
}