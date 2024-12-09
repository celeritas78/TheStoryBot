import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import StoryViewer from "../components/StoryViewer";
import { Button } from "@/components/ui/button";
import { Title } from "@/components/ui/title";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "react-error-boundary";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Story } from "../lib/api";

function ErrorFallback({ error }: { error: Error }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        Failed to load story: {error.message}
      </AlertDescription>
    </Alert>
  );
}

async function fetchStory(id: string): Promise<Story> {
  const response = await fetch(`/api/stories/${id}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch story');
  }
  return response.json();
}

export default function StoryPage() {
  const [, params] = useRoute("/story/:id");
  const storyId = params?.id;

  const { data: story, isLoading, error } = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => fetchStory(storyId!),
    enabled: !!storyId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-4">
        <div className="container mx-auto max-w-4xl flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading story...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-4">
        <div className="container mx-auto max-w-4xl">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error instanceof Error ? error.message : 'Failed to load story'}
            </AlertDescription>
          </Alert>
          <div className="mt-4 text-center">
            <Link href="/library">
              <Button variant="outline">Back to Library</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-4">
        <div className="container mx-auto max-w-4xl text-center">
          <Title className="mb-4">Story not found</Title>
          <Link href="/library">
            <Button variant="outline">Back to Library</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-4">
        <div className="container mx-auto max-w-4xl">
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              
              <Title>
                {story.title || `${story.childName}'s Story`}
              </Title>
            </div>
          </header>
          <StoryViewer story={story} showHomeIcon={false} />
        </div>
      </div>
    </ErrorBoundary>
  );
}
