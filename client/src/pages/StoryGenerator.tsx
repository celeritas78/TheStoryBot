import { useState } from "react";
import StoryForm from "../components/StoryForm";
import StoryViewer from "../components/StoryViewer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { generateStory, type Story, type StoryFormData } from "../lib/api";
import { Link } from "wouter";

import { ErrorBoundary } from "react-error-boundary";
import { Loader2 } from "lucide-react";

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-4">
      <div className="container mx-auto max-w-4xl text-center">
        <h2 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text mb-4">Something went wrong</h2>
        <pre className="text-red-500 mb-4">{error.message}</pre>
        <Button onClick={resetErrorBoundary}>Try again</Button>
      </div>
    </div>
  );
}

export default function StoryGenerator() {
  const [story, setStory] = useState<Story | null>(null);
  const { toast } = useToast();

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

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => setStory(null)}>
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-4">
        <div className="container mx-auto max-w-4xl">
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  Home
                </Button>
              </Link>
              <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text">
                Create Your Story
              </h1>
            </div>
          </header>
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
              <StoryViewer story={story} />
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
