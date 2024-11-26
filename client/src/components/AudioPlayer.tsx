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
    
    console.log('Audio player mounting with URL:', audioUrl);
    
    // Create new audio element
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    // Add event listeners
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', () => setIsPlaying(false));
    
    return () => {
      // Cleanup event listeners
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', () => setIsPlaying(false));
      
      // Stop and cleanup audio
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [audioUrl]);

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

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
    setProgress(progress);
  };

  const handleLoadStart = () => {
    console.log('Audio loading started:', {
      url: audioUrl,
      element: audioRef.current,
      readyState: audioRef.current?.readyState,
      networkState: audioRef.current?.networkState,
    });
    setIsLoading(true);
    setError(null);
    setIsPlaying(false);
    setProgress(0);
  };

  const handleCanPlay = () => {
    console.log('Audio can play:', {
      url: audioUrl,
      duration: audioRef.current?.duration,
      readyState: audioRef.current?.readyState,
    });
    setIsLoading(false);
    setError(null);
    // Auto-play when ready if it was playing before
    if (audioRef.current && isPlaying) {
      audioRef.current.play().catch(error => {
        console.error('Auto-play failed:', error);
        setIsPlaying(false);
      });
    }
  };

  const handleError = (event: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    const audioElement = event.currentTarget;
    console.error('Audio loading error:', {
      url: audioUrl,
      error: audioElement.error,
      code: audioElement.error?.code,
      message: audioElement.error?.message,
      networkState: audioElement.networkState,
      readyState: audioElement.readyState,
    });
    setError(`Failed to load audio: ${audioElement.error?.message || 'Unknown error'}`);
    setIsLoading(false);
    setIsPlaying(false);
    setProgress(0);
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span>Loading audio...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-4 p-4 bg-white rounded-lg shadow-sm">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onError={handleError}
        onLoadStart={handleLoadStart}
        onCanPlay={handleCanPlay}
      />
      
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
