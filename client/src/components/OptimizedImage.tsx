import { useState } from "react";
import { ImageOff } from "lucide-react";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  width?: number;
  height?: number;
}

export function OptimizedImage({
  src,
  alt,
  className = "",
  fallbackSrc = "/assets/fallback-story-image.png",
  width,
  height
}: OptimizedImageProps) {
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleError = () => {
    setIsError(true);
    setIsLoading(false);
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  const imageUrl = isError ? fallbackSrc : src;

  return (
    <div className="relative w-full overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-purple-50">
          <div className="w-full h-full animate-pulse bg-purple-100" />
        </div>
      )}
      {isError ? (
        <div className="flex flex-col items-center justify-center p-4 bg-purple-50 text-purple-400 min-h-[200px]">
          <ImageOff className="h-8 w-8 mb-2" />
          <span className="text-sm">Image unavailable</span>
        </div>
      ) : (
        <img
          src={imageUrl}
          alt={alt}
          width={width}
          height={height}
          className={`transition-opacity duration-300 ${className}`}
          style={{ opacity: isLoading ? 0 : 1 }}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}
