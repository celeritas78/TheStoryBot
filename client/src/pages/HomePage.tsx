import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text mb-4">
            Magical Bedtime Stories
          </h1>
          <p className="text-lg text-gray-600">
            Create personalized stories for your little ones
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <Card className="overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1485546246426-74dc88dec4d9"
              alt="Child reading"
              className="w-full h-48 object-cover"
            />
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-2">
                Personalized Stories
              </h2>
              <p className="text-gray-600">
                Create unique stories featuring your child's favorite characters
                and settings.
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1514539079130-25950c84af65"
              alt="Fairy tale background"
              className="w-full h-48 object-cover"
            />
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-2">
                Magical Adventures
              </h2>
              <p className="text-gray-600">
                Let your child's imagination soar with AI-generated illustrations
                and narration.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Link href="/create">
            <Button
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 text-lg px-8 py-6"
            >
              Create a Story
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
