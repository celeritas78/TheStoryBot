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
  
  // Log the initial image URL
  useEffect(() => {
    console.log('OptimizedImage: Initializing with props:', {
      src,
      priority,
      className,
      width,
      height
    });
  }, [src, priority, className, width, height]);

  useEffect(() => {
    let mounted = true;
    
    if (!priority && src) {
      console.log('OptimizedImage: Loading image with src:', src);
      // Reset states when src changes
      setIsLoading(true);
      setIsError(false);
      setImageSrc(''); // Clear current image while loading

      const loadImage = async () => {
        try {
          console.log('OptimizedImage: Creating new Image object for:', src);
          // Create new image object
          const img = new Image();
          
          // Create a promise to handle image loading
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              console.log('OptimizedImage: Image loaded successfully:', {
                src,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
                complete: img.complete
              });
              resolve();
            };
            img.onerror = () => {
              console.error('OptimizedImage: Image load error:', {
                src,
                complete: img.complete,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight
              });
              reject(new Error(`Failed to load image: ${src}`));
            };
            img.src = src;
          });

          if (mounted) {
            console.log('OptimizedImage: Updating component state with loaded image');
            setImageSrc(src);
            setIsLoading(false);
          }
        } catch (error: unknown) {
          console.error('OptimizedImage: Failed to load image:', {
            src,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType: error instanceof Error ? error.name : 'Unknown',
          });
          if (mounted) {
            setIsError(true);
            setIsLoading(false);
          }
        }
      };

      loadImage();
    }

    return () => {
      mounted = false;
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
