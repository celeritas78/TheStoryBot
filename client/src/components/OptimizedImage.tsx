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
  const [imageSrc, setImageSrc] = useState<string>(priority ? src : '');
  
  // Enhanced logging for image initialization and props
  useEffect(() => {
    console.group('OptimizedImage: Initialization');
    console.log('Component Props:', {
      src,
      priority,
      className,
      width,
      height,
      alt
    });
    
    // Validate image URL
    const isValidUrl = src && (
      src.startsWith('http') || 
      src.startsWith('/') || 
      src.startsWith('./') || 
      src.startsWith('../')
    );
    
    console.log('URL Validation:', {
      isValidUrl,
      urlType: src?.startsWith('http') ? 'absolute' : 'relative',
      urlPath: src?.split('/').slice(-2).join('/'),
      timestamp: new Date().toISOString()
    });
    
    if (!isValidUrl) {
      console.warn('OptimizedImage: Invalid or missing image URL:', src);
    }
    console.groupEnd();
  }, [src, priority, className, width, height, alt]);

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
    
    const img = new Image();
    
    img.onload = () => {
      const loadTime = performance.now() - startTime;
      if (mounted) {
        console.log('Image loaded successfully:', {
          src,
          loadTimeMs: Math.round(loadTime),
          dimensions: `${img.width}x${img.height}`,
          timestamp: new Date().toISOString(),
          priority
        });
        setImageSrc(src);
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
        },
        imageDetails: {
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          currentSrc: img.currentSrc
        }
      });
      
      if (mounted) {
        setIsError(true);
        setIsLoading(false);
      }
    };

    // Always attempt to load the image regardless of priority
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
      }
    }
    
    console.groupEnd();

    return () => {
      mounted = false;
      console.log('OptimizedImage: Cleanup', { src, timestamp: new Date().toISOString() });
    };
  }, [src, priority]);

  const handleError = () => {
    console.error('OptimizedImage: Image error event triggered:', src);
    setIsError(true);
    setIsLoading(false);
  };

  const handleLoad = () => {
    console.log('OptimizedImage: Image load event triggered:', src);
    setIsLoading(false);
  };

  // Use priority src directly or loaded src
  const finalSrc = isError ? fallbackSrc : (priority ? src : imageSrc);

  return (
    <div className="relative w-full overflow-hidden rounded-lg">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-purple-50/80 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </div>
      )}
      {isError ? (
        <div className="flex flex-col items-center justify-center p-6 bg-purple-50 text-purple-400 min-h-[200px] rounded-lg border-2 border-dashed border-purple-200">
          <ImageOff className="h-8 w-8 mb-2" />
          <span className="text-sm font-medium">Image unavailable</span>
          <span className="text-xs text-purple-400 mt-1">Please try refreshing the page</span>
        </div>
      ) : (
        <img
          src={finalSrc}
          alt={alt}
          width={width}
          height={height}
          className={`transition-all duration-300 rounded-lg ${className}`}
          style={{ 
            opacity: isLoading ? 0 : 1,
            transform: `scale(${isLoading ? 0.98 : 1})`,
            filter: `blur(${isLoading ? '8px' : '0'})`
          }}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? "eager" : "lazy"}
        />
      )}
    </div>
  );
}