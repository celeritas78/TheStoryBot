import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Title } from "@/components/ui/title";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <Title className="mb-4">
            The Story Bot
          </Title>
          <p className="text-lg text-gray-600">
            Create personalized AI stories for your little ones
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <Card className="overflow-hidden">
            <img
              src="/assets/image01.png"
              alt="Child reading a story"
              className="w-full h-48 object-cover"
              loading="eager"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null; // Prevent infinite fallback loop
                target.src = "/assets/fallback-story-image.png";
              }}
            />
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-2">
                Personalized Adventures
              </h2>
              <p className="text-gray-600">
                Craft unique AI-generated stories starring your child with their favorite characters, settings, and themes for a truly personal experience.
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <img
              src="/assets/image02.png"
              alt="Imaginative story scene"
              className="w-full h-48 object-cover"
              loading="eager"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null; // Prevent infinite fallback loop
                target.src = "/assets/fallback-story-image.png";
              }}
            />
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-2">
                Imagination Meets Learning
              </h2>
              <p className="text-gray-600">
                Inspire creativity and foster learning with engaging stories that teach valuable lessons while sparking your child’s imagination.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center space-x-4">
          <Link href="/create">
            <Button
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 text-lg px-8 py-6"
            >
              Create a Story
            </Button>
          </Link>
          <Link href="/library">
            <Button
              size="lg"
              variant="outline"
              className="border-2 border-purple-600 text-purple-600 hover:bg-purple-50 text-lg px-8 py-6"
            >
              View Library
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
