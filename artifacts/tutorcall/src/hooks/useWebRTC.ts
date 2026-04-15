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
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [spotlightedPeerId, setSpotlightedPeerId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(audioOnly);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [mySocketId, setMySocketId] = useState<string>("");

  // Refs — so we never need these in effect deps
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const isScreenSharingRef = useRef(false);
  const isHostRef = useRef(isHost);

  // Keep isHostRef in sync without triggering re-runs
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  const ICE_SERVERS = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  const createPeerConnection = useCallback(
    (targetSocketId: string, name: string, isPeerHost: boolean): RTCPeerConnection => {
      // Close any existing connection to this peer first
      if (peerConnections.current[targetSocketId]) {
        peerConnections.current[targetSocketId].close();
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", { target: targetSocketId, candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        setPeers((prev) => ({
          ...prev,
          [targetSocketId]: {
            socketId: targetSocketId,
            name: prev[targetSocketId]?.name || name,
            stream,
            isHost: prev[targetSocketId]?.isHost ?? isPeerHost,
            isMuted: prev[targetSocketId]?.isMuted ?? false,
            isVideoOff: prev[targetSocketId]?.isVideoOff ?? false,
            handRaised: prev[targetSocketId]?.handRaised ?? false,
          },
        }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setPeers((prev) => {
            if (!prev[targetSocketId]) return prev;
            return { ...prev, [targetSocketId]: { ...prev[targetSocketId], stream: null } };
          });
        }
      };

      // Add local tracks
      const streamToAdd = screenStreamRef.current || localStreamRef.current;
      if (streamToAdd) {
        streamToAdd.getTracks().forEach((track) => pc.addTrack(track, streamToAdd));
      }

      peerConnections.current[targetSocketId] = pc;
      return pc;
    },
    [] // stable — never recreated
  );

  // ── Main effect — only re-runs when roomId / userName change ──────────────
  useEffect(() => {
    if (!roomId || !userName) return;

    let mounted = true;

    const getMedia = async () => {
      try {
        const constraints = audioOnly
          ? { video: false, audio: true }
          : { video: true, audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        setLocalStream(stream);
        if (audioOnly) setIsVideoOff(true);
      } catch (err) {
        console.error("Failed to get media:", err);
        // Continue without media — create empty stream
        const empty = new MediaStream();
        localStreamRef.current = empty;
        setLocalStream(empty);
        setIsMuted(true);
        setIsVideoOff(true);
      }
    };

    const init = async () => {
      await getMedia();
      if (!mounted) return;

      socket.connect();

      socket.on("connect", () => {
        setMySocketId(socket.id || "");
        socket.emit("join-room", { roomId, userName, isHost: isHostRef.current, audioOnly });
      });

      // ── Existing participants when WE join ──
      socket.on("room-joined", async ({ participants }: {
        participantId: string;
        participants: Array<{ socketId: string; name: string; isHost: boolean; isMuted: boolean; isVideoOff: boolean }>;
      }) => {
        if (!mounted) return;
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
          // WE (the new joiner) send an offer to each existing participant
          const pc = createPeerConnection(p.socketId, p.name, p.isHost);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { target: p.socketId, offer });
        }
      });

      // ── A new participant joins AFTER us ──
      // We do NOT send an offer — we wait for their offer (they are the initiator)
      socket.on("user-joined", (payload: {
        socketId: string;
        userName: string;
        isHost: boolean;
        audioOnly?: boolean;
      }) => {
        if (!mounted) return;
        const { socketId, userName: newName, isHost: newIsHost, audioOnly: peerAudioOnly } = payload;
        setPeers((prev) => ({
          ...prev,
          [socketId]: {
            socketId,
            name: newName,
            stream: null,
            isHost: newIsHost,
            isMuted: false,
            isVideoOff: peerAudioOnly ?? false,
            handRaised: false,
          },
        }));
        // Pre-create the peer connection so we're ready to handle their incoming offer
        createPeerConnection(socketId, newName, newIsHost);
      });

      // ── Handle incoming offer ──
      socket.on("offer", async (payload: {
        sender: string;
        userName: string;
        isHost: boolean;
        offer: RTCSessionDescriptionInit;
      }) => {
        if (!mounted) return;
        const { sender, offer, userName: senderName, isHost: senderIsHost } = payload;

        // Ensure peer state exists
        setPeers((prev) => ({
          ...prev,
          [sender]: {
            socketId: sender,
            name: prev[sender]?.name || senderName || "Unknown",
            stream: prev[sender]?.stream || null,
            isHost: prev[sender]?.isHost ?? senderIsHost ?? false,
            isMuted: prev[sender]?.isMuted ?? false,
            isVideoOff: prev[sender]?.isVideoOff ?? false,
            handRaised: prev[sender]?.handRaised ?? false,
          },
        }));

        // Use existing PC if pre-created, or create new one
        let pc = peerConnections.current[sender];
        if (!pc || pc.signalingState === "closed") {
          pc = createPeerConnection(sender, senderName, senderIsHost);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { target: sender, answer });
      });

      socket.on("answer", async (payload: { sender: string; answer: RTCSessionDescriptionInit }) => {
        const { sender, answer } = payload;
        const pc = peerConnections.current[sender];
        if (pc && pc.signalingState !== "closed") {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      });

      socket.on("ice-candidate", async (payload: { sender: string; candidate: RTCIceCandidateInit }) => {
        const { sender, candidate } = payload;
        const pc = peerConnections.current[sender];
        if (pc && pc.signalingState !== "closed") {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { /* ignore */ }
        }
      });

      socket.on("user-left", ({ socketId }: { socketId: string }) => {
        peerConnections.current[socketId]?.close();
        delete peerConnections.current[socketId];
        setPeers((prev) => { const n = { ...prev }; delete n[socketId]; return n; });
        setSpotlightedPeerId((prev) => prev === socketId ? null : prev);
      });

      socket.on("participant-muted", ({ socketId, isMuted: val }: { socketId: string; isMuted: boolean }) => {
        setPeers((prev) => prev[socketId] ? { ...prev, [socketId]: { ...prev[socketId], isMuted: val } } : prev);
      });

      socket.on("participant-video-toggled", ({ socketId, isVideoOff: val }: { socketId: string; isVideoOff: boolean }) => {
        setPeers((prev) => prev[socketId] ? { ...prev, [socketId]: { ...prev[socketId], isVideoOff: val } } : prev);
      });

      socket.on("participant-spotlighted", ({ socketId }: { socketId: string | null }) => {
        setSpotlightedPeerId(socketId);
      });

      socket.on("chat-message", (payload: ChatMessage) => {
        setChatMessages((prev) => prev.some(m => m.id === payload.id) ? prev : [...prev, payload]);
      });

      socket.on("forced-mute", () => {
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
        setIsMuted(true);
      });

      socket.on("hand-raised", ({ socketId: id }: { socketId: string }) => {
        if (id === socket.id) { setIsHandRaised(true); return; }
        setPeers((prev) => prev[id] ? { ...prev, [id]: { ...prev[id], handRaised: true } } : prev);
      });

      socket.on("hand-lowered", ({ socketId: id }: { socketId: string }) => {
        if (id === socket.id) { setIsHandRaised(false); return; }
        setPeers((prev) => prev[id] ? { ...prev, [id]: { ...prev[id], handRaised: false } } : prev);
      });

      socket.on("reaction", (payload: Reaction) => {
        setReactions((prev) => [...prev, payload]);
        setTimeout(() => setReactions((prev) => prev.filter(r => r.id !== payload.id)), 3500);
      });

      socket.on("disconnect", () => {
        setMySocketId("");
      });
    };

    init();

    return () => {
      mounted = false;
      socket.off("connect");
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
      socket.off("disconnect");
      socket.disconnect();

      Object.values(peerConnections.current).forEach(pc => pc.close());
      peerConnections.current = {};

      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      screenStreamRef.current = null;
    };
  // ── ONLY depend on roomId and userName — isHost changes must NOT re-run this ──
  }, [roomId, userName, audioOnly, createPeerConnection]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;          // toggle
    const nowMuted = !track.enabled;         // muted = track disabled
    setIsMuted(nowMuted);
    socket.emit("toggle-mute", { isMuted: nowMuted });
  }, []);

  const toggleVideo = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const nowOff = !track.enabled;
    setIsVideoOff(nowOff);
    socket.emit("toggle-video", { isVideoOff: nowOff });
  }, []);

  const replaceVideoTrack = (newStream: MediaStream) => {
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) return;
    Object.values(peerConnections.current).forEach((pc) => {
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender) sender.replaceTrack(newTrack);
    });
  };

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharingRef.current) {
      // Stop screen share
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      isScreenSharingRef.current = false;
      setIsScreenSharing(false);
      socket.emit("stop-screen-share");
      // Restore camera
      if (localStreamRef.current) replaceVideoTrack(localStreamRef.current);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = stream;
        isScreenSharingRef.current = true;
        setIsScreenSharing(true);
        socket.emit("start-screen-share");
        replaceVideoTrack(stream);

        // When user clicks browser's "Stop sharing" button
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          if (!isScreenSharingRef.current) return;
          screenStreamRef.current?.getTracks().forEach(t => t.stop());
          screenStreamRef.current = null;
          isScreenSharingRef.current = false;
          setIsScreenSharing(false);
          socket.emit("stop-screen-share");
          if (localStreamRef.current) replaceVideoTrack(localStreamRef.current);
        });
      } catch (err) {
        console.error("Screen share error:", err);
      }
    }
  }, []); // no deps — uses refs only

  const sendChatMessage = useCallback((content: string) => {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderName: userName,
      content,
      timestamp: Date.now(),
    };
    socket.emit("send-chat", msg);
  }, [userName]);

  const muteParticipant = useCallback((targetSocketId: string) => {
    if (isHostRef.current) socket.emit("mute-participant", { target: targetSocketId });
  }, []);

  const spotlightParticipant = useCallback((targetSocketId: string | null) => {
    if (isHostRef.current) {
      socket.emit("spotlight-participant", { target: targetSocketId });
      setSpotlightedPeerId(targetSocketId);
    }
  }, []);

  const raiseHand = useCallback(() => socket.emit("raise-hand"), []);
  const lowerHand = useCallback(() => socket.emit("lower-hand"), []);
  const hostLowerHand = useCallback((targetSocketId: string) => {
    if (isHostRef.current) socket.emit("host-lower-hand", { target: targetSocketId });
  }, []);
  const sendReaction = useCallback((emoji: string) => socket.emit("send-reaction", { emoji }), []);

  return {
    localStream: isScreenSharing && screenStreamRef.current ? screenStreamRef.current : localStream,
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
    socketId: mySocketId,
  };
}
