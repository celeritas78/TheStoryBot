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
    
    console.log('Initializing audio player with URL:', audioUrl);
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    let isInitialLoad = true;
    
    const handleLoadStart = () => {
      if (isInitialLoad) {
        setIsLoading(true);
        setError(null);
        console.log('Initial audio load started');
      }
    };

    const handleCanPlay = () => {
      if (!audioRef.current) return;
      
      // Only update state on initial load or if loading
      if (isInitialLoad || isLoading) {
        console.log('Audio ready to play:', {
          duration: audioRef.current.duration,
          readyState: audioRef.current.readyState
        });
        setIsLoading(false);
        setError(null);
        isInitialLoad = false;
      }
    };

    const handleError = () => {
      if (!audioRef.current?.error) return;
      
      const errorMessage = getAudioErrorMessage(audioRef.current.error);
      console.error('Audio error:', {
        code: audioRef.current.error.code,
        message: errorMessage,
        source: audioRef.current.currentSrc
      });
      
      setError(errorMessage);
      setIsLoading(false);
      setIsPlaying(false);
      
      // Log additional debugging information
      if (audioRef.current) {
        console.debug('Audio element state:', {
          readyState: audioRef.current.readyState,
          networkState: audioRef.current.networkState,
          error: audioRef.current.error,
          src: audioRef.current.currentSrc,
          type: audioRef.current.currentSrc.split('.').pop()?.toLowerCase()
        });
      }
    };

    const handleTimeUpdate = () => {
      if (!audioRef.current) return;
      const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress(progress);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    // Add event listeners
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      // Clean up
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [audioUrl]); // Only depend on audioUrl

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

  function getAudioErrorMessage(error: MediaError | null): string {
    if (!error) return "Unknown error occurred";

    switch (error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        return "The audio loading was aborted";
      case MediaError.MEDIA_ERR_NETWORK:
        return "Network error occurred while loading audio";
      case MediaError.MEDIA_ERR_DECODE:
        return "Audio decoding failed - file may be corrupted";
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        const format = audioRef.current?.currentSrc.split('.').pop()?.toLowerCase();
        return `Audio format ${format ? `'${format}' ` : ''}not supported. The application uses WAV format for better compatibility. Please ensure your audio files are in WAV format.`;
      default:
        return `Unknown error occurred (Code: ${error.code})`;
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

  if (isLoading || (!audioRef.current?.duration && audioRef.current?.readyState && audioRef.current.readyState < 4)) {
    return (
      <div className="flex items-center justify-center p-4 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span>Loading audio...</span>
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