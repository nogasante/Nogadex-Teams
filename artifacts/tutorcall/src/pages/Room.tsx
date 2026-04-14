import React, { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff,
  MonitorUp, MessageSquare, PhoneOff,
  MoreVertical, Pin, PinOff, Send
} from "lucide-react";

import { useGetRoom } from "@workspace/api-client-react";
import { useWebRTC } from "@/hooks/useWebRTC";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, setLocation] = useLocation();
  const userName = sessionStorage.getItem("tutorcall-username");

  const { data: room, isLoading: isLoadingRoom } = useGetRoom(roomId || "");

  const [showChat, setShowChat] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!userName) setLocation("/");
  }, [userName, setLocation]);

  const isHost = room?.hostName === userName;

  const {
    localStream,
    peers,
    chatMessages,
    spotlightedPeerId,
    isMuted,
    isVideoOff,
    isScreenSharing,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    sendChatMessage,
    muteParticipant,
    spotlightParticipant,
    socketId,
  } = useWebRTC(roomId || "", userName || "Guest", isHost);

  React.useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  if (!userName || isLoadingRoom) {
    return (
      <div className="room-bg min-h-screen flex items-center justify-center">
        <div className="glass-dark rounded-2xl px-8 py-6 text-white/80 text-sm">
          Loading room...
        </div>
      </div>
    );
  }

  const handleLeave = () => {
    sessionStorage.removeItem("tutorcall-username");
    setLocation("/");
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendChatMessage(chatInput.trim());
      setChatInput("");
    }
  };

  const peersList = Object.values(peers);
  const hasSpotlight = spotlightedPeerId !== null;
  const spotlightedPeer = spotlightedPeerId === socketId ? null : peers[spotlightedPeerId || ""];
  const mainStageStream = spotlightedPeerId === socketId ? localStream : (spotlightedPeer?.stream || null);
  const mainStageName = spotlightedPeerId === socketId ? userName : (spotlightedPeer?.name || "");
  const mainStageIsHost = spotlightedPeerId === socketId ? isHost : spotlightedPeer?.isHost;
  const mainStageIsMuted = spotlightedPeerId === socketId ? isMuted : spotlightedPeer?.isMuted;
  const mainStageIsVideoOff = spotlightedPeerId === socketId ? isVideoOff : spotlightedPeer?.isVideoOff;

  return (
    <div className="room-bg h-screen w-full flex flex-col overflow-hidden" style={{ fontFamily: "Inter, sans-serif" }}>

      {/* ── Header ── */}
      <header className="glass-dark h-16 px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <img src="/nogadex-icon.png" alt="Nogadex" className="h-8 w-8 rounded-xl object-contain" />
          <span className="font-semibold text-base" style={{ color: "hsl(38 20% 90%)" }}>Nogadex</span>
          <span
            className="ml-3 px-3 py-1 rounded-full text-xs font-mono font-medium tracking-widest"
            style={{ background: "rgba(255,248,240,0.10)", color: "hsl(38 20% 70%)" }}
          >
            {roomId}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isHost && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(123,29,50,0.55)", color: "hsl(38 35% 88%)" }}
            >
              Host
            </span>
          )}
          <span className="text-sm" style={{ color: "hsl(38 10% 60%)" }}>{userName}</span>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Video Area */}
        <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">
          {hasSpotlight ? (
            <div className="flex-1 flex flex-col gap-3 overflow-hidden">
              {/* Main stage */}
              <div
                className="flex-1 min-h-0 rounded-2xl overflow-hidden relative ring-burgundy"
                style={{ border: "1px solid rgba(255,248,240,0.12)" }}
              >
                <VideoPlayer
                  stream={mainStageStream}
                  name={mainStageName}
                  isHost={mainStageIsHost}
                  isMuted={mainStageIsMuted}
                  isVideoOff={mainStageIsVideoOff}
                  isLocal={spotlightedPeerId === socketId}
                  className="h-full rounded-none"
                />
                {isHost && (
                  <div className="absolute top-4 left-4 z-10">
                    <button
                      onClick={() => spotlightParticipant(null)}
                      className="glass-btn flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium text-white/80"
                    >
                      <PinOff className="w-3.5 h-3.5" /> Unpin
                    </button>
                  </div>
                )}
              </div>

              {/* Strip */}
              <div className="h-36 shrink-0 flex gap-3 overflow-x-auto pb-1">
                {spotlightedPeerId !== socketId && (
                  <div
                    className="w-56 shrink-0 rounded-2xl overflow-hidden relative group"
                    style={{ border: "1px solid rgba(255,248,240,0.10)" }}
                  >
                    <VideoPlayer stream={localStream} name={userName} isHost={isHost} isMuted={isMuted} isVideoOff={isVideoOff} isLocal className="h-full rounded-none" />
                    {isHost && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="glass-btn rounded-xl p-1.5" onClick={() => spotlightParticipant(socketId)}>
                          <Pin className="h-3.5 w-3.5 text-white/70" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {peersList.filter(p => p.socketId !== spotlightedPeerId).map(peer => (
                  <div
                    key={peer.socketId}
                    className="w-56 shrink-0 rounded-2xl overflow-hidden relative group"
                    style={{ border: "1px solid rgba(255,248,240,0.10)" }}
                  >
                    <VideoPlayer stream={peer.stream} name={peer.name} isHost={peer.isHost} isMuted={peer.isMuted} isVideoOff={peer.isVideoOff} className="h-full rounded-none" />
                    {isHost && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="glass-btn rounded-xl p-1.5">
                              <MoreVertical className="h-3.5 w-3.5 text-white/70" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40 glass-dark border-white/10 text-white/80 text-sm">
                            <DropdownMenuItem onClick={() => muteParticipant(peer.socketId)} className="cursor-pointer focus:bg-white/10">
                              <MicOff className="mr-2 h-3.5 w-3.5" /> Mute mic
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => spotlightParticipant(peer.socketId)} className="cursor-pointer focus:bg-white/10">
                              <Pin className="mr-2 h-3.5 w-3.5" /> Spotlight
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Grid */
            <div className={cn(
              "flex-1 grid gap-3 overflow-hidden",
              peersList.length === 0 ? "grid-cols-1" :
              peersList.length === 1 ? "grid-cols-2" :
              peersList.length <= 3 ? "grid-cols-2 grid-rows-2" :
              peersList.length <= 8 ? "grid-cols-3 grid-rows-3" :
              "grid-cols-4 grid-rows-4"
            )}>
              <div
                className="rounded-2xl overflow-hidden relative group"
                style={{ border: "1px solid rgba(255,248,240,0.12)" }}
              >
                <VideoPlayer stream={localStream} name={userName} isHost={isHost} isMuted={isMuted} isVideoOff={isVideoOff} isLocal className="h-full rounded-none" />
                {isHost && (
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button className="glass-btn rounded-xl p-1.5" onClick={() => spotlightParticipant(socketId)}>
                      <Pin className="h-3.5 w-3.5 text-white/70" />
                    </button>
                  </div>
                )}
              </div>
              {peersList.map(peer => (
                <div
                  key={peer.socketId}
                  className="rounded-2xl overflow-hidden relative group"
                  style={{ border: "1px solid rgba(255,248,240,0.12)" }}
                >
                  <VideoPlayer stream={peer.stream} name={peer.name} isHost={peer.isHost} isMuted={peer.isMuted} isVideoOff={peer.isVideoOff} className="h-full rounded-none" />
                  {isHost && (
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="glass-btn rounded-xl p-1.5">
                            <MoreVertical className="h-3.5 w-3.5 text-white/70" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 glass-dark border-white/10 text-white/80 text-sm">
                          <DropdownMenuItem onClick={() => muteParticipant(peer.socketId)} className="cursor-pointer focus:bg-white/10">
                            <MicOff className="mr-2 h-3.5 w-3.5" /> Mute participant
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => spotlightParticipant(peer.socketId)} className="cursor-pointer focus:bg-white/10">
                            <Pin className="mr-2 h-3.5 w-3.5" /> Pin to main stage
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Chat Sidebar ── */}
        {showChat && (
          <div
            className="glass-dark w-72 shrink-0 border-l flex flex-col z-10"
            style={{ borderColor: "rgba(255,248,240,0.08)" }}
          >
            <div
              className="h-13 px-4 py-3.5 flex items-center gap-2 border-b"
              style={{ borderColor: "rgba(255,248,240,0.08)" }}
            >
              <MessageSquare className="w-4 h-4" style={{ color: "hsl(345 40% 60%)" }} />
              <h3 className="font-semibold text-sm" style={{ color: "hsl(38 20% 88%)" }}>Class Chat</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={chatScrollRef}>
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2">
                  <MessageSquare className="w-7 h-7 opacity-15" style={{ color: "hsl(38 20% 70%)" }} />
                  <p className="text-xs" style={{ color: "hsl(220 5% 50%)" }}>No messages yet</p>
                </div>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold" style={{ color: "hsl(345 50% 65%)" }}>{msg.senderName}</span>
                      <span className="text-[10px]" style={{ color: "hsl(220 5% 45%)" }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div
                      className="rounded-2xl rounded-tl-sm px-3 py-2 text-xs leading-relaxed"
                      style={{ background: "rgba(255,248,240,0.08)", color: "hsl(38 15% 82%)" }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t" style={{ borderColor: "rgba(255,248,240,0.08)" }}>
              <form onSubmit={handleSendChat} className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Message..."
                  className="flex-1 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[hsl(345_60%_45%)]"
                  style={{
                    background: "rgba(255,248,240,0.08)",
                    border: "1px solid rgba(255,248,240,0.12)",
                    color: "hsl(38 15% 88%)",
                  }}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="glass-burgundy rounded-xl px-3 py-2 flex items-center justify-center disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5 text-white/90" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ── Control Bar ── */}
      <div
        className="glass-dark h-20 px-8 flex items-center justify-between shrink-0 z-20 border-t"
        style={{ borderColor: "rgba(255,248,240,0.08)" }}
      >
        <div className="flex-1" />

        <div className="flex items-center gap-3">
          {/* Mute */}
          <button
            onClick={() => toggleMute()}
            className={cn(
              "w-13 h-13 rounded-2xl flex items-center justify-center transition-all",
              isMuted ? "glass-btn-destructive" : "glass-btn"
            )}
            style={{ width: 52, height: 52 }}
          >
            {isMuted
              ? <MicOff className="w-5 h-5 text-white/90" />
              : <Mic className="w-5 h-5 text-white/80" />}
          </button>

          {/* Video */}
          <button
            onClick={toggleVideo}
            className={cn(
              "rounded-2xl flex items-center justify-center transition-all",
              isVideoOff ? "glass-btn-destructive" : "glass-btn"
            )}
            style={{ width: 52, height: 52 }}
          >
            {isVideoOff
              ? <VideoOff className="w-5 h-5 text-white/90" />
              : <VideoIcon className="w-5 h-5 text-white/80" />}
          </button>

          {/* Screen share */}
          <button
            onClick={toggleScreenShare}
            className={cn(
              "rounded-2xl flex items-center justify-center transition-all",
              isScreenSharing ? "glass-burgundy" : "glass-btn"
            )}
            style={{ width: 52, height: 52 }}
          >
            <MonitorUp className="w-5 h-5 text-white/80" />
          </button>

          {/* Divider */}
          <div className="w-px h-7 mx-1" style={{ background: "rgba(255,248,240,0.12)" }} />

          {/* Leave */}
          <button
            onClick={handleLeave}
            className="glass-btn-destructive rounded-2xl flex items-center justify-center"
            style={{ width: 52, height: 52 }}
          >
            <PhoneOff className="w-5 h-5 text-white/90" />
          </button>
        </div>

        <div className="flex-1 flex justify-end">
          <button
            onClick={() => setShowChat(!showChat)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
              showChat ? "glass-burgundy text-white/90" : "glass-btn text-white/60"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Chat
          </button>
        </div>
      </div>
    </div>
  );
}
