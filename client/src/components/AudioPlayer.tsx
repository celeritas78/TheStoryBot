import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface AudioPlayerProps {
  audioUrl: string;
}

export default function AudioPlayer({ audioUrl }: AudioPlayerProps) {
  const [audioState, setAudioState] = useState({
    isPlaying: false,
    isLoading: true,
    error: null as string | null,
    progress: 0
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<number | null>(null);

  // Cleanup function
  const cleanup = () => {
    if (progressInterval.current) {
      window.clearInterval(progressInterval.current);
      progressInterval.current = null;
    }

    if (audioRef.current) {
      const audio = audioRef.current;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  };

  useEffect(() => {
    // Single audio instance creation
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    
    // Reset state
    setAudioState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      progress: 0,
      isPlaying: false
    }));

    // Configure audio
    audio.preload = 'auto';

    const handleLoad = () => {
      setAudioState(prev => ({
        ...prev,
        isLoading: false,
        error: null
      }));
    };

    const handleError = () => {
      const errorMessage = audio.error 
        ? `Audio error: ${audio.error.message || 'Failed to load audio'}`
        : "Failed to load audio";
      
      setAudioState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
        isPlaying: false
      }));
      cleanup();
    };

    const handleEnded = () => {
      setAudioState(prev => ({
        ...prev,
        isPlaying: false,
        progress: 0
      }));
      if (progressInterval.current) {
        window.clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
    };

    // Add event listeners
    audio.addEventListener('loadeddata', handleLoad);
    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    // Set source
    audio.src = audioUrl;

    // Cleanup on unmount or URL change
    return () => {
      audio.removeEventListener('loadeddata', handleLoad);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
      cleanup();
    };
  }, [audioUrl]);

  const togglePlay = async () => {
    if (!audioRef.current) return;

    try {
      if (audioState.isPlaying) {
        audioRef.current.pause();
        if (progressInterval.current) {
          window.clearInterval(progressInterval.current);
          progressInterval.current = null;
        }
        setAudioState(prev => ({ ...prev, isPlaying: false }));
      } else {
        await audioRef.current.play();
        progressInterval.current = window.setInterval(() => {
          if (audioRef.current) {
            const value = (audioRef.current.currentTime / audioRef.current.duration) * 100;
            setAudioState(prev => ({
              ...prev,
              progress: isNaN(value) ? 0 : value
            }));
          }
        }, 100);
        setAudioState(prev => ({ ...prev, isPlaying: true }));
      }
    } catch (err) {
      setAudioState(prev => ({
        ...prev,
        error: "Failed to play audio",
        isPlaying: false
      }));
      console.error("Playback error:", err);
    }
  };

  const handleSliderChange = (value: number[]) => {
    if (!audioRef.current) return;
    const time = (value[0] / 100) * audioRef.current.duration;
    audioRef.current.currentTime = time;
    setAudioState(prev => ({ ...prev, progress: value[0] }));
  };

  if (audioState.error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{audioState.error}</AlertDescription>
      </Alert>
    );
  }

  if (audioState.isLoading) {
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
        disabled={!audioRef.current || audioState.error !== null}
      >
        {audioState.isPlaying ? 
          <Pause className="h-4 w-4" /> : 
          <Play className="h-4 w-4" />
        }
      </Button>

      <Slider
        value={[audioState.progress]}
        max={100}
        step={1}
        className="w-[60%]"
        disabled={!audioRef.current || audioState.error !== null}
        onValueChange={handleSliderChange}
      />
    </div>
  );
}
