import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorBoundary } from "react-error-boundary";

interface AudioPlayerProps {
  audioUrl: string;
}

function FallbackComponent({ error }: { error: Error }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        Failed to load audio: {error.message}
      </AlertDescription>
    </Alert>
  );
}

function AudioPlayerContent({ audioUrl }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    
    // Create new audio element
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    // Add loading timeout
    const loadingTimeout = setTimeout(() => {
      if (isLoading) {
        setError('Audio loading timed out. Please try again.');
        setIsLoading(false);
      }
    }, 10000); // 10 second timeout

    const handleLoadStart = () => {
      setIsLoading(true);
      setError(null);
      setIsPlaying(false);
      setProgress(0);
    };

    const handleCanPlay = () => {
      if (!audioRef.current) return;
      
      console.log('Audio can play:', {
        url: audioUrl,
        duration: audioRef.current.duration,
        readyState: audioRef.current.readyState,
        paused: audioRef.current.paused
      });
      
      // Only update state if we haven't already
      if (isLoading) {
        setIsLoading(false);
        setError(null);
        setProgress(0);
      }
    };

    let metadataTimeout: NodeJS.Timeout;
    
    const handleMetadata = () => {
      // Clear any existing timeout
      if (metadataTimeout) {
        clearTimeout(metadataTimeout);
      }
      
      // Debounce metadata updates
      metadataTimeout = setTimeout(() => {
        if (!audioRef.current) return;
        
        console.log('Audio metadata loaded:', {
          duration: audioRef.current.duration,
          readyState: audioRef.current.readyState
        });
        
        if (audioRef.current.readyState >= 4) {
          setIsLoading(false);
        }
      }, 100);
    };

    const handleTimeUpdate = () => {
      if (!audioRef.current) return;
      const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress(progress);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handleError = () => {
      if (!audioRef.current?.error) return;
      
      const errorMessage = getAudioErrorMessage(audioRef.current.error.code);
      console.error('Audio loading error:', {
        url: audioUrl,
        error: audioRef.current.error,
        message: errorMessage
      });
      
      setError(errorMessage);
      setIsLoading(false);
      setIsPlaying(false);
      setProgress(0);
    };

    // Add event listeners
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleMetadata);
    
    return () => {
      clearTimeout(loadingTimeout);
      clearTimeout(metadataTimeout);
      
      // Cleanup event listeners
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleMetadata);
      
      // Stop and cleanup audio
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [audioUrl, isLoading]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error("Error playing audio:", error);
          setError("Failed to play audio");
        });
      }
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  function getAudioErrorMessage(code: number): string {
    switch (code) {
      case 1:
        return "The audio loading was aborted";
      case 2:
        return "Network error occurred while loading audio";
      case 3:
        return "Audio decoding failed";
      case 4:
        return "Audio format not supported";
      default:
        return "Unknown error occurred";
    }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading && (!audioRef.current || audioRef.current.readyState < 4)) {
    return (
      <div className="flex items-center justify-center p-4 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span>Loading audio{audioRef.current?.duration ? ` (${Math.round(audioRef.current.duration)}s)` : '...'}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-4 p-4 bg-white rounded-lg shadow-sm">
      <Button
        size="icon"
        variant="ghost"
        onClick={togglePlay}
        disabled={isLoading || !!error}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>

      <Slider
        value={[progress]}
        max={100}
        step={1}
        className="w-[60%]"
        onValueChange={(value) => {
          if (audioRef.current) {
            const time = (value[0] / 100) * audioRef.current.duration;
            audioRef.current.currentTime = time;
            setProgress(value[0]);
          }
        }}
        disabled={isLoading || !!error}
      />

      <Button
        size="icon"
        variant="ghost"
        onClick={toggleMute}
        disabled={isLoading || !!error}
      >
        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function AudioPlayer(props: AudioPlayerProps) {
  return (
    <ErrorBoundary FallbackComponent={FallbackComponent}>
      <AudioPlayerContent {...props} />
    </ErrorBoundary>
  );
}
