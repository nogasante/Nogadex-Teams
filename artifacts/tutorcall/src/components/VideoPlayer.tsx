import React, { useEffect, useRef } from "react";
import { User, MicOff, VideoOff } from "lucide-react";
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
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={cn("relative rounded-xl overflow-hidden bg-slate-900 shadow-md group", className)}>
      {isVideoOff || !stream ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
            <User size={40} />
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={cn("w-full h-full object-cover", isLocal && !stream.getVideoTracks()[0]?.label.includes("screen") ? "scale-x-[-1]" : "")}
        />
      )}

      {/* Overlays */}
      <div className="absolute bottom-3 left-3 flex items-center space-x-2">
        <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-sm font-medium flex items-center shadow-sm">
          {name} {isLocal && "(You)"}
        </div>
        {isHost && (
          <div className="bg-primary/90 backdrop-blur-md px-2 py-1 rounded-md text-white text-xs font-semibold uppercase tracking-wider">
            Host
          </div>
        )}
      </div>

      <div className="absolute top-3 right-3 flex items-center space-x-2">
        {isMuted && (
          <div className="bg-red-500/90 text-white p-1.5 rounded-md shadow-sm">
            <MicOff size={16} />
          </div>
        )}
      </div>
    </div>
  );
}
