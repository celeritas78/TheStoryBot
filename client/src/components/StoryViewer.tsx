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
  const [api, setApi] = useState<CarouselApi | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setCurrentSegment(0);
    api?.scrollTo(0);
  }, [story.id, api]);

  useEffect(() => {
    api?.scrollTo(currentSegment);
  }, [api, currentSegment]);

  useEffect(() => {
    const stopAllAudio = () => {
      const audioElements = document.querySelectorAll('.story-viewer audio');
      audioElements.forEach(audio => {
        const audioElement = audio as HTMLAudioElement;
        if (!audioElement.paused) {
          audioElement.pause();
          audioElement.currentTime = 0;
        }
      });
    };
    stopAllAudio();
  }, [currentSegment]);

  useEffect(() => {
    return () => {
      const audioElements = document.querySelectorAll('.story-viewer audio');
      audioElements.forEach(audio => {
        const audioElement = audio as HTMLAudioElement;
        if (!audioElement.paused) {
          audioElement.pause();
          audioElement.currentTime = 0;
        }
      });
    };
  }, []);

  if (!story.segments || story.segments.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <p>No story segments available</p>
        </div>
      </Card>
    );
  }

  const safeCurrentSegment = Math.min(currentSegment, story.segments.length - 1);
  const segment = story.segments[safeCurrentSegment];

  return (
    <div className="space-y-6 story-viewer">
      {showHomeIcon && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 sm:gap-4 w-full">
            <Link href="/">
              <Button variant="ghost" className="flex items-center gap-2" aria-label="Go to Home">
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
      <div className="relative">
        <Card className="p-4 px-4 sm:px-6 md:p-6 md:px-8 lg:p-8 lg:px-12 xl:px-16">
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
                  <div className="space-y-8">
                    {segment.imageUrl && (
                      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-lg shadow-md">
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
                    <div className="w-full max-w-xl mx-auto">
                      <div className="relative bg-white rounded-xl p-4 sm:p-6 shadow-md">
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 z-50">
                          <CarouselPrevious 
                            onClick={() => setCurrentSegment(currentSegment - 1)}
                            disabled={currentSegment === 0}
                            className="h-14 w-14 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 transition-opacity shadow-lg"
                          />
                        </div>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 z-50">
                          <CarouselNext 
                            onClick={() => setCurrentSegment(currentSegment + 1)}
                            disabled={currentSegment === story.segments.length - 1}
                            className="h-14 w-14 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 transition-opacity shadow-lg"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          {segment.audioUrl ? (
                            <div className="w-full max-w-xl mx-auto">
                              <AudioPlayer audioUrl={segment.audioUrl} />
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-full min-h-[80px] bg-gray-50 rounded-lg">
                              <span className="text-gray-500 text-sm">Audio not available</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {segment.content && (
                      <div className="px-4">
                        <p className="text-lg md:text-xl leading-relaxed text-gray-800 max-w-prose mx-auto">
                          {segment.content}
                        </p>
                      </div>
                    )}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </Card>
      </div>
    </div>
  );
}
