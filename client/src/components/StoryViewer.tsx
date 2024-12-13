import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Story } from "../lib/api";
import { Link } from "wouter";
import AudioPlayer from "./AudioPlayer";
import { OptimizedImage } from "./OptimizedImage";

interface StoryViewerProps {
  story: Story;
  showHomeIcon?: boolean;
}

export default function StoryViewer({ story, showHomeIcon = true }: StoryViewerProps) {
  const [currentSegment, setCurrentSegment] = useState(0);

  useEffect(() => {
    setCurrentSegment(0);
  }, [story.id]);

  const handleNext = () => {
    if (currentSegment < story.segments.length - 1) {
      setCurrentSegment((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentSegment > 0) {
      setCurrentSegment((prev) => prev - 1);
    }
  };

  const segment = story.segments[currentSegment];
  
  console.log('StoryViewer: Current segment media details:', {
    segmentIndex: currentSegment,
    imageUrl: segment.imageUrl,
    audioUrl: segment.audioUrl,
    hasImage: Boolean(segment.imageUrl),
    hasAudio: Boolean(segment.audioUrl)
  });

  return (
    <div className="story-viewer flex flex-col items-center space-y-6">
      {showHomeIcon && (
        <div className="w-full flex justify-between items-center p-4">
          <Link href="/">
            <Button variant="ghost">Home</Button>
          </Link>
          <h1 className="text-xl md:text-2xl font-bold text-center">
            {story.title || `${story.childName}'s Story`}
          </h1>
        </div>
      )}
      <div className="w-full max-w-4xl">
        <Card className="p-4">
          {segment.imageUrl && (
            <div className="relative w-full aspect-video mb-6">
              <OptimizedImage
                src={segment.imageUrl}
                alt={`Story scene ${currentSegment + 1}`}
                className="absolute inset-0 w-full h-full object-cover rounded-md shadow-md"
                priority={true}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <Button
              onClick={handlePrevious}
              disabled={currentSegment === 0}
              className="h-16 w-16 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-2xl shadow-md hover:opacity-90 disabled:opacity-50"
            >
              &#8249;
            </Button>
            <div className="flex-1 mx-6">
              <AudioPlayer
                audioUrl={segment.audioUrl || ""}
                onAudioEnd={() => handleNext()}
              />
            </div>
            <Button
              onClick={handleNext}
              disabled={currentSegment === story.segments.length - 1}
              className="h-16 w-16 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-2xl shadow-md hover:opacity-90 disabled:opacity-50"
            >
              &#8250;
            </Button>
          </div>
          {segment.content && (
            <div className="mt-6 text-center">
              <p className="text-base md:text-lg leading-relaxed">{segment.content}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
