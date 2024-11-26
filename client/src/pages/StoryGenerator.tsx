import { useState } from "react";
import StoryForm from "../components/StoryForm";
import StoryViewer from "../components/StoryViewer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { generateStory } from "../lib/api";

export default function StoryGenerator() {
  const [story, setStory] = useState(null);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: generateStory,
    onSuccess: (data) => {
      setStory(data);
      toast({
        title: "Story created!",
        description: "Your magical story is ready to read.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate story. Please try again.",
        variant: "destructive",
      });
      console.error("Story generation error:", error);
    },
  });

  const handleSubmit = (formData: {
    childName: string;
    childAge: string;
    mainCharacter: string;
    theme: string;
  }) => {
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
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-4">
      <div className="container mx-auto max-w-4xl">
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
  );
}
