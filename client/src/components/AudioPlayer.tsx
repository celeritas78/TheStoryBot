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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      setProgress(0);
      setIsPlaying(false);
    }
  }, [audioUrl]);

  useEffect(() => {
    if (!audioUrl) {
      console.log('AudioPlayer: No audio URL provided');
      return;
    }

    console.log('AudioPlayer: Initializing audio with URL:', audioUrl);
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      if (audioRef.current && !isNaN(audioRef.current.duration)) {
        const duration = audioRef.current.duration;
        const currentTime = audioRef.current.currentTime;
        console.log('AudioPlayer: Time update:', {
          currentTime,
          duration,
          readyState: audio.readyState,
          networkState: audio.networkState
        });
        
        const currentProgress = (currentTime / duration) * 100;
        if (!isNaN(currentProgress)) {
          setProgress(currentProgress);
        } else {
          console.warn('AudioPlayer: Invalid progress calculation:', {
            currentTime,
            duration,
            currentProgress
          });
        }
      }
    };

    const handleCanPlay = () => {
      console.log('AudioPlayer: Audio can play:', {
        duration: audio.duration,
        readyState: audio.readyState
      });
      setIsLoading(false);
    };

    const handleError = (e: ErrorEvent) => {
      console.error('AudioPlayer: Audio error:', {
        error: e,
        errorCode: audio.error?.code,
        errorMessage: audio.error?.message,
        networkState: audio.networkState,
        readyState: audio.readyState,
        src: audio.src
      });
      setIsLoading(false);
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
    };

    const handleLoadedMetadata = () => {
      console.log('AudioPlayer: Loaded metadata:', {
        duration: audio.duration,
        readyState: audio.readyState
      });
    };

    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError as EventListener);

    return () => {
      console.log('AudioPlayer: Cleaning up audio element');
      audio.pause();
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError as EventListener);
    };
  }, [audioUrl, onAudioEnd]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {
        console.error("Failed to play audio");
      });
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;

    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <div className="flex items-center justify-center space-x-4 p-2 rounded-lg shadow-md">
      <Button
        size="icon"
        variant="outline"
        className="h-12 w-12 border-2 border-gradient-to-r from-purple-500 to-pink-500"
        onClick={togglePlay}
      >
        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
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
