import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AudioPlayer from "./AudioPlayer";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export default function StoryViewer({ story }) {
  const [currentSegment, setCurrentSegment] = useState(0);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <Carousel className="w-full max-w-xl mx-auto">
          <CarouselContent>
            {story.segments.map((segment, index) => (
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
