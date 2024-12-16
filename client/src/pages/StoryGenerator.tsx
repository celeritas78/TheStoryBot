import React, { useState } from "react";
import StoryForm from "../components/StoryForm";
import StoryViewer from "../components/StoryViewer";
import { Button } from "@/components/ui/button";
import { Title } from "@/components/ui/title";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { generateStory, type Story, type StoryFormData } from "../lib/api";
import { Loader2, CreditCard } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "wouter";

export default function StoryGenerator() {
  const [story, setStory] = useState<Story | null>(null);
  const { toast } = useToast();
  
  // Fetch user data including credits
  const { data: userData } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const response = await fetch("/api/user");
      if (!response.ok) throw new Error("Failed to fetch user data");
      return response.json();
    },
  });

  const hasCredits = userData?.storyCredits > 0;

  const mutation = useMutation({
    mutationFn: async (formData: StoryFormData) => {
      if (!hasCredits) {
        throw new Error("No story credits remaining");
      }
      console.log("Submitting form data:", formData);
      return generateStory(formData);
    },
    onSuccess: async (data: Story) => {
      console.log("Story generated successfully:", data);
      setStory(data);
      // Force refresh user data to update credits
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      await queryClient.refetchQueries({ queryKey: ["user"] });
      toast({
        title: "Story created!",
        description: "Your magical story is ready to read.",
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message || "Failed to generate story. Please try again.";
      console.error("Story generation error:", errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (formData: StoryFormData) => {
    if (!hasCredits) {
      toast({
        title: "No credits remaining",
        description: "Please purchase more credits to create stories",
        variant: "destructive",
      });
      return;
    }

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-8">
      <div className="container mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Title>{story ? story.title || `${story.childName}'s Story` : "Create Your Story"}</Title>
          <div className="flex items-center gap-2 text-sm">
            <CreditCard className="h-4 w-4" />
            <span>Credits: {userData?.storyCredits ?? 0}</span>
          </div>
        </header>

        {!hasCredits && !story && (
          <Alert className="mb-8">
            <AlertDescription className="flex flex-col items-center gap-4">
              <p>You've used all your free story credits! Purchase more credits to create more magical stories.</p>
              <Link href="/credits">
                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                  Buy Credits
                </Button>
              </Link>
            </AlertDescription>
          </Alert>
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
          hasCredits ? (
            <StoryForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
          ) : null
        ) : (
          <div>
            <StoryViewer story={story} showHomeIcon={false} />
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={handleReset} disabled={!hasCredits}>
                Create Another Story
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
