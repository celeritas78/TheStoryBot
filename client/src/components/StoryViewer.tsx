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
    <div className="space-y-6">
      {showHomeIcon && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
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
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text line-clamp-2 flex-1">
              {story.title || `${story.childName}'s Story`}
            </h1>
          </div>
        </div>
      )}
      <Card className="p-4 px-4 sm:px-6 md:p-6 md:px-8 lg:p-8 lg:px-12 xl:px-16">
        <Carousel 
          className="w-full max-w-3xl mx-auto"
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
                <div className="space-y-6">
                  {segment.imageUrl && (
                    <div className="relative w-full aspect-[4/3] overflow-hidden rounded-lg">
                      <img
                        src={segment.imageUrl}
                        alt={`Story scene ${index + 1}`}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/assets/fallback-story-image.png';
                        }}
                      />
                    </div>
                  )}
                  <div className="space-y-6">
                    <div className="flex items-center justify-center w-full max-w-2xl mx-auto my-4">
                      <div className="flex items-center gap-2 w-full">
                        <CarouselPrevious 
                          onClick={() => setCurrentSegment(currentSegment - 1)}
                          disabled={currentSegment === 0}
                          className={`relative h-12 w-12 flex items-center justify-center ${
                            currentSegment === 0 
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50' 
                              : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                          } transition-all duration-200`}
                        />
                        <div className="flex-1 mx-2">
                          {segment.audioUrl ? (
                            <AudioPlayer audioUrl={segment.audioUrl} />
                          ) : (
                            <div className="text-gray-500 text-sm text-center">Audio not available</div>
                          )}
                        </div>
                        <CarouselNext 
                          onClick={() => setCurrentSegment(currentSegment + 1)}
                          disabled={currentSegment === story.segments.length - 1}
                          className={`relative h-12 w-12 flex items-center justify-center ${
                            currentSegment === story.segments.length - 1 
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50' 
                              : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                          } transition-all duration-200`}
                        />
                    </div>
                    </div>
                    {segment.content && (
                      <p className="text-lg md:text-xl leading-relaxed text-gray-800 max-w-prose mx-auto">
                        {segment.content}
                      </p>
                    )}
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </Card>
    </div>
  );
}
