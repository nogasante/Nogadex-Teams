import { useEffect, useState, useRef, useCallback } from "react";
import { socket } from "../lib/socket";

export interface PeerState {
  socketId: string;
  name: string;
  stream: MediaStream | null;
  isHost: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  handRaised: boolean;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  content: string;
  timestamp: number;
}

export interface Reaction {
  id: string;
  socketId: string;
  senderName: string;
  emoji: string;
  timestamp: number;
}

export function useWebRTC(
  roomId: string,
  userName: string,
  isHost: boolean,
  audioOnly = false
) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [spotlightedPeerId, setSpotlightedPeerId] = useState<string | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(audioOnly);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [reactions, setReactions] = useState<Reaction[]>([]);

  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const isHandRaisedRef = useRef(false);

  const ICE_SERVERS = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  const getMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: !audioOnly,
        audio: true,
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (audioOnly) {
        stream.getVideoTracks().forEach(t => (t.enabled = false));
        setIsVideoOff(true);
      }
      return stream;
    } catch (err) {
      console.error("Failed to get local stream", err);
      const emptyStream = new MediaStream();
      setLocalStream(emptyStream);
      localStreamRef.current = emptyStream;
      setIsMuted(true);
      setIsVideoOff(true);
      return emptyStream;
    }
  }, [audioOnly]);

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
            handRaised: prev[targetSocketId]?.handRaised ?? false,
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
      socket.emit("join-room", { roomId, userName, isHost, audioOnly });

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
              handRaised: false,
            },
          }));
          const pc = createPeerConnection(p.socketId, p.name, p.isHost);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { target: p.socketId, offer });
        }
      });

      socket.on("user-joined", async (payload) => {
        const { socketId, userName: newUserName, isHost: newIsHost, audioOnly: peerAudioOnly } = payload;

        setPeers((prev) => ({
          ...prev,
          [socketId]: {
            socketId,
            name: newUserName,
            stream: null,
            isHost: newIsHost,
            isMuted: false,
            isVideoOff: peerAudioOnly ?? false,
            handRaised: false,
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
            handRaised: prev[sender]?.handRaised ?? false,
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
        const { socketId, isMuted: peerMuted } = payload;
        setPeers((prev) => {
          if (!prev[socketId]) return prev;
          return { ...prev, [socketId]: { ...prev[socketId], isMuted: peerMuted } };
        });
      });

      socket.on("participant-video-toggled", (payload) => {
        const { socketId, isVideoOff: peerVideoOff } = payload;
        setPeers((prev) => {
          if (!prev[socketId]) return prev;
          return { ...prev, [socketId]: { ...prev[socketId], isVideoOff: peerVideoOff } };
        });
      });

      socket.on("participant-spotlighted", (payload) => {
        const { socketId } = payload;
        setSpotlightedPeerId(socketId);
      });

      socket.on("chat-message", (payload) => {
        setChatMessages((prev) => {
          if (prev.some(m => m.id === payload.id)) return prev;
          return [...prev, payload];
        });
      });

      socket.on("forced-mute", () => {
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = false));
        }
        setIsMuted(true);
        socket.emit("toggle-mute", { isMuted: true });
      });

      // Hand raise events
      socket.on("hand-raised", ({ socketId: raisedId }: { socketId: string; name: string }) => {
        if (raisedId === socket.id) {
          setIsHandRaised(true);
          isHandRaisedRef.current = true;
        } else {
          setPeers((prev) => {
            if (!prev[raisedId]) return prev;
            return { ...prev, [raisedId]: { ...prev[raisedId], handRaised: true } };
          });
        }
      });

      socket.on("hand-lowered", ({ socketId: loweredId }: { socketId: string }) => {
        if (loweredId === socket.id) {
          setIsHandRaised(false);
          isHandRaisedRef.current = false;
        } else {
          setPeers((prev) => {
            if (!prev[loweredId]) return prev;
            return { ...prev, [loweredId]: { ...prev[loweredId], handRaised: false } };
          });
        }
      });

      // Reactions
      socket.on("reaction", (payload: Reaction) => {
        setReactions((prev) => [...prev, payload]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== payload.id));
        }, 3500);
      });
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
      socket.off("forced-mute");
      socket.off("hand-raised");
      socket.off("hand-lowered");
      socket.off("reaction");

      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [roomId, userName, isHost, audioOnly, getMedia, createPeerConnection]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const newMuted = !audioTrack.enabled;
        audioTrack.enabled = !newMuted;
        setIsMuted(newMuted);
        socket.emit("toggle-mute", { isMuted: newMuted });
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        const newOff = videoTrack.enabled;
        videoTrack.enabled = !newOff;
        setIsVideoOff(newOff);
        socket.emit("toggle-video", { isVideoOff: newOff });
      }
    }
  }, []);

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
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      setScreenStream(null);
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      socket.emit("stop-screen-share");

      if (localStreamRef.current) {
        replaceStream(localStreamRef.current);
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        screenStreamRef.current = stream;
        setIsScreenSharing(true);
        socket.emit("start-screen-share");

        replaceStream(stream);

        stream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };
      } catch (err) {
        console.error("Error sharing screen", err);
      }
    }
  }, [isScreenSharing]);

  const sendChatMessage = useCallback((content: string) => {
    const msg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      senderName: userName,
      content,
      timestamp: Date.now(),
    };
    socket.emit("send-chat", msg);
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

  const raiseHand = useCallback(() => {
    socket.emit("raise-hand");
  }, []);

  const lowerHand = useCallback(() => {
    socket.emit("lower-hand");
  }, []);

  const hostLowerHand = useCallback((targetSocketId: string) => {
    if (isHost) {
      socket.emit("host-lower-hand", { target: targetSocketId });
    }
  }, [isHost]);

  const sendReaction = useCallback((emoji: string) => {
    socket.emit("send-reaction", { emoji });
  }, []);

  return {
    localStream: isScreenSharing && screenStream ? screenStream : localStream,
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
    socketId: socket.id,
  };
}
