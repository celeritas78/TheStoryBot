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
  const baseUrl = window.location.origin;
  
  // Handle image URL construction with proper path handling
  const imageUrl = segment.imageUrl 
    ? segment.imageUrl.startsWith('http') 
      ? segment.imageUrl 
      : `${baseUrl}${segment.imageUrl.startsWith('/') ? '' : '/'}${segment.imageUrl}`
    : '';
  const audioUrl = segment.audioUrl
    ? segment.audioUrl.startsWith('http')
      ? segment.audioUrl
      : `${baseUrl}${segment.audioUrl.startsWith('/') ? '' : '/'}${segment.audioUrl}`
    : '';

  // Enhanced logging for debugging URL construction
  console.group('StoryViewer: URL Construction Debug');
  console.log('Segment Data:', {
    index: currentSegment,
    totalSegments: story.segments.length,
    rawImageUrl: segment.imageUrl,
    rawAudioUrl: segment.audioUrl,
    processedImageUrl: imageUrl,
    processedAudioUrl: audioUrl
  });
  
  console.log('Server Environment:', {
    baseUrl,
    origin: window.location.origin,
    pathname: window.location.pathname
  });
  
  console.log('Story Context:', {
    storyId: story.id,
    totalSegments: story.segments.length,
    currentSegment
  });
  console.groupEnd();

  // Add detailed logging for URL construction
  console.group('StoryViewer: Segment Media Loading');
  console.log('Current Segment Details:', {
    index: currentSegment,
    total: story.segments.length,
    storyId: story.id,
    childName: story.childName
  });
  
  console.log('Image URL Construction:', {
    originalUrl: segment.imageUrl,
    baseUrl: baseUrl,
    constructedUrl: imageUrl,
    isAbsoluteUrl: segment.imageUrl?.startsWith('http'),
    hasImage: Boolean(segment.imageUrl)
  });
  
  console.log('Environment Details:', {
    origin: window.location.origin,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    pathname: window.location.pathname
  });
  
  console.log('Performance Metrics:', {
    timestamp: new Date().toISOString(),
    navigationStart: window.performance.timing.navigationStart,
    loadEventEnd: window.performance.timing.loadEventEnd
  });
  console.groupEnd();

  // Enhanced logging for debugging image loading
  console.group('StoryViewer: Segment Media Loading');
  console.log('Current Segment Details:', {
    index: currentSegment,
    total: story.segments.length,
    storyId: story.id,
    childName: story.childName
  });

  console.log('Image URL Construction:', {
    originalUrl: segment.imageUrl,
    baseUrl: baseUrl,
    constructedUrl: imageUrl,
    isAbsoluteUrl: segment.imageUrl?.startsWith('http'),
    hasImage: Boolean(segment.imageUrl)
  });

  console.log('Environment Details:', {
    origin: window.location.origin,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    pathname: window.location.pathname
  });

  console.log('Performance Metrics:', {
    timestamp: new Date().toISOString(),
    navigationStart: window.performance.timing.navigationStart,
    loadEventEnd: window.performance.timing.loadEventEnd
  });
  console.groupEnd();
  

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
            <div className="w-full h-[400px] mb-6 overflow-hidden rounded-lg">
              <OptimizedImage
                src={imageUrl}
                alt={`Story scene ${currentSegment + 1}`}
                className="w-full h-full object-cover"
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
                audioUrl={audioUrl}
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