import { useState, useEffect } from "react";
import { ImageOff, Loader2 } from "lucide-react";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

export function OptimizedImage({
  src,
  alt,
  className = "",
  fallbackSrc = "/assets/fallback-story-image.png",
  width,
  height,
  priority = false
}: OptimizedImageProps) {
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [imageSrc, setImageSrc] = useState<string>(src);

  useEffect(() => {
    let mounted = true;
    const startTime = performance.now();
    
    console.group('OptimizedImage: Loading Process');
    console.log('Starting image load:', {
      src,
      timestamp: new Date().toISOString(),
      priority,
      currentState: { isLoading, isError }
    });
    
    setIsLoading(true);
    setIsError(false);
    setImageSrc(src);
    
    const img = new Image();
    
    img.onload = () => {
      const loadTime = performance.now() - startTime;
      if (mounted) {
        console.log('Image loaded successfully:', {
          src,
          loadTimeMs: Math.round(loadTime),
          dimensions: `${img.width}x${img.height}`,
          timestamp: new Date().toISOString()
        });
        setIsLoading(false);
      }
    };
    
    img.onerror = (event) => {
      console.error('Image load failed:', {
        src,
        errorEvent: event instanceof Event ? 'Event object received' : 'Unknown error',
        timestamp: new Date().toISOString(),
        browserInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform
        }
      });
      
      if (mounted) {
        setIsError(true);
        setIsLoading(false);
        setImageSrc(fallbackSrc);
      }
    };

    try {
      img.src = src;
    } catch (err) {
      console.error('Error setting image src:', {
        error: err,
        src,
        timestamp: new Date().toISOString()
      });
      if (mounted) {
        setIsError(true);
        setIsLoading(false);
        setImageSrc(fallbackSrc);
      }
    }
    
    console.groupEnd();

    return () => {
      mounted = false;
      console.log('OptimizedImage: Cleanup', { src, timestamp: new Date().toISOString() });
    };
  }, [src, fallbackSrc]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-purple-50">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-purple-50">
        <ImageOff className="h-8 w-8 mb-2 text-purple-400" />
        <span className="text-sm text-purple-400">Unable to load image</span>
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading={priority ? "eager" : "lazy"}
    />
  );
}