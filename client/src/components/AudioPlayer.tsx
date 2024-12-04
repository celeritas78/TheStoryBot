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
    if (!audioUrl) {
      console.warn("Audio URL is missing");
      return;
    }

    const normalizedUrl = new URL(audioUrl, window.location.origin).toString();
    console.log("Initializing audio player with URL:", { original: audioUrl, normalized: normalizedUrl });

    fetch(normalizedUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Audio file not found (${response.status})`);
        }

        const audio = new Audio(normalizedUrl);
        audioRef.current = audio;
        console.log("Audio element created:", audio);

        const handleLoadStart = () => {
          console.log("Audio load started");
          setIsLoading(true);
          setError(null);
        };

        const handleCanPlay = () => {
          console.log("Audio is ready to play");
          setIsLoading(false);
          setError(null);
        };

        const handleError = () => {
          const errorMessage = audioRef.current?.error
            ? getAudioErrorMessage(audioRef.current.error)
            : "Unknown audio error";
          console.error("Audio error detected:", errorMessage);
          setError(errorMessage);
          setIsLoading(false);
        };


        const handleTimeUpdate = () => {
          if (audioRef.current) {
            const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
            setProgress(progress);
          }
        };

        const handleEnded = () => {
          console.log("Audio playback ended");
          setIsPlaying(false);
        };

        audio.addEventListener("loadstart", handleLoadStart);
        audio.addEventListener("canplay", handleCanPlay);
        audio.addEventListener("error", handleError);
        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("ended", handleEnded);

        return () => {
          console.log("Cleaning up audio player");
          audio.removeEventListener("loadstart", handleLoadStart);
          audio.removeEventListener("canplay", handleCanPlay);
          audio.removeEventListener("error", handleError);
          audio.removeEventListener("timeupdate", handleTimeUpdate);
          audio.removeEventListener("ended", handleEnded);
          audio.pause();
          audio.src = "";
        };
      })
      .catch((err) => {
        console.error("Failed to load audio:", err);
        setError(err.message);
        setIsLoading(false);
      });

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      console.log("Pausing audio");
      audioRef.current.pause();
    } else {
      console.log("Attempting to play audio");
      audioRef.current.play().catch((error) => {
        console.error("Error playing audio:", error);
        setError("Failed to play audio");
      });
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    console.log(`Audio muted: ${!isMuted}`);
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
        return "Audio format not supported. Please ensure you're using a supported file.";
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
      <Button size="icon" variant="ghost" onClick={togglePlay}>
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
      />

      <Button size="icon" variant="ghost" onClick={toggleMute}>
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
