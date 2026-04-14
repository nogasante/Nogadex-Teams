import React, { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff,
  MonitorUp, MessageSquare, PhoneOff,
  MoreVertical, Pin, PinOff, Send,
  Hand, Users, Copy, Check, Clock,
  ChevronDown
} from "lucide-react";

import { useGetRoom } from "@workspace/api-client-react";
import { useWebRTC } from "@/hooks/useWebRTC";
import { VideoPlayer } from "@/components/VideoPlayer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Session timer
function useSessionTimer() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, "0");
  const s = (elapsed % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

// Floating reaction
interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
  x: number;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "🙌", "🤔", "💯", "🔥"];

type SidePanel = "chat" | "participants" | null;

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, setLocation] = useLocation();
  const userName = sessionStorage.getItem("tutorcall-username");
  const audioOnly = sessionStorage.getItem("tutorcall-audio-only") === "true";

  const { data: room, isLoading: isLoadingRoom } = useGetRoom(roomId || "");

  const [sidePanel, setSidePanel] = useState<SidePanel>("chat");
  const [chatInput, setChatInput] = useState("");
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const timer = useSessionTimer();

  useEffect(() => {
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
    isHandRaised,
    reactions,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    sendChatMessage,
    muteParticipant,
    spotlightParticipant,
    raiseHand,
    lowerHand,
    hostLowerHand,
    sendReaction,
    socketId,
  } = useWebRTC(roomId || "", userName || "Guest", isHost, audioOnly);

  // Scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Floating reactions
  useEffect(() => {
    if (reactions.length === 0) return;
    const latest = reactions[reactions.length - 1];
    const floating: FloatingReaction = {
      id: latest.id,
      emoji: latest.emoji,
      senderName: latest.senderName,
      x: 15 + Math.random() * 70,
    };
    setFloatingReactions(prev => [...prev, floating]);
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== floating.id));
    }, 3200);
  }, [reactions]);

  // Copy room ID
  const copyRoomId = useCallback(() => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId).then(() => {
      setCopiedRoomId(true);
      setTimeout(() => setCopiedRoomId(false), 2000);
    });
  }, [roomId]);

  const togglePanel = (panel: SidePanel) => {
    setSidePanel(prev => prev === panel ? null : panel);
  };

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
    sessionStorage.removeItem("tutorcall-audio-only");
    setLocation("/");
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendChatMessage(chatInput.trim());
      setChatInput("");
    }
  };

  const handleToggleHand = () => {
    if (isHandRaised) lowerHand();
    else raiseHand();
  };

  const peersList = Object.values(peers);
  const hasSpotlight = spotlightedPeerId !== null;
  const spotlightedPeer = spotlightedPeerId === socketId ? null : peers[spotlightedPeerId || ""];
  const raisedHandPeers = peersList.filter(p => p.handRaised);

  const mainStageStream = spotlightedPeerId === socketId ? localStream : (spotlightedPeer?.stream || null);
  const mainStageName = spotlightedPeerId === socketId ? userName : (spotlightedPeer?.name || "");
  const mainStageIsHost = spotlightedPeerId === socketId ? isHost : spotlightedPeer?.isHost;
  const mainStageIsMuted = spotlightedPeerId === socketId ? isMuted : spotlightedPeer?.isMuted;
  const mainStageIsVideoOff = spotlightedPeerId === socketId ? isVideoOff : spotlightedPeer?.isVideoOff;

  const gridCols =
    peersList.length === 0 ? "grid-cols-1" :
    peersList.length === 1 ? "grid-cols-2" :
    peersList.length <= 3 ? "grid-cols-2" :
    peersList.length <= 8 ? "grid-cols-3" :
    "grid-cols-4";

  return (
    <div className="room-bg h-screen w-full flex flex-col overflow-hidden select-none" style={{ fontFamily: "Inter, sans-serif" }}>

      {/* ── Floating Reactions ── */}
      <div className="fixed inset-0 pointer-events-none z-50">
        {floatingReactions.map(r => (
          <div
            key={r.id}
            className="absolute bottom-28 animate-float-up flex flex-col items-center gap-1"
            style={{ left: `${r.x}%` }}
          >
            <span className="text-4xl drop-shadow-lg" style={{ animation: "floatUp 3.2s ease-out forwards" }}>
              {r.emoji}
            </span>
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.45)", color: "rgba(255,255,255,0.85)" }}
            >
              {r.senderName}
            </span>
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <header className="glass-dark h-14 px-5 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <img src="/nogadex-icon.png" alt="Nogadex" className="h-7 w-7 rounded-xl object-contain" />
          <span className="font-semibold text-sm" style={{ color: "hsl(38 20% 90%)" }}>Nogadex</span>

          {/* Room code + copy */}
          <button
            onClick={copyRoomId}
            className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all"
            style={{ background: "rgba(255,248,240,0.08)", border: "1px solid rgba(255,248,240,0.12)" }}
          >
            <span className="text-xs font-mono font-medium tracking-widest" style={{ color: "hsl(38 20% 72%)" }}>
              {roomId}
            </span>
            {copiedRoomId
              ? <Check className="w-3 h-3" style={{ color: "hsl(142 50% 55%)" }} />
              : <Copy className="w-3 h-3" style={{ color: "hsl(38 15% 55%)" }} />}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Timer */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(255,248,240,0.06)" }}>
            <Clock className="w-3 h-3" style={{ color: "hsl(38 15% 55%)" }} />
            <span className="text-xs font-mono" style={{ color: "hsl(38 15% 62%)" }}>{timer}</span>
          </div>

          {/* Hand raise queue — host sees count */}
          {isHost && raisedHandPeers.length > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
              style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.25)" }}
            >
              <Hand className="w-3 h-3" style={{ color: "rgb(234,179,8)" }} />
              <span className="text-xs font-semibold" style={{ color: "rgb(234,179,8)" }}>
                {raisedHandPeers.length} hand{raisedHandPeers.length > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {isHost && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(123,29,50,0.55)", color: "hsl(38 35% 88%)" }}
            >
              Host
            </span>
          )}
          <span className="text-xs" style={{ color: "hsl(38 10% 58%)" }}>{userName}</span>
          {audioOnly && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,248,240,0.08)", color: "hsl(38 10% 52%)" }}>
              Audio only
            </span>
          )}
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Video Area */}
        <div className="flex-1 p-3 flex flex-col gap-3 overflow-hidden">
          {hasSpotlight ? (
            <div className="flex-1 flex flex-col gap-3 overflow-hidden">
              {/* Main stage */}
              <div className="flex-1 min-h-0 rounded-2xl overflow-hidden relative ring-burgundy"
                style={{ border: "1px solid rgba(255,248,240,0.12)" }}>
                <VideoPlayer
                  stream={mainStageStream}
                  name={mainStageName || ""}
                  isHost={mainStageIsHost}
                  isMuted={mainStageIsMuted}
                  isVideoOff={mainStageIsVideoOff}
                  isLocal={spotlightedPeerId === socketId}
                  className="h-full rounded-none"
                />
                {isHost && (
                  <button
                    onClick={() => spotlightParticipant(null)}
                    className="absolute top-3 left-3 glass-btn flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-white/80"
                  >
                    <PinOff className="w-3 h-3" /> Unpin
                  </button>
                )}
              </div>

              {/* Strip */}
              <div className="h-32 shrink-0 flex gap-2.5 overflow-x-auto">
                {spotlightedPeerId !== socketId && (
                  <PeerTile
                    stream={localStream} name={userName || ""} isHost={isHost}
                    isMuted={isMuted} isVideoOff={isVideoOff} isLocal
                    isHandRaised={isHandRaised}
                    onPin={isHost ? () => spotlightParticipant(socketId) : undefined}
                  />
                )}
                {peersList.filter(p => p.socketId !== spotlightedPeerId).map(peer => (
                  <PeerTile
                    key={peer.socketId}
                    stream={peer.stream} name={peer.name} isHost={peer.isHost}
                    isMuted={peer.isMuted} isVideoOff={peer.isVideoOff}
                    isHandRaised={peer.handRaised}
                    onPin={isHost ? () => spotlightParticipant(peer.socketId) : undefined}
                    onMute={isHost ? () => muteParticipant(peer.socketId) : undefined}
                    onLowerHand={isHost && peer.handRaised ? () => hostLowerHand(peer.socketId) : undefined}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* Grid */
            <div className={cn("flex-1 grid gap-3 overflow-hidden auto-rows-fr", gridCols)}>
              <PeerTile
                stream={localStream} name={userName || ""} isHost={isHost}
                isMuted={isMuted} isVideoOff={isVideoOff} isLocal
                isHandRaised={isHandRaised}
                onPin={isHost ? () => spotlightParticipant(socketId) : undefined}
                large
              />
              {peersList.map(peer => (
                <PeerTile
                  key={peer.socketId}
                  stream={peer.stream} name={peer.name} isHost={peer.isHost}
                  isMuted={peer.isMuted} isVideoOff={peer.isVideoOff}
                  isHandRaised={peer.handRaised}
                  onPin={isHost ? () => spotlightParticipant(peer.socketId) : undefined}
                  onMute={isHost ? () => muteParticipant(peer.socketId) : undefined}
                  onLowerHand={isHost && peer.handRaised ? () => hostLowerHand(peer.socketId) : undefined}
                  large
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Side Panel ── */}
        {sidePanel && (
          <div
            className="glass-dark w-72 shrink-0 border-l flex flex-col z-10"
            style={{ borderColor: "rgba(255,248,240,0.08)" }}
          >
            {sidePanel === "chat" ? (
              <>
                <div className="h-12 px-4 flex items-center gap-2 border-b" style={{ borderColor: "rgba(255,248,240,0.08)" }}>
                  <MessageSquare className="w-3.5 h-3.5" style={{ color: "hsl(345 40% 60%)" }} />
                  <h3 className="font-semibold text-sm flex-1" style={{ color: "hsl(38 20% 88%)" }}>Chat</h3>
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,248,240,0.10)", color: "hsl(38 10% 58%)" }}>
                    {chatMessages.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3.5 space-y-3" ref={chatScrollRef}>
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-10">
                      <MessageSquare className="w-7 h-7 opacity-15" style={{ color: "hsl(38 20% 70%)" }} />
                      <p className="text-xs" style={{ color: "hsl(220 5% 45%)" }}>No messages yet</p>
                    </div>
                  ) : (
                    chatMessages.map(msg => (
                      <div key={msg.id} className="space-y-1">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[11px] font-semibold" style={{ color: "hsl(345 50% 65%)" }}>{msg.senderName}</span>
                          <span className="text-[10px]" style={{ color: "hsl(220 5% 42%)" }}>
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

                <form onSubmit={handleSendChat} className="p-3 border-t flex gap-2" style={{ borderColor: "rgba(255,248,240,0.08)" }}>
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
              </>
            ) : (
              /* Participants panel */
              <>
                <div className="h-12 px-4 flex items-center gap-2 border-b" style={{ borderColor: "rgba(255,248,240,0.08)" }}>
                  <Users className="w-3.5 h-3.5" style={{ color: "hsl(345 40% 60%)" }} />
                  <h3 className="font-semibold text-sm flex-1" style={{ color: "hsl(38 20% 88%)" }}>Participants</h3>
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,248,240,0.10)", color: "hsl(38 10% 58%)" }}>
                    {peersList.length + 1}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {/* Self */}
                  <ParticipantRow
                    name={`${userName} (you)`}
                    isHost={isHost}
                    isMuted={isMuted}
                    isVideoOff={isVideoOff}
                    isHandRaised={isHandRaised}
                    audioOnly={audioOnly}
                  />
                  {peersList.map(peer => (
                    <ParticipantRow
                      key={peer.socketId}
                      name={peer.name}
                      isHost={peer.isHost}
                      isMuted={peer.isMuted}
                      isVideoOff={peer.isVideoOff}
                      isHandRaised={peer.handRaised}
                      onMute={isHost ? () => muteParticipant(peer.socketId) : undefined}
                      onPin={isHost ? () => spotlightParticipant(peer.socketId) : undefined}
                      onLowerHand={isHost && peer.handRaised ? () => hostLowerHand(peer.socketId) : undefined}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Control Bar ── */}
      <div
        className="glass-dark h-20 px-6 flex items-center justify-between shrink-0 z-20 border-t"
        style={{ borderColor: "rgba(255,248,240,0.08)" }}
      >
        {/* Left — reactions */}
        <div className="flex-1 flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowReactionPicker(!showReactionPicker)}
              className="glass-btn rounded-2xl flex items-center gap-2 px-3.5 h-11 text-sm font-medium text-white/70"
            >
              😊
              <ChevronDown className="w-3 h-3 text-white/40" />
            </button>
            {showReactionPicker && (
              <div
                className="absolute bottom-14 left-0 glass-dark rounded-2xl p-2 flex flex-wrap gap-1.5"
                style={{ width: 216, border: "1px solid rgba(255,248,240,0.12)" }}
              >
                {REACTION_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => { sendReaction(emoji); setShowReactionPicker(false); }}
                    className="w-9 h-9 flex items-center justify-center text-xl rounded-xl hover:scale-110 transition-transform"
                    style={{ background: "rgba(255,248,240,0.08)" }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center — core controls */}
        <div className="flex items-center gap-3">
          {/* Mute */}
          <CtrlBtn active={isMuted} destructive={isMuted} onClick={toggleMute} label={isMuted ? "Unmute" : "Mute"}>
            {isMuted ? <MicOff className="w-5 h-5 text-white/90" /> : <Mic className="w-5 h-5 text-white/80" />}
          </CtrlBtn>

          {/* Video */}
          <CtrlBtn active={isVideoOff} destructive={isVideoOff} onClick={toggleVideo} label={isVideoOff ? "Start camera" : "Stop camera"}>
            {isVideoOff ? <VideoOff className="w-5 h-5 text-white/90" /> : <VideoIcon className="w-5 h-5 text-white/80" />}
          </CtrlBtn>

          {/* Screen share */}
          <CtrlBtn active={isScreenSharing} onClick={toggleScreenShare} label={isScreenSharing ? "Stop share" : "Share screen"}>
            <MonitorUp className="w-5 h-5 text-white/80" />
          </CtrlBtn>

          {/* Raise hand */}
          <CtrlBtn active={isHandRaised} onClick={handleToggleHand} label={isHandRaised ? "Lower hand" : "Raise hand"}
            style={isHandRaised ? { background: "rgba(234,179,8,0.70)", border: "1px solid rgba(234,179,8,0.35)" } : undefined}>
            <Hand className={cn("w-5 h-5", isHandRaised ? "text-yellow-100" : "text-white/80")} />
          </CtrlBtn>

          <div className="w-px h-7 mx-1" style={{ background: "rgba(255,248,240,0.12)" }} />

          {/* Leave */}
          <CtrlBtn destructive onClick={handleLeave} label="Leave">
            <PhoneOff className="w-5 h-5 text-white/90" />
          </CtrlBtn>
        </div>

        {/* Right — panel toggles */}
        <div className="flex-1 flex items-center justify-end gap-2">
          <PanelToggle
            active={sidePanel === "participants"}
            onClick={() => togglePanel("participants")}
            count={peersList.length + 1}
          >
            <Users className="w-4 h-4" />
          </PanelToggle>
          <PanelToggle
            active={sidePanel === "chat"}
            onClick={() => togglePanel("chat")}
            count={chatMessages.length}
          >
            <MessageSquare className="w-4 h-4" />
          </PanelToggle>
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          0%   { opacity: 0; transform: translateY(0) scale(0.6); }
          15%  { opacity: 1; transform: translateY(-20px) scale(1.1); }
          70%  { opacity: 1; transform: translateY(-90px) scale(1); }
          100% { opacity: 0; transform: translateY(-140px) scale(0.9); }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

interface PeerTileProps {
  stream: MediaStream | null;
  name: string;
  isHost?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isLocal?: boolean;
  isHandRaised?: boolean;
  onPin?: () => void;
  onMute?: () => void;
  onLowerHand?: () => void;
  large?: boolean;
}

function PeerTile({ stream, name, isHost, isMuted, isVideoOff, isLocal, isHandRaised, onPin, onMute, onLowerHand, large }: PeerTileProps) {
  return (
    <div
      className={cn("rounded-2xl overflow-hidden relative group shrink-0", large ? "h-full" : "w-52 h-full")}
      style={{ border: "1px solid rgba(255,248,240,0.12)" }}
    >
      <VideoPlayer
        stream={stream} name={name} isHost={isHost}
        isMuted={isMuted} isVideoOff={isVideoOff} isLocal={isLocal}
        className="h-full rounded-none"
      />

      {/* Hand raised badge */}
      {isHandRaised && (
        <div
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-semibold"
          style={{ background: "rgba(234,179,8,0.80)", color: "#fff" }}
        >
          ✋ Hand raised
        </div>
      )}

      {/* Host hover menu */}
      {(onPin || onMute || onLowerHand) && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="glass-btn rounded-xl p-1.5">
                <MoreVertical className="h-3.5 w-3.5 text-white/70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 glass-dark border-white/10 text-white/80 text-sm">
              {onMute && (
                <DropdownMenuItem onClick={onMute} className="cursor-pointer focus:bg-white/10">
                  <MicOff className="mr-2 h-3.5 w-3.5" /> Mute mic
                </DropdownMenuItem>
              )}
              {onPin && (
                <DropdownMenuItem onClick={onPin} className="cursor-pointer focus:bg-white/10">
                  <Pin className="mr-2 h-3.5 w-3.5" /> Pin to stage
                </DropdownMenuItem>
              )}
              {onLowerHand && (
                <DropdownMenuItem onClick={onLowerHand} className="cursor-pointer focus:bg-white/10">
                  <Hand className="mr-2 h-3.5 w-3.5" /> Lower hand
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

interface ParticipantRowProps {
  name: string;
  isHost?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isHandRaised?: boolean;
  audioOnly?: boolean;
  onMute?: () => void;
  onPin?: () => void;
  onLowerHand?: () => void;
}

function ParticipantRow({ name, isHost, isMuted, isVideoOff, isHandRaised, audioOnly, onMute, onPin, onLowerHand }: ParticipantRowProps) {
  const initials = name.slice(0, 2).toUpperCase();
  const hasActions = onMute || onPin || onLowerHand;

  return (
    <div
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl group"
      style={{ background: "rgba(255,248,240,0.04)" }}
    >
      <div
        className="w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-bold shrink-0"
        style={{ background: "rgba(123,29,50,0.45)", color: "hsl(38 35% 88%)" }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: "hsl(38 15% 82%)" }}>{name}</div>
        <div className="flex items-center gap-1 mt-0.5">
          {isHost && <span className="text-[9px] font-semibold px-1.5 py-px rounded-full" style={{ background: "rgba(123,29,50,0.45)", color: "hsl(38 35% 80%)" }}>Host</span>}
          {audioOnly && <span className="text-[9px] px-1.5 py-px rounded-full" style={{ background: "rgba(255,248,240,0.08)", color: "hsl(38 10% 52%)" }}>Audio</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isHandRaised && <span className="text-sm">✋</span>}
        {isMuted
          ? <MicOff className="w-3.5 h-3.5" style={{ color: "hsl(0 60% 55%)" }} />
          : <Mic className="w-3.5 h-3.5" style={{ color: "hsl(142 40% 50%)" }} />}
        {isVideoOff
          ? <VideoOff className="w-3.5 h-3.5" style={{ color: "hsl(0 60% 55%)" }} />
          : <VideoIcon className="w-3.5 h-3.5" style={{ color: "hsl(142 40% 50%)" }} />}
        {hasActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="w-3.5 h-3.5 text-white/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 glass-dark border-white/10 text-white/80 text-xs">
              {onMute && <DropdownMenuItem onClick={onMute} className="cursor-pointer focus:bg-white/10"><MicOff className="mr-2 h-3.5 w-3.5" />Mute</DropdownMenuItem>}
              {onPin && <DropdownMenuItem onClick={onPin} className="cursor-pointer focus:bg-white/10"><Pin className="mr-2 h-3.5 w-3.5" />Spotlight</DropdownMenuItem>}
              {onLowerHand && <DropdownMenuItem onClick={onLowerHand} className="cursor-pointer focus:bg-white/10"><Hand className="mr-2 h-3.5 w-3.5" />Lower hand</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

interface CtrlBtnProps {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  destructive?: boolean;
  label?: string;
  style?: React.CSSProperties;
}

function CtrlBtn({ children, onClick, active, destructive, label, style }: CtrlBtnProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "rounded-2xl flex items-center justify-center transition-all",
        destructive ? "glass-btn-destructive" : active ? "glass-burgundy" : "glass-btn"
      )}
      style={{ width: 48, height: 48, ...style }}
    >
      {children}
    </button>
  );
}

interface PanelToggleProps {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
}

function PanelToggle({ children, active, onClick, count }: PanelToggleProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 rounded-xl px-3.5 h-9 text-xs font-medium transition-all",
        active ? "glass-burgundy text-white/90" : "glass-btn text-white/55"
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className="text-[10px] font-bold px-1.5 py-px rounded-full"
          style={{ background: active ? "rgba(255,255,255,0.20)" : "rgba(255,248,240,0.15)" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
