import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorBoundary } from "react-error-boundary";

interface AudioPlayerProps {
  audioUrl: string;
}

interface AudioState {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  progress: number;
  isLoading: boolean;
  error: string | null;
  duration: number;
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
  // Single audio instance reference
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout>();
  const currentUrlRef = useRef<string>("");
  
  // Centralized state management
  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false,
    isMuted: false,
    volume: 1,
    progress: 0,
    isLoading: true,
    error: null,
    duration: 0
  });

  // Validate and normalize URL
  const getNormalizedUrl = (url: string): string | null => {
    try {
      return new URL(url, window.location.origin).toString();
    } catch (error) {
      console.error("Invalid URL:", error);
      return null;
    }
  };

  // Cleanup function for audio instance
  const cleanupAudio = () => {
    if (audioRef.current) {
      const audio = audioRef.current;
      
      // Stop playback
      if (!audio.paused) {
        audio.pause();
      }
      
      // Reset state
      audio.currentTime = 0;
      audio.src = "";
      
      // Clean up resources
      audio.load();
      
      // Clear timeout if exists
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    }
  };

  // Initialize or update audio element
  useEffect(() => {
    console.log("Initializing audio player with URL:", {
      original: audioUrl,
      normalized: audioUrl ? getNormalizedUrl(audioUrl) : null
    });

    if (!audioUrl) {
      setAudioState(prev => ({ 
        ...prev, 
        error: "Audio URL is missing", 
        isLoading: false 
      }));
      return;
    }

    const normalizedUrl = getNormalizedUrl(audioUrl);
    if (!normalizedUrl) {
      setAudioState(prev => ({ 
        ...prev, 
        error: "Invalid audio URL", 
        isLoading: false 
      }));
      return;
    }

    // Prevent redundant initialization
    if (normalizedUrl === currentUrlRef.current && audioRef.current?.src) {
      console.log("Skipping redundant audio initialization");
      return;
    }

    // Always cleanup previous instance before creating a new one
    cleanupAudio();

    try {
      // Always create a fresh audio instance
      audioRef.current = new Audio();
      const audio = audioRef.current;
      currentUrlRef.current = normalizedUrl;

      console.log("Audio element created:", audio);

      // Reset state for new audio
      setAudioState(prev => ({
        ...prev,
        isPlaying: false,
        progress: 0,
        error: null,
        isLoading: true,
        duration: 0
      }));

      // Setup event listeners
      const eventListeners = {
        loadstart: () => setAudioState(prev => ({ 
          ...prev, 
          isLoading: true, 
          error: null 
        })),
        
        loadedmetadata: () => {
          if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
          }
          setAudioState(prev => ({
            ...prev,
            isLoading: false,
            duration: audio.duration,
            error: null
          }));
        },

        canplaythrough: () => {
          if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
          }
        },

        error: () => {
          let errorMessage = "Unknown audio error";
          let shouldCleanup = false;

          if (audio.error) {
            errorMessage = getAudioErrorMessage(audio.error);
            // Permanent errors that require cleanup
            shouldCleanup = [
              MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED,
              MediaError.MEDIA_ERR_DECODE
            ].includes(audio.error.code);
          } else if (!navigator.onLine) {
            errorMessage = "Network connection lost. Please check your internet connection.";
          } else if (audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
            errorMessage = "Audio source not found or format not supported";
            shouldCleanup = true;
          }

          console.log("Audio error detected:", errorMessage);

          setAudioState(prev => ({
            ...prev,
            error: errorMessage,
            isLoading: false,
            isPlaying: false
          }));

          if (shouldCleanup) {
            cleanupAudio();
          }
        },

        timeupdate: () => {
          const progress = (audio.currentTime / audio.duration) * 100;
          setAudioState(prev => ({
            ...prev,
            progress: isNaN(progress) ? 0 : progress
          }));
        },

        ended: () => {
          setAudioState(prev => ({ 
            ...prev, 
            isPlaying: false, 
            progress: 0 
          }));
          audio.currentTime = 0;
        },

        stalled: () => {
          setAudioState(prev => ({
            ...prev,
            isLoading: true,
            error: "Audio playback stalled. Please check your connection."
          }));
        }
      };

      // Attach event listeners
      Object.entries(eventListeners).forEach(([event, handler]) => {
        audio.addEventListener(event, handler);
      });

      // Set audio properties
      audio.src = normalizedUrl;
      audio.preload = "metadata";
      audio.volume = audioState.volume;
      audio.muted = audioState.isMuted;

      // Start loading
      audio.load();

      // Set loading timeout
      loadTimeoutRef.current = setTimeout(() => {
        if (audioState.isLoading && !audioState.error) {
          setAudioState(prev => ({
            ...prev,
            error: "Audio loading timed out. Please try again.",
            isLoading: false
          }));
          cleanupAudio();
        }
      }, 15000); // 15 second timeout

      // Cleanup function
      return () => {
        // Remove event listeners
        Object.entries(eventListeners).forEach(([event, handler]) => {
          audio?.removeEventListener(event, handler);
        });
        
        // Cleanup
        cleanupAudio();
      };
    } catch (error) {
      console.error("Error initializing audio:", error);
      setAudioState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to initialize audio",
        isLoading: false
      }));
    }
  }, [audioUrl]);

  // Handle play/pause
  const togglePlay = async () => {
    if (!audioRef.current) return;

    try {
      if (audioState.isPlaying) {
        audioRef.current.pause();
      } else {
        await audioRef.current.play();
      }
      setAudioState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    } catch (error) {
      console.error("Playback error:", error);
      setAudioState(prev => ({
        ...prev,
        error: "Failed to play audio. Please try again.",
        isPlaying: false
      }));
    }
  };

  // Handle mute toggle
  const toggleMute = () => {
    if (!audioRef.current) return;
    
    audioRef.current.muted = !audioState.isMuted;
    setAudioState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  };

  // Map error codes to messages
  function getAudioErrorMessage(error: MediaError): string {
    switch (error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        return "Audio playback was aborted";
      case MediaError.MEDIA_ERR_NETWORK:
        return "Network error occurred while loading audio";
      case MediaError.MEDIA_ERR_DECODE:
        return "Audio file is corrupted or format not supported";
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        return "Audio format or source is not supported";
      default:
        return `Unknown audio error (Code: ${error.code})`;
    }
  }

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  // Show error state
  if (audioState.error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{audioState.error}</AlertDescription>
      </Alert>
    );
  }

  // Show loading state
  if (audioState.isLoading) {
    return (
      <div className="flex items-center justify-center p-4 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span>Loading audio...</span>
      </div>
    );
  }

  // Render player controls
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
        onValueChange={(value) => {
          if (audioRef.current && audioState.duration > 0) {
            const time = (value[0] / 100) * audioState.duration;
            audioRef.current.currentTime = time;
            setAudioState(prev => ({ ...prev, progress: value[0] }));
          }
        }}
      />

      <Button 
        size="icon" 
        variant="ghost" 
        onClick={toggleMute}
        disabled={!audioRef.current || audioState.error !== null}
      >
        {audioState.isMuted ? 
          <VolumeX className="h-4 w-4" /> : 
          <Volume2 className="h-4 w-4" />
        }
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
