import React, { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  MonitorUp, MessageSquare, Users, PhoneOff,
  MoreVertical, Pin, PinOff, Send
} from "lucide-react";

import { useGetRoom, useGetRoomParticipants } from "@workspace/api-client-react";
import { useWebRTC } from "@/hooks/useWebRTC";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
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

  useEffect(() => {
    if (!userName) {
      setLocation("/");
    }
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
    socketId
  } = useWebRTC(roomId || "", userName || "Guest", isHost);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  if (!userName || isLoadingRoom) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-white">Loading room...</div></div>;
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
  
  // Determine layout structure based on spotlight
  const hasSpotlight = spotlightedPeerId !== null;
  const spotlightedPeer = spotlightedPeerId === socketId ? null : peers[spotlightedPeerId || ""];
  
  const mainStageStream = spotlightedPeerId === socketId ? localStream : (spotlightedPeer?.stream || null);
  const mainStageName = spotlightedPeerId === socketId ? userName : (spotlightedPeer?.name || "");
  const mainStageIsHost = spotlightedPeerId === socketId ? isHost : (spotlightedPeer?.isHost);
  const mainStageIsMuted = spotlightedPeerId === socketId ? isMuted : (spotlightedPeer?.isMuted);
  const mainStageIsVideoOff = spotlightedPeerId === socketId ? isVideoOff : (spotlightedPeer?.isVideoOff);

  return (
    <div className="h-screen w-full bg-slate-950 flex flex-col overflow-hidden font-sans text-slate-100">
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between bg-slate-900 border-b border-slate-800 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
            <VideoIcon size={18} />
          </div>
          <span className="font-semibold text-lg tracking-tight">TutorCall</span>
          <span className="ml-4 px-3 py-1 rounded-full bg-slate-800 text-xs font-medium text-slate-300">
            Room: {roomId}
          </span>
        </div>
        <div className="flex items-center gap-4">
           {isHost && (
             <span className="text-sm font-medium text-primary">Host</span>
           )}
           <span className="text-sm text-slate-400">{userName}</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Area */}
        <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden relative">
          
          {hasSpotlight ? (
             <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                {/* Spotlight Video */}
                <div className="flex-1 min-h-0 bg-slate-900 rounded-xl overflow-hidden border border-slate-800 relative shadow-lg">
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
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => spotlightParticipant(null)}
                          className="bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-md"
                        >
                          <PinOff className="w-4 h-4 mr-2" />
                          Unpin
                        </Button>
                      </div>
                  )}
                </div>
                
                {/* Strip of other participants */}
                <div className="h-40 shrink-0 flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                   {spotlightedPeerId !== socketId && (
                      <div className="w-64 shrink-0 rounded-xl overflow-hidden border border-slate-800 relative group">
                        <VideoPlayer 
                          stream={localStream}
                          name={userName}
                          isHost={isHost}
                          isMuted={isMuted}
                          isVideoOff={isVideoOff}
                          isLocal={true}
                          className="h-full rounded-none"
                        />
                         {isHost && (
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="icon" variant="secondary" className="h-8 w-8 bg-black/50 hover:bg-black/80" onClick={() => spotlightParticipant(socketId)}>
                                 <Pin className="h-4 w-4" />
                              </Button>
                            </div>
                         )}
                      </div>
                   )}
                   {peersList.filter(p => p.socketId !== spotlightedPeerId).map(peer => (
                      <div key={peer.socketId} className="w-64 shrink-0 rounded-xl overflow-hidden border border-slate-800 relative group">
                        <VideoPlayer 
                          stream={peer.stream}
                          name={peer.name}
                          isHost={peer.isHost}
                          isMuted={peer.isMuted}
                          isVideoOff={peer.isVideoOff}
                          className="h-full rounded-none"
                        />
                        {isHost && (
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="secondary" className="h-8 w-8 bg-black/50 hover:bg-black/80">
                                  <MoreVertical className="h-4 w-4 text-white" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40 border-slate-800 bg-slate-900 text-slate-200">
                                <DropdownMenuItem onClick={() => muteParticipant(peer.socketId)} className="cursor-pointer focus:bg-slate-800 focus:text-white">
                                  <MicOff className="mr-2 h-4 w-4" /> Mute mic
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => spotlightParticipant(peer.socketId)} className="cursor-pointer focus:bg-slate-800 focus:text-white">
                                  <Pin className="mr-2 h-4 w-4" /> Spotlight
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
            // Grid layout
            <div className={cn(
              "flex-1 grid gap-4 overflow-hidden",
              peersList.length === 0 ? "grid-cols-1" :
              peersList.length === 1 ? "grid-cols-2" :
              peersList.length <= 3 ? "grid-cols-2 grid-rows-2" :
              peersList.length <= 8 ? "grid-cols-3 grid-rows-3" :
              "grid-cols-4 grid-rows-4"
            )}>
              <div className="rounded-xl overflow-hidden border border-slate-800 relative group bg-slate-900 shadow-md">
                <VideoPlayer 
                  stream={localStream}
                  name={userName}
                  isHost={isHost}
                  isMuted={isMuted}
                  isVideoOff={isVideoOff}
                  isLocal={true}
                  className="h-full rounded-none"
                />
                {isHost && (
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Button size="icon" variant="secondary" className="h-8 w-8 bg-black/50 hover:bg-black/80 border-0" onClick={() => spotlightParticipant(socketId)}>
                        <Pin className="h-4 w-4 text-white" />
                    </Button>
                  </div>
                )}
              </div>
              {peersList.map((peer) => (
                <div key={peer.socketId} className="rounded-xl overflow-hidden border border-slate-800 relative group bg-slate-900 shadow-md">
                  <VideoPlayer 
                    stream={peer.stream}
                    name={peer.name}
                    isHost={peer.isHost}
                    isMuted={peer.isMuted}
                    isVideoOff={peer.isVideoOff}
                    className="h-full rounded-none"
                  />
                  {isHost && (
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="secondary" className="h-8 w-8 bg-black/50 hover:bg-black/80 border-0">
                            <MoreVertical className="h-4 w-4 text-white" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 border-slate-800 bg-slate-900 text-slate-200">
                          <DropdownMenuItem onClick={() => muteParticipant(peer.socketId)} className="cursor-pointer focus:bg-slate-800 focus:text-white">
                            <MicOff className="mr-2 h-4 w-4" /> Mute participant
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => spotlightParticipant(peer.socketId)} className="cursor-pointer focus:bg-slate-800 focus:text-white">
                            <Pin className="mr-2 h-4 w-4" /> Pin to main stage
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

        {/* Sidebar */}
        {showChat && (
          <div className="w-80 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col shadow-xl z-20">
            <div className="h-14 px-4 border-b border-slate-800 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-slate-400" />
              <h3 className="font-medium">Class Chat</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={chatScrollRef}>
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 gap-2">
                  <MessageSquare className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No messages yet.<br/>Start the conversation!</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-primary-400">{msg.senderName}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="bg-slate-800 text-slate-200 rounded-xl rounded-tl-none p-3 text-sm">
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900">
              <form onSubmit={handleSendChat} className="flex gap-2">
                <Input 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..." 
                  className="bg-slate-800 border-slate-700 focus-visible:ring-primary text-sm h-10"
                />
                <Button type="submit" size="icon" disabled={!chatInput.trim()} className="shrink-0 h-10 w-10">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="h-20 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-8 z-10 shrink-0">
        <div className="flex-1" />
        
        <div className="flex items-center gap-3">
          <Button
            variant={isMuted ? "destructive" : "secondary"}
            size="lg"
            className={cn("w-14 h-14 rounded-full p-0 shadow-md transition-all", !isMuted && "bg-slate-700 hover:bg-slate-600 border-0 text-white")}
            onClick={() => toggleMute()}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </Button>
          
          <Button
            variant={isVideoOff ? "destructive" : "secondary"}
            size="lg"
            className={cn("w-14 h-14 rounded-full p-0 shadow-md transition-all", !isVideoOff && "bg-slate-700 hover:bg-slate-600 border-0 text-white")}
            onClick={toggleVideo}
          >
            {isVideoOff ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
          </Button>

          <Button
            variant={isScreenSharing ? "default" : "secondary"}
            size="lg"
            className={cn("w-14 h-14 rounded-full p-0 shadow-md transition-all", !isScreenSharing && "bg-slate-700 hover:bg-slate-600 border-0 text-white")}
            onClick={toggleScreenShare}
          >
            <MonitorUp className="w-6 h-6" />
          </Button>

          <div className="w-px h-8 bg-slate-700 mx-2" />

          <Button
            variant="destructive"
            size="lg"
            className="w-14 h-14 rounded-full p-0 shadow-md"
            onClick={handleLeave}
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        </div>

        <div className="flex-1 flex justify-end">
          <Button
            variant={showChat ? "secondary" : "ghost"}
            onClick={() => setShowChat(!showChat)}
            className={cn("h-10 px-4 rounded-xl gap-2", showChat ? "bg-primary text-white hover:bg-primary/90" : "text-slate-400 hover:text-white hover:bg-slate-800")}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="font-medium">Chat</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
