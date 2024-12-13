import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorBoundary } from "react-error-boundary";

interface AudioPlayerProps {
  audioUrl: string;
  onAudioEnd?: () => void;
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

function AudioPlayerContent({ audioUrl, onAudioEnd }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioUrl) {
      console.log('AudioPlayer: No audio URL provided');
      setError(new Error('No audio URL provided'));
      setIsLoading(false);
      return;
    }

    // Log the full URL and origin
    console.log('AudioPlayer: Initializing audio with details:', {
      audioUrl,
      origin: window.location.origin,
      hostname: window.location.hostname,
      protocol: window.location.protocol
    });

    const audio = new Audio();
    
    // Set CORS policy
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      if (audio && !isNaN(audio.duration)) {
        const duration = audio.duration;
        const currentTime = audio.currentTime;
        
        console.log('AudioPlayer: Time update:', {
          currentTime,
          duration,
          readyState: audio.readyState,
          networkState: audio.networkState
        });
        
        const currentProgress = (currentTime / duration) * 100;
        if (!isNaN(currentProgress)) {
          setProgress(currentProgress);
        }
      }
    };

    const handleCanPlay = () => {
      console.log('AudioPlayer: Audio can play:', {
        duration: audio.duration,
        readyState: audio.readyState
      });
      setIsLoading(false);
      setError(null);
    };

    const handleError = () => {
      const errorDetails = {
        errorCode: audio.error?.code,
        errorMessage: audio.error?.message,
        networkState: audio.networkState,
        readyState: audio.readyState,
        src: audio.src,
        originalUrl: audioUrl,
        constructedUrl: audio.src,
        crossOrigin: audio.crossOrigin,
        publicPath: true
      };
      console.error('AudioPlayer: Audio error:', errorDetails);
      setError(new Error(`Failed to load audio: ${audio.error?.message || 'Unknown error'}`));
      setIsLoading(false);
      setIsPlaying(false);
    };

    const handleEnded = () => {
      console.log('AudioPlayer: Audio playback ended');
      setIsPlaying(false);
      setProgress(0);
      if (onAudioEnd) onAudioEnd();
    };

    const handleLoadStart = () => {
      console.log('AudioPlayer: Started loading audio');
      setIsLoading(true);
      setError(null);
    };

    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("loadedmetadata", () => console.log('AudioPlayer: Loaded metadata'));
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audio.src = audioUrl;
    audio.load();

    return () => {
      console.log('AudioPlayer: Cleaning up audio element');
      audio.pause();
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("loadedmetadata", () => {});
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [audioUrl, onAudioEnd]);

  const togglePlay = async () => {
    if (!audioRef.current || error) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error("Failed to play audio:", err);
      setError(err instanceof Error ? err : new Error('Failed to play audio'));
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex items-center justify-center space-x-4 p-2 rounded-lg shadow-md">
      <Button
        size="icon"
        variant="outline"
        className="h-12 w-12 border-2 border-gradient-to-r from-purple-500 to-pink-500"
        onClick={togglePlay}
        disabled={isLoading || !!error}
      >
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-6 w-6" />
        ) : (
          <Play className="h-6 w-6" />
        )}
      </Button>
      <Slider
        value={[progress]}
        max={100}
        step={1}
        className="flex-1"
        onValueChange={(value) => {
          if (audioRef.current && !isNaN(audioRef.current.duration)) {
            const newTime = (value[0] / 100) * audioRef.current.duration;
            if (!isNaN(newTime)) {
              audioRef.current.currentTime = newTime;
              setProgress(value[0]);
            }
          }
        }}
      />
      <Button
        size="icon"
        variant="outline"
        className="h-12 w-12 border-2 border-gradient-to-r from-purple-500 to-pink-500"
        onClick={toggleMute}
        disabled={isLoading || !!error}
      >
        {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
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
