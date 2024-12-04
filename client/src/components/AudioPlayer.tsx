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
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      if (audioRef.current) {
        setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
      }
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      if (onAudioEnd) onAudioEnd();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("ended", handleEnded);
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
          if (audioRef.current) {
            const newTime = (value[0] / 100) * audioRef.current.duration;
            audioRef.current.currentTime = newTime;
            setProgress(value[0]);
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
