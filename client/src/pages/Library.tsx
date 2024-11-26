import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getFavorites } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Library } from "lucide-react";

export default function LibraryPage() {
  const { data: favorites, isLoading } = useQuery({
    queryKey: ["favorites"],
    queryFn: getFavorites,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-8">
        <div className="container mx-auto">
          <h1 className="text-3xl font-bold mb-8">Loading...</h1>
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
            {favorites?.map((story) => (
              <Card key={story.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <img
                  src={story.firstSegment.imageUrl}
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
