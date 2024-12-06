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

  useEffect(() => {
    if (!priority && src) {
      // Reset states when src changes
      setIsLoading(true);
      setIsError(false);

      // Create new image object
      const img = new Image();
      img.src = src;

      // Set up load handler
      img.onload = () => {
        setImageSrc(src);
        setIsLoading(false);
      };

      // Set up error handler
      img.onerror = () => {
        console.error(`Failed to load image: ${src}`);
        setIsError(true);
        setIsLoading(false);
      };

      return () => {
        // Clean up
        img.onload = null;
        img.onerror = null;
      };
    }
  }, [src, priority]);

  const handleError = () => {
    console.error(`Image load error: ${src}`);
    setIsError(true);
    setIsLoading(false);
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

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
