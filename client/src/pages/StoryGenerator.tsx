import React, { useState, useEffect, useCallback, useMemo } from "react";
// Payment imports removed for fresh implementation
import StoryForm from "../components/StoryForm";
import StoryViewer from "../components/StoryViewer";
import { Button } from "@/components/ui/button";
import { Title } from "@/components/ui/title";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { generateStory, type Story, type StoryFormData } from "../lib/api";
import { Loader2 } from "lucide-react";

// Payment initialization removed for fresh implementation


export default function StoryGenerator() {
  const [story, setStory] = useState<Story | null>(null);
  const { toast } = useToast();

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
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
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

  // Payment options removed for fresh implementation

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-8">
      <div className="container mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Title>{story ? story.title || `${story.childName}'s Story` : "Create Your Story"}</Title>
          <div className="flex items-center gap-4">
            {/* Credit system removed for fresh implementation */}
          </div>
        </header>

        {/* Credit purchase dialog removed for fresh implementation */}

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
