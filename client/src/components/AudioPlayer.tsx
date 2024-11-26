import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

interface AudioPlayerProps {
  audioUrl: string;
}

export default function AudioPlayer({ audioUrl }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress(progress);
    }
  };

  const handleError = () => {
    setError("Failed to load audio");
    setIsLoading(false);
    setIsPlaying(false);
  };

  const handleLoadedData = () => {
    setIsLoading(false);
    setError(null);
  };

  if (error) {
    return <div className="text-red-500 text-sm">Failed to load audio</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500 text-sm">Loading audio...</div>;
  }

  return (
    <div className="flex items-center space-x-4">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onError={handleError}
        onLoadedData={handleLoadedData}
      />
      
      <Button
        size="icon"
        variant="ghost"
        onClick={togglePlay}
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
      />

      <Button
        size="icon"
        variant="ghost"
        onClick={toggleMute}
      >
        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </Button>
    </div>
  );
}
