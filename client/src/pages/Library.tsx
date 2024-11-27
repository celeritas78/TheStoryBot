import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getAllStories } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Library, ImageOff } from "lucide-react";
import type { Story } from "../lib/api";

import { ErrorBoundary } from "react-error-boundary";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

function ErrorFallback({ error }: { error: Error }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        Error loading library: {error.message}
      </AlertDescription>
    </Alert>
  );
}

interface StoryImageProps {
  src: string;
  alt: string;
}

function StoryImage({ src, alt }: StoryImageProps) {
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="relative w-full h-48 bg-purple-50">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-full animate-pulse bg-purple-100" />
        </div>
      )}
      {isError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-purple-400">
          <ImageOff className="h-8 w-8 mb-2" />
          <span className="text-sm">Image unavailable</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: isLoading ? 0 : 1 }}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsError(true);
            setIsLoading(false);
          }}
        />
      )}
    </div>
  );
}

export default function LibraryPage() {
  const { data: stories, isLoading, error } = useQuery<Story[]>({
    queryKey: ["stories"],
    queryFn: async () => {
      console.log('Fetching all stories...');
      try {
        const data = await getAllStories();
        console.log('Stories fetched successfully:', data);
        return data;
      } catch (error) {
        console.error('Error fetching stories:', error);
        throw error;
      }
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-8">
        <div className="container mx-auto">
          <header className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text">
              My Story Library
            </h1>
            <Link href="/create">
              <Button>Create New Story</Button>
            </Link>
          </header>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden animate-pulse">
                <div className="w-full h-48 bg-gray-200" />
                <CardContent className="p-4">
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
                  <div className="h-10 bg-gray-200 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-8">
      <div className="container mx-auto">
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
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text">
              My Story Library
            </h1>
          </div>
          <Link href="/create">
            <Button>Create New Story</Button>
          </Link>
        </header>

        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {stories?.length === 0 ? (
            <Card className="p-8 text-center">
              <CardContent>
                <Library className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h2 className="text-xl font-semibold mb-2">No Stories Yet</h2>
                <p className="text-gray-600 mb-4">
                  Your stories will appear here
                </p>
                <Link href="/create">
                  <Button>Create Your First Story</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {favorites?.map((story: Story) => (
                <Card key={story.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <ErrorBoundary
                    FallbackComponent={() => (
                      <div className="w-full h-48 bg-purple-50 flex items-center justify-center text-purple-400">
                        <ImageOff className="h-8 w-8" />
                      </div>
                    )}
                  >
                    <StoryImage
                      src={story.firstSegment?.imageUrl || story.segments[0]?.imageUrl}
                      alt={`Story about ${story.childName}`}
                    />
                  </ErrorBoundary>
                  <CardContent className="p-4">
                    <h2 className="text-xl font-semibold mb-2">
                      {story.childName}'s Story
                    </h2>
                    <p className="text-gray-600 mb-4">Theme: {story.theme}</p>
                    <Link href={`/story/${story.id}`}>
                      <Button className="w-full">Read Story</Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
