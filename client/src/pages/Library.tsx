import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getFavorites } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Library } from "lucide-react";
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

export default function LibraryPage() {
  const { data: favorites, isLoading, error } = useQuery<Story[]>({
    queryKey: ["favorites"],
    queryFn: async () => {
      console.log('Fetching favorites...');
      try {
        const data = await getFavorites();
        console.log('Favorites fetched successfully:', data);
        return data;
      } catch (error) {
        console.error('Error fetching favorites:', error);
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
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text">
            My Story Library
          </h1>
          <Link href="/create">
            <Button>Create New Story</Button>
          </Link>
        </header>

        {favorites?.length === 0 ? (
          <Card className="p-8 text-center">
            <CardContent>
              <Library className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold mb-2">No Stories Yet</h2>
              <p className="text-gray-600 mb-4">
                Your favorite stories will appear here
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
                <img
                  src={story.firstSegment?.imageUrl || story.segments[0]?.imageUrl}
                  alt={`Story about ${story.childName}`}
                  className="w-full h-48 object-cover"
                />
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
      </div>
    </div>
  );
}
