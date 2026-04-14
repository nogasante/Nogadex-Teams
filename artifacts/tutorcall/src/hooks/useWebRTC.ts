import { useEffect, useState, useRef, useCallback } from "react";
import { socket } from "../lib/socket";

export interface PeerState {
  socketId: string;
  name: string;
  stream: MediaStream | null;
  isHost: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  content: string;
  timestamp: number;
}

export function useWebRTC(roomId: string, userName: string, isHost: boolean) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [spotlightedPeerId, setSpotlightedPeerId] = useState<string | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const ICE_SERVERS = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  const getMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error("Failed to get local stream", err);
      // Return an empty stream if permissions fail
      const emptyStream = new MediaStream();
      setLocalStream(emptyStream);
      localStreamRef.current = emptyStream;
      setIsMuted(true);
      setIsVideoOff(true);
      return emptyStream;
    }
  }, []);

  const createPeerConnection = useCallback(
    (targetSocketId: string, name: string, isPeerHost: boolean) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            target: targetSocketId,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        setPeers((prev) => ({
          ...prev,
          [targetSocketId]: {
            ...prev[targetSocketId],
            socketId: targetSocketId,
            name: prev[targetSocketId]?.name || name,
            stream: event.streams[0],
            isHost: prev[targetSocketId]?.isHost ?? isPeerHost,
            isMuted: prev[targetSocketId]?.isMuted ?? false,
            isVideoOff: prev[targetSocketId]?.isVideoOff ?? false,
          },
        }));
      };

      const streamToAdd = screenStreamRef.current || localStreamRef.current;
      if (streamToAdd) {
        streamToAdd.getTracks().forEach((track) => {
          pc.addTrack(track, streamToAdd);
        });
      }

      peerConnections.current[targetSocketId] = pc;
      return pc;
    },
    []
  );

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      await getMedia();
      if (!mounted) return;

      socket.connect();
      socket.emit("join-room", { roomId, userName, isHost });

      socket.on("room-joined", async ({ participants }: { participantId: string; participants: Array<{ socketId: string; name: string; isHost: boolean; isMuted: boolean; isVideoOff: boolean }> }) => {
        for (const p of participants) {
          setPeers((prev) => ({
            ...prev,
            [p.socketId]: {
              socketId: p.socketId,
              name: p.name,
              stream: null,
              isHost: p.isHost,
              isMuted: p.isMuted,
              isVideoOff: p.isVideoOff,
            },
          }));
          const pc = createPeerConnection(p.socketId, p.name, p.isHost);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { target: p.socketId, offer });
        }
      });

      socket.on("user-joined", async (payload) => {
        const { socketId, userName: newUserName, isHost: newIsHost } = payload;
        
        // Add to peers state without stream yet
        setPeers((prev) => ({
          ...prev,
          [socketId]: {
            socketId,
            name: newUserName,
            stream: null,
            isHost: newIsHost,
            isMuted: false,
            isVideoOff: false,
          },
        }));

        const pc = createPeerConnection(socketId, newUserName, newIsHost);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { target: socketId, offer });
      });

      socket.on("offer", async (payload) => {
        const { sender, offer, userName: senderName, isHost: senderHost } = payload;
        
        setPeers((prev) => ({
          ...prev,
          [sender]: {
            socketId: sender,
            name: prev[sender]?.name || senderName || "Unknown",
            stream: prev[sender]?.stream || null,
            isHost: prev[sender]?.isHost ?? senderHost ?? false,
            isMuted: prev[sender]?.isMuted ?? false,
            isVideoOff: prev[sender]?.isVideoOff ?? false,
          },
        }));

        const pc = createPeerConnection(sender, senderName, senderHost);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { target: sender, answer });
      });

      socket.on("answer", async (payload) => {
        const { sender, answer } = payload;
        const pc = peerConnections.current[sender];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      });

      socket.on("ice-candidate", async (payload) => {
        const { sender, candidate } = payload;
        const pc = peerConnections.current[sender];
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error("Error adding received ice candidate", e);
          }
        }
      });

      socket.on("user-left", (payload) => {
        const { socketId } = payload;
        if (peerConnections.current[socketId]) {
          peerConnections.current[socketId].close();
          delete peerConnections.current[socketId];
        }
        setPeers((prev) => {
          const newPeers = { ...prev };
          delete newPeers[socketId];
          return newPeers;
        });
        if (spotlightedPeerId === socketId) {
          setSpotlightedPeerId(null);
        }
      });

      socket.on("participant-muted", (payload) => {
        const { socketId, isMuted } = payload;
        setPeers((prev) => {
          if (!prev[socketId]) return prev;
          return {
            ...prev,
            [socketId]: { ...prev[socketId], isMuted },
          };
        });
      });

      socket.on("participant-video-toggled", (payload) => {
        const { socketId, isVideoOff } = payload;
        setPeers((prev) => {
          if (!prev[socketId]) return prev;
          return {
            ...prev,
            [socketId]: { ...prev[socketId], isVideoOff },
          };
        });
      });

      socket.on("participant-spotlighted", (payload) => {
        const { socketId } = payload;
        setSpotlightedPeerId(socketId);
      });

      socket.on("chat-message", (payload) => {
        setChatMessages((prev) => [...prev, payload]);
      });
      
      socket.on("mute-participant", (payload) => {
         const { target } = payload;
         if(target === socket.id) {
             toggleMute(true);
         }
      })
    };

    init();

    return () => {
      mounted = false;
      socket.disconnect();
      socket.off("room-joined");
      socket.off("user-joined");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("user-left");
      socket.off("participant-muted");
      socket.off("participant-video-toggled");
      socket.off("participant-spotlighted");
      socket.off("chat-message");
      socket.off("mute-participant");

      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [roomId, userName, isHost, getMedia, createPeerConnection]);

  const toggleMute = useCallback((forceMute?: boolean) => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        const newMuted = forceMute !== undefined ? forceMute : !isMuted;
        audioTrack.enabled = !newMuted;
        setIsMuted(newMuted);
        socket.emit("toggle-mute", { isMuted: newMuted });
      }
    }
  }, [localStream, isMuted]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoOff;
        setIsVideoOff(!isVideoOff);
        socket.emit("toggle-video", { isVideoOff: !isVideoOff });
      }
    }
  }, [localStream, isVideoOff]);

  const replaceStream = (newStream: MediaStream) => {
    Object.values(peerConnections.current).forEach((pc) => {
      const senders = pc.getSenders();
      const videoSender = senders.find((s) => s.track?.kind === "video");
      const videoTrack = newStream.getVideoTracks()[0];
      if (videoSender && videoTrack) {
        videoSender.replaceTrack(videoTrack);
      }
    });
  };

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
      }
      setScreenStream(null);
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      socket.emit("stop-screen-share");
      
      if (localStream) {
        replaceStream(localStream);
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        screenStreamRef.current = stream;
        setIsScreenSharing(true);
        socket.emit("start-screen-share");
        
        replaceStream(stream);

        // Handle browser's native stop sharing button
        stream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };
      } catch (err) {
        console.error("Error sharing screen", err);
      }
    }
  }, [isScreenSharing, screenStream, localStream]);

  const sendChatMessage = useCallback((content: string) => {
    const msg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      senderName: userName,
      content,
      timestamp: Date.now(),
    };
    socket.emit("send-chat", msg);
    setChatMessages((prev) => [...prev, msg]);
  }, [userName]);

  const muteParticipant = useCallback((targetSocketId: string) => {
    if (isHost) {
      socket.emit("mute-participant", { target: targetSocketId });
    }
  }, [isHost]);

  const spotlightParticipant = useCallback((targetSocketId: string | null) => {
    if (isHost) {
      socket.emit("spotlight-participant", { target: targetSocketId });
      setSpotlightedPeerId(targetSocketId);
    }
  }, [isHost]);

  return {
    localStream: isScreenSharing && screenStream ? screenStream : localStream,
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
    socketId: socket.id,
  };
}
