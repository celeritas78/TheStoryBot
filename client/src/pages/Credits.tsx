import React from 'react';
import { Title } from "@/components/ui/title";
import { useUser } from '@/hooks/use-user';
import { Button } from '@/components/ui/button';

export default function Credits() {
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-8">
      <div className="container mx-auto">
        <div className="max-w-3xl mx-auto">
          <header className="text-center mb-12">
            <Title>Story Credits</Title>
            <p className="mt-4 text-lg text-gray-600">
              Create magical stories for your children using your story credits
            </p>
          </header>

          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-semibold">Current Balance</h2>
                <p className="text-gray-600">You have {user?.storyCredits || 0} credits remaining</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-semibold">What you can do with credits:</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-600">
                <li>Generate unique, personalized stories</li>
                <li>Create custom illustrations for each story segment</li>
                <li>Get AI-powered audio narration</li>
                <li>Save stories to your personal library</li>
              </ul>
              
              <div className="mt-8 text-center">
                <Button
                  onClick={() => {
                    if (user?.id) {
                      const stripeUrl = new URL('https://buy.stripe.com/7sIcO0aiG8D09I46oC');
                      stripeUrl.searchParams.set('client_reference_id', user.id.toString());
                      window.open(stripeUrl.toString(), '_blank');
                    } else {
                      console.error('User ID not found');
                    }
                  }}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all"
                >
                  Buy Credits
                </Button>
                <p className="mt-2 text-sm text-gray-500">1 USD = 1 Credit</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}