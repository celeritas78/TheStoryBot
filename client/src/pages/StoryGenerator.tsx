import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import StoryForm from "../components/StoryForm";
import StoryViewer from "../components/StoryViewer";
import { Button } from "@/components/ui/button";
import { Title } from "@/components/ui/title";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { generateStory, getCreditBalance, type Story, type StoryFormData } from "../lib/api";
import { CreditPurchaseDialog } from "../components/CreditPurchaseDialog";
import { Loader2 } from "lucide-react";

// Stripe Promise
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!);

// Add the console log here to debug the environment variable
console.log("For testing:");
console.log("Stripe Publishable Key:", import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

stripePromise.then((stripe) => {
  if (!stripe) {
    console.error("Stripe failed to initialize. Check your publishable key.");
  } else {
    console.log("stripe: ", stripe);
  }
});


export default function StoryGenerator() {
  const [story, setStory] = useState<Story | null>(null);
  const [showCreditPurchase, setShowCreditPurchase] = useState(false);
  const { toast } = useToast();

  const { data: creditBalance, refetch: refetchCredits } = useQuery({
    queryKey: ["credits"],
    queryFn: getCreditBalance,
  });

  const mutation = useMutation({
    mutationFn: async (formData: StoryFormData) => {
      console.log("Submitting form data:", formData);
      return generateStory(formData);
    },
    onSuccess: (data: Story) => {
      console.log("Story generated successfully:", data);
      setStory(data);
      toast({
        title: "Story created!",
        description: "Your magical story is ready to read.",
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message || "Failed to generate story. Please try again.";
      console.error("Story generation error:", errorMessage);
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

  const stripeOptions = useMemo(() => ({
    appearance: {
      theme: "stripe" as "stripe", // Cast to satisfy TypeScript
      variables: {
        colorPrimary: "#6366f1",
        colorBackground: "#ffffff",
        colorText: "#1f2937",
      },
    },
  }), []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-8">
      <div className="container mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Title>{story ? story.title || `${story.childName}'s Story` : "Create Your Story"}</Title>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">Credits: {creditBalance?.credits || 0}</div>
            <Button variant="outline" onClick={() => setShowCreditPurchase(true)}>
              Buy Credits
            </Button>
          </div>
        </header>

        {showCreditPurchase && (
          <div>
            <Elements stripe={stripePromise} options={stripeOptions}>
              <CreditPurchaseDialog
                open={showCreditPurchase}
                onOpenChange={setShowCreditPurchase}
                onSuccess={() => {
                  refetchCredits();
                  setShowCreditPurchase(false);
                }}
              />
            </Elements>
          </div>
        )}

        {mutation.isPending && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-4 rounded-lg flex items-center space-x-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Generating your story...</span>
            </div>
          </div>
        )}

        {!story ? (
          <StoryForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
        ) : (
          <div>
            <StoryViewer story={story} showHomeIcon={false} />
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={handleReset}>
                Create Another Story
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
