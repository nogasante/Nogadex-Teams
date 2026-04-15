import React, { useEffect, useRef } from "react";
import { User, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  stream: MediaStream | null;
  name: string;
  isHost?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isLocal?: boolean;
  className?: string;
}

export function VideoPlayer({
  stream,
  name,
  isHost,
  isMuted,
  isVideoOff,
  isLocal,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const initials = name ? name.slice(0, 2).toUpperCase() : "?";

  return (
    <div className={cn("relative rounded-xl overflow-hidden group", className)}
      style={{ background: "hsl(220 8% 15%)" }}>

      {/* Video — always rendered so srcObject assignment works */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={cn(
          "w-full h-full object-cover",
          (isVideoOff || !stream) && "hidden",
          isLocal && !stream?.getVideoTracks()[0]?.label.toLowerCase().includes("screen") ? "scale-x-[-1]" : ""
        )}
      />

      {/* Avatar when video is off */}
      {(isVideoOff || !stream) && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: "hsl(220 8% 16%)" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold"
            style={{ background: "rgba(123,29,50,0.35)", color: "hsl(38 25% 82%)" }}>
            {initials}
          </div>
        </div>
      )}

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center justify-between"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)" }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/90">{name}{isLocal ? " (You)" : ""}</span>
          {isHost && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-md"
              style={{ background: "rgba(123,29,50,0.75)", color: "hsl(38 35% 88%)" }}>Host</span>
          )}
        </div>
        {isMuted && (
          <div className="flex items-center justify-center w-5 h-5 rounded-lg"
            style={{ background: "rgba(180,28,28,0.80)" }}>
            <MicOff size={11} className="text-white/90" />
          </div>
        )}
      </div>
    </div>
  );
}
