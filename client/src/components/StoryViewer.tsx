import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import AudioPlayer from "./AudioPlayer";
import { Story, StorySegment } from "../lib/api";
import { Link } from "wouter";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

interface StoryViewerProps {
  story: Story;
  isFavorited?: boolean;
}

export default function StoryViewer({ story, isFavorited = false }: StoryViewerProps) {
  const [currentSegment, setCurrentSegment] = useState(0);
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
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
      </div>
      <Card className="p-6">
        <Carousel className="w-full max-w-xl mx-auto">
          <CarouselContent>
            {story.segments.map((segment: StorySegment, index: number) => (
              <CarouselItem key={index}>
                <div className="space-y-4">
                  <img
                    src={segment.imageUrl}
                    alt={`Story scene ${index + 1}`}
                    className="w-full h-64 object-cover rounded-lg"
                  />
                  <p className="text-lg leading-relaxed">
                    {segment.content}
                  </p>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>

        

        <div className="mt-4">
          <AudioPlayer audioUrl={story.segments[currentSegment].audioUrl} />
        </div>

        <div className="mt-4 flex justify-between">
          <Button
            variant="outline"
            disabled={currentSegment === 0}
            onClick={() => setCurrentSegment((prev) => prev - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={currentSegment === story.segments.length - 1}
            onClick={() => setCurrentSegment((prev) => prev + 1)}
          >
            Next
          </Button>
        </div>
      </Card>
    </div>
  );
}
