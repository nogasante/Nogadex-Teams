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

// ── ICE config with STUN + TURN relay servers ────────────────
// TURN is essential for real-world WebRTC across different networks/NATs
const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turns:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:80?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

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

  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const isScreenSharingRef = useRef(false);
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // ── Create / replace a peer connection ───────────────────────
  const createPeerConnection = useCallback(
    (targetSocketId: string, peerName: string, isPeerHost: boolean): RTCPeerConnection => {
      const existing = peerConnections.current[targetSocketId];
      if (existing && existing.signalingState !== "closed") {
        existing.close();
      }

      const pc = new RTCPeerConnection(ICE_CONFIG);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", { target: targetSocketId, candidate: event.candidate });
        }
      };

      pc.onicecandidateerror = (ev) => {
        // Ignore STUN errors if TURN is available — connections still form
        console.warn("ICE candidate error:", (ev as RTCPeerConnectionIceErrorEvent).errorCode);
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        setPeers((prev) => ({
          ...prev,
          [targetSocketId]: {
            socketId: targetSocketId,
            name: prev[targetSocketId]?.name ?? peerName,
            stream,
            isHost: prev[targetSocketId]?.isHost ?? isPeerHost,
            isMuted: prev[targetSocketId]?.isMuted ?? false,
            isVideoOff: prev[targetSocketId]?.isVideoOff ?? false,
            handRaised: prev[targetSocketId]?.handRaised ?? false,
          },
        }));
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection to ${peerName}: ${pc.connectionState}`);
        if (pc.connectionState === "failed") {
          // Try ICE restart on failure
          console.warn(`[WebRTC] Connection failed to ${peerName} — may need TURN relay`);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE state for ${peerName}: ${pc.iceConnectionState}`);
      };

      // Add all local tracks to this peer connection
      const activeStream = screenStreamRef.current || localStreamRef.current;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => {
          pc.addTrack(track, activeStream);
        });
      }

      peerConnections.current[targetSocketId] = pc;
      return pc;
    },
    []
  );

  // ── Main effect ───────────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !userName) return;
    let mounted = true;

    // ── Get local media ──
    const getMedia = async () => {
      try {
        const constraints = audioOnly
          ? { video: false, audio: true }
          : { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        setLocalStream(stream);
        if (audioOnly) setIsVideoOff(true);
      } catch (err) {
        console.error("[Media] Failed:", err);
        const empty = new MediaStream();
        localStreamRef.current = empty;
        setLocalStream(empty);
        setIsMuted(true);
        setIsVideoOff(true);
      }
    };

    // ── Socket join helper ──
    const doJoinRoom = () => {
      const sid = socket.id || "";
      setMySocketId(sid);
      socket.emit("join-room", {
        roomId,
        userName,
        isHost: isHostRef.current,
        audioOnly,
      });
      console.log("[Socket] Emitting join-room, socketId:", sid);
    };

    // ── Register all socket event listeners ──
    // (register BEFORE connecting to avoid race)

    socket.on("connect", doJoinRoom);

    socket.on("room-joined", async ({ participants }: {
      participantId: string;
      participants: Array<{ socketId: string; name: string; isHost: boolean; isMuted: boolean; isVideoOff: boolean }>;
    }) => {
      if (!mounted) return;
      console.log("[WebRTC] room-joined, existing participants:", participants.length);
      // New joiner sends offers to ALL existing participants
      for (const p of participants) {
        setPeers((prev) => ({
          ...prev,
          [p.socketId]: { socketId: p.socketId, name: p.name, stream: null, isHost: p.isHost, isMuted: p.isMuted, isVideoOff: p.isVideoOff, handRaised: false },
        }));
        const pc = createPeerConnection(p.socketId, p.name, p.isHost);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { target: p.socketId, offer });
        console.log("[WebRTC] Sent offer to", p.name);
      }
    });

    socket.on("user-joined", (payload: { socketId: string; userName: string; isHost: boolean; audioOnly?: boolean }) => {
      if (!mounted) return;
      const { socketId, userName: newName, isHost: newIsHost, audioOnly: peerAO } = payload;
      console.log("[WebRTC] user-joined:", newName);
      setPeers((prev) => ({
        ...prev,
        [socketId]: { socketId, name: newName, stream: null, isHost: newIsHost, isMuted: false, isVideoOff: peerAO ?? false, handRaised: false },
      }));
      // Pre-create the PC — we wait for THEIR offer (they are the initiator)
      createPeerConnection(socketId, newName, newIsHost);
    });

    socket.on("offer", async (payload: { sender: string; userName: string; isHost: boolean; offer: RTCSessionDescriptionInit }) => {
      if (!mounted) return;
      const { sender, offer, userName: senderName, isHost: senderIsHost } = payload;
      console.log("[WebRTC] Got offer from", senderName);
      setPeers((prev) => ({
        ...prev,
        [sender]: { socketId: sender, name: prev[sender]?.name ?? senderName, stream: prev[sender]?.stream ?? null, isHost: prev[sender]?.isHost ?? senderIsHost ?? false, isMuted: prev[sender]?.isMuted ?? false, isVideoOff: prev[sender]?.isVideoOff ?? false, handRaised: prev[sender]?.handRaised ?? false },
      }));

      let pc = peerConnections.current[sender];
      if (!pc || pc.signalingState === "closed") {
        pc = createPeerConnection(sender, senderName, senderIsHost);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { target: sender, answer });
      console.log("[WebRTC] Sent answer to", senderName);
    });

    socket.on("answer", async ({ sender, answer }: { sender: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peerConnections.current[sender];
      if (pc && pc.signalingState !== "closed") {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("[WebRTC] Set remote answer from", sender);
      }
    });

    socket.on("ice-candidate", async ({ sender, candidate }: { sender: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnections.current[sender];
      if (pc && pc.signalingState !== "closed") {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { console.warn("[WebRTC] ICE candidate error:", e); }
      }
    });

    socket.on("user-left", ({ socketId }: { socketId: string }) => {
      console.log("[WebRTC] user-left:", socketId);
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
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
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
      console.log("[Socket] Disconnected");
      setMySocketId("");
    });

    // ── Connect after listeners are registered ──
    const init = async () => {
      await getMedia();
      if (!mounted) return;

      if (socket.connected) {
        // Already connected — join immediately
        doJoinRoom();
      } else {
        socket.connect();
        // doJoinRoom will be called by the "connect" listener above
      }
    };

    init();

    return () => {
      mounted = false;
      socket.off("connect", doJoinRoom);
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
  }, [roomId, userName, audioOnly, createPeerConnection]);

  // ── Controls ─────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const nowMuted = !track.enabled;
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
      if (sender) sender.replaceTrack(newTrack).catch(console.warn);
    });
  };

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharingRef.current) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      isScreenSharingRef.current = false;
      setIsScreenSharing(false);
      socket.emit("stop-screen-share");
      if (localStreamRef.current) replaceVideoTrack(localStreamRef.current);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = stream;
        isScreenSharingRef.current = true;
        setIsScreenSharing(true);
        socket.emit("start-screen-share");
        replaceVideoTrack(stream);

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
        console.warn("[ScreenShare] Error or cancelled:", err);
      }
    }
  }, []);

  const sendChatMessage = useCallback((content: string) => {
    socket.emit("send-chat", {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderName: userName,
      content,
      timestamp: Date.now(),
    });
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
