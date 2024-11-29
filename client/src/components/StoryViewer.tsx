import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import AudioPlayer from "./AudioPlayer";
import { Story, StorySegment } from "../lib/api";
import { Link } from "wouter";
import type { CarouselApi } from "@/components/ui/carousel";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

interface StoryViewerProps {
  story: Story;
  showHomeIcon?: boolean;
}

export default function StoryViewer({ story, showHomeIcon = true }: StoryViewerProps) {
  const [currentSegment, setCurrentSegment] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const { toast } = useToast();

  // Reset currentSegment when story changes
  useEffect(() => {
    setCurrentSegment(0);
    if (api) {
      api.scrollTo(0);
    }
  }, [story.id, api]);

  // Sync carousel with currentSegment
  useEffect(() => {
    if (!api) return;
    api.scrollTo(currentSegment);
  }, [api, currentSegment]);

  // Stop audio when currentSegment changes
  useEffect(() => {
    const stopAllAudio = () => {
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
    };
    
    stopAllAudio();
  }, [currentSegment]);

  // Cleanup effect to stop audio when unmounting
  useEffect(() => {
    return () => {
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
    };
  }, []);

  // Check if story has segments
  if (!story.segments || story.segments.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <p>No story segments available</p>
        </div>
      </Card>
    );
  }

  // Ensure currentSegment is within bounds
  const safeCurrentSegment = Math.min(currentSegment, story.segments.length - 1);
  const currentSegmentData = story.segments[safeCurrentSegment];

  return (
    <div className="space-y-4">
      {showHomeIcon && (
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
      )}
      <Card className="p-6">
        <Carousel 
          className="w-full max-w-xl mx-auto"
          setApi={setApi}
          onSelect={(index) => {
            if (typeof index === 'number' && index !== currentSegment) {
              setCurrentSegment(index);
            }
          }}
        >
          <CarouselContent>
            {story.segments.map((segment: StorySegment, index: number) => (
              <CarouselItem key={index} data-index={index}>
                <div className="space-y-4">
                  {segment.imageUrl && (
                    <img
                      src={segment.imageUrl}
                      alt={`Story scene ${index + 1}`}
                      className="w-full h-64 object-cover rounded-lg"
                      onError={(e) => {
                        e.currentTarget.src = '/assets/fallback-story-image.png';
                      }}
                    />
                  )}
                  <div className="my-4">
                    {segment.audioUrl ? (
                      <AudioPlayer audioUrl={segment.audioUrl} />
                    ) : (
                      <div className="text-gray-500 text-sm">Audio not available</div>
                    )}
                  </div>
                  {segment.content && (
                    <p className="text-lg leading-relaxed">
                      {segment.content}
                    </p>
                  )}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious 
            onClick={() => setCurrentSegment(currentSegment - 1)}
            disabled={currentSegment === 0}
            className={`${
              currentSegment === 0 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50' 
                : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
            } transition-all duration-200`}
          />
          <CarouselNext 
            onClick={() => setCurrentSegment(currentSegment + 1)}
            disabled={currentSegment === story.segments.length - 1}
            className={`${
              currentSegment === story.segments.length - 1 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50' 
                : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
            } transition-all duration-200`}
          />
        </Carousel>
      </Card>
    </div>
  );
}
