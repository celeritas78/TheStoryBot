import { useState, useEffect, useMemo } from "react";
import StoryForm from "../components/StoryForm";
import StoryViewer from "../components/StoryViewer";
import { Button } from "@/components/ui/button";
import { Title } from "@/components/ui/title";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { generateStory, getCreditBalance, type Story, type StoryFormData } from "../lib/api";
import { Link } from "wouter";
import { CreditPurchaseDialog } from "../components/CreditPurchaseDialog";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { ErrorBoundary } from "react-error-boundary";
import { Loader2 } from "lucide-react";

// Get Stripe publishable key from environment
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Initialize Stripe with proper error handling
const initializeStripe = async () => {
  const requestId = Math.random().toString(36).substring(7);
  console.log('Starting Stripe initialization...', {
    requestId,
    hasKey: !!STRIPE_PUBLISHABLE_KEY,
    keyPrefix: STRIPE_PUBLISHABLE_KEY ? STRIPE_PUBLISHABLE_KEY.substring(0, 8) : 'missing',
    timestamp: new Date().toISOString()
  });

  if (!STRIPE_PUBLISHABLE_KEY) {
    const error = new Error('Stripe publishable key is missing');
    console.error('Stripe initialization failed:', {
      requestId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }

  try {
    const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
    if (!stripe) {
      throw new Error('Failed to initialize Stripe instance');
    }

    console.log('Stripe initialized successfully:', {
      requestId,
      stripeInstance: !!stripe,
      timestamp: new Date().toISOString()
    });

    return stripe;
  } catch (error) {
    console.error('Stripe initialization failed:', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    throw error instanceof Error ? error : new Error('Failed to initialize Stripe');
  }
};

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-4">
      <div className="container mx-auto max-w-4xl text-center">
        <h2 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text mb-4">
          Something went wrong
        </h2>
        <pre className="text-red-500 mb-4">{error.message}</pre>
        <Button onClick={resetErrorBoundary}>Try again</Button>
      </div>
    </div>
  );
}

export default function StoryGenerator() {
  const [story, setStory] = useState<Story | null>(null);
  const [showCreditPurchase, setShowCreditPurchase] = useState(false);
  const { toast } = useToast();
  
  // Initialize Stripe with proper logging
  const [stripePromise] = useState(() => {
    console.log('Starting Stripe initialization...', {
      hasKey: !!STRIPE_PUBLISHABLE_KEY,
      keyPrefix: STRIPE_PUBLISHABLE_KEY ? STRIPE_PUBLISHABLE_KEY.substring(0, 8) : 'missing',
      timestamp: new Date().toISOString()
    });

    if (!STRIPE_PUBLISHABLE_KEY) {
      console.error('Stripe publishable key is missing');
      return null;
    }

    return loadStripe(STRIPE_PUBLISHABLE_KEY)
      .then(stripe => {
        if (!stripe) {
          throw new Error('Failed to initialize Stripe instance');
        }
        console.log('Stripe initialized successfully:', {
          stripeInstance: !!stripe,
          timestamp: new Date().toISOString()
        });
        return stripe;
      })
      .catch(error => {
        console.error('Stripe initialization failed:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          type: error instanceof Error ? error.constructor.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        });
        return null;
      });
  });

  const { data: creditBalance, refetch: refetchCredits } = useQuery({
    queryKey: ['credits'],
    queryFn: getCreditBalance,
  });

  const mutation = useMutation({
    mutationFn: async (formData: StoryFormData) => {
      console.log('Submitting form data:', formData);
      return generateStory(formData);
    },
    onSuccess: (data: Story) => {
      console.log('Story generated successfully:', data);
      setStory(data);
      toast({
        title: "Story created!",
        description: "Your magical story is ready to read.",
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message || "Failed to generate story. Please try again.";
      console.error("Story generation error:", {
        error,
        message: errorMessage,
        stack: error.stack,
      });
      
      if (error.message.includes("Insufficient credits")) {
        setShowCreditPurchase(true);
        toast({
          title: "Insufficient Credits",
          description: "Please purchase more credits to create stories",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  const handleSubmit = (formData: StoryFormData) => {
    if (!formData.childName || !formData.childAge || !formData.mainCharacter || !formData.theme) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    mutation.mutate(formData);
  };

  const handleReset = () => {
    setStory(null);
  };

  // Stripe Elements options with proper typing
  const defaultStripeOptions: StripeElementsOptions = {
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#6366f1',
        colorBackground: '#ffffff',
        colorText: '#1f2937',
      },
    },
  };

  const stripeOptions: StripeElementsOptions = useMemo(() => ({
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#6366f1',
        colorBackground: '#ffffff',
        colorText: '#1f2937',
      },
    },
  }), []);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => setStory(null)}>
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-8">
        <div className="container mx-auto">
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Title>
                {story ? (story.title || `${story.childName}'s Story`) : 'Create Your Story'}
              </Title>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Credits: {creditBalance?.credits || 0}
              </div>
              <Button
                variant="outline"
                onClick={() => setShowCreditPurchase(true)}
              >
                Buy Credits
              </Button>
            </div>
          </header>
          
          {showCreditPurchase && (
            <ErrorBoundary
              FallbackComponent={({ error }) => (
                <div className="text-red-500 p-4 text-center">
                  <p>Failed to load payment form:</p>
                  <p>{error.message}</p>
                </div>
              )}
            >
              {!stripePromise ? (
                <div className="text-red-500 p-4 text-center">
                  <p>Payment system not available</p>
                  <p>Please try again later</p>
                </div>
              ) : (
                <Elements 
                  stripe={stripePromise} 
                  options={{
                    ...defaultStripeOptions,
                    loader: 'auto',
                  }}
                >
                  <CreditPurchaseDialog
                    open={showCreditPurchase}
                    onOpenChange={setShowCreditPurchase}
                    onSuccess={() => {
                      refetchCredits();
                      setShowCreditPurchase(false);
                    }}
                  />
                </Elements>
              )}
            </ErrorBoundary>
          )}

          {mutation.isPending && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white p-4 rounded-lg flex items-center space-x-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Generating your story...</span>
                <span>Will take up to a minute...</span>
              </div>
            </div>
          )}

          {!story ? (
            <StoryForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
          ) : (
            <div>
              <StoryViewer story={story} showHomeIcon={false} />
              <div className="mt-4 text-center">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="mx-2"
                >
                  Create Another Story
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
