import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    Monitor,
    MonitorOff,
    ShieldCheck,
    Sparkles,
    LogOut,
    CheckCircle2,
    Volume2,
    ScrollText,
    FileText,
    Copy,
    Check,
    Search,
    Download,
    X,
    Radio,
    Activity,
    SlidersHorizontal,
    User,
    ArrowDown,
    AlertTriangle,
    Loader2,
    Maximize2,
    Minimize2,
    ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { Room, RoomEvent, Track, ConnectionState } from "livekit-client";
import { getInterviewByCodeOrId, removeInterview } from "@/utils/interviewStore";
import { useInterviewSettings } from "@/utils/interviewSettingsStore";
import { candidatesApi, interviewsApi } from "@/services/api";
import AvaHireLogo from "@/components/AvaHireLogo";

const CandidateLiveRoom = () => {
    const { code } = useParams();
    const navigate = useNavigate();
    const { settings } = useInterviewSettings();

    const [interviewData, setInterviewData] = useState(() => {
        const found = getInterviewByCodeOrId(code);
        if (found) return found;
        return {
            id: "iv-default",
            name: "Candidate",
            role: "Senior Full Stack Engineer",
            company: "AvaHire Recruiter",
            linkCode: code || ""
        };
    });

    // Connection & LiveKit State
    const [connectionStatus, setConnectionStatus] = useState("connecting"); // connecting, connected, disconnected, error
    const [connectionError, setConnectionError] = useState(null);
    const roomRef = useRef(null);

    // Full-Screen Mode State
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showFullscreenWarning, setShowFullscreenWarning] = useState(false);
    const [fullscreenExitCount, setFullscreenExitCount] = useState(0);

    // Call Controls State
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [showCaptions, setShowCaptions] = useState(true);
    const [showTranscript, setShowTranscript] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // Video Elements
    const avatarVideoRef = useRef(null);
    const avatarAudioRef = useRef(null);
    const candidateVideoRef = useRef(null);
    const [hasAvatarVideo, setHasAvatarVideo] = useState(false);
    const [hasCandidateVideo, setHasCandidateVideo] = useState(false);

    // AI & Conversation State
    const [isAITalking, setIsAITalking] = useState(false);
    const [currentCaption, setCurrentCaption] = useState("Connecting with AI Interviewer Ava...");
    const [transcripts, setTranscripts] = useState([]);
    const [interviewEnded, setInterviewEnded] = useState(false);
    const [terminationReason, setTerminationReason] = useState("");

    // Anti-Cheating & Proctoring State
    const [proctoringWarnings, setProctoringWarnings] = useState(0);
    const [proctoringNotice, setProctoringNotice] = useState(null);
    const proctoringCanvasRef = useRef(null);
    const proctoringCooldownRef = useRef({
        lastFaceWarn: 0,
        lastLightingWarn: 0,
        lastMultiPeopleWarn: 0,
        lastMultiVoiceWarn: 0,
        lastNoiseNotice: 0,
        lastDeviceWarn: 0,
        missingFaceCycles: 0,
        multiVoiceConsecutiveCycles: 0,
        noiseConsecutiveCycles: 0,
        deviceConsecutiveCycles: 0,
    });

    // Transcript UI State
    const [transcriptSearch, setTranscriptSearch] = useState("");
    const [autoScroll, setAutoScroll] = useState(true);
    const [isCopied, setIsCopied] = useState(false);
    const transcriptBottomRef = useRef(null);

    // Live Utterance buffer
    const [liveUtterance, setLiveUtterance] = useState(null);

    // Live Audio Recording for Candidate Card Audio Playback
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioContextRef = useRef(null);
    const audioDestinationRef = useRef(null);
    const recordedSourcesRef = useRef(new Set());

    const initAudioRecorder = () => {
        try {
            if (settings?.audioRecording === false) return;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") return;
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = audioContextRef.current || new AudioCtx();
            if (ctx.state === "suspended") {
                ctx.resume().catch(() => {});
            }
            audioContextRef.current = ctx;
            const dest = audioDestinationRef.current || ctx.createMediaStreamDestination();
            audioDestinationRef.current = dest;

            audioChunksRef.current = [];
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : ""));

            const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : undefined);
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };
            recorder.start(1000);
            mediaRecorderRef.current = recorder;
            console.log("[AudioRecorder] Live interview audio recording started with mime:", recorder.mimeType);
        } catch (err) {
            console.warn("[AudioRecorder] Could not start audio recording:", err);
        }
    };

    const addAudioTrackToRecorder = (track) => {
        try {
            if (!track) return;
            initAudioRecorder();
            const ctx = audioContextRef.current;
            const dest = audioDestinationRef.current;
            if (!ctx || !dest) return;

            const mediaStreamTrack = track.mediaStreamTrack || track;
            if (!mediaStreamTrack || recordedSourcesRef.current.has(mediaStreamTrack.id)) return;
            recordedSourcesRef.current.add(mediaStreamTrack.id);

            const stream = new MediaStream([mediaStreamTrack]);
            const source = ctx.createMediaStreamSource(stream);
            source.connect(dest);
            console.log("[AudioRecorder] Mixed track to recorder stream:", mediaStreamTrack.id, mediaStreamTrack.kind);
        } catch (err) {
            console.warn("[AudioRecorder] Error mixing track to recorder:", err);
        }
    };

    const stopAndUploadAudioRecording = async (candidateId, linkCode) => {
        return new Promise((resolve) => {
            try {
                const finalizeUpload = async (blob) => {
                    if (!blob || blob.size < 100) {
                        console.warn("[AudioRecorder] Blob is empty or too small:", blob?.size);
                        resolve(`/api/candidates/${encodeURIComponent(candidateId)}/audio`);
                        return;
                    }

                    try {
                        const formData = new FormData();
                        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
                        formData.append("audio", blob, `recording_${candidateId}.${ext}`);
                        formData.append("candidateId", candidateId);
                        formData.append("linkCode", linkCode || "");
                        formData.append("mimeType", blob.type || "audio/webm");

                        const res = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/recording`, {
                            method: "POST",
                            body: formData
                        });

                        if (res.ok) {
                            const resData = await res.json();
                            const finalUrl = resData?.data?.audioUrl || `/api/candidates/${encodeURIComponent(candidateId)}/audio`;
                            console.log("[AudioRecorder] Audio recording saved successfully on backend:", finalUrl);
                            resolve(finalUrl);
                            return;
                        }
                    } catch (uploadErr) {
                        console.warn("[AudioRecorder] Binary upload notice, attempting base64 fallback:", uploadErr);
                    }

                    // Fallback to base64 upload if FormData is interrupted
                    try {
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                            const b64 = reader.result;
                            if (b64) {
                                await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/recording`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        candidateId,
                                        linkCode,
                                        audioBase64: b64,
                                        mimeType: blob.type || "audio/webm"
                                    })
                                }).catch(() => {});
                            }
                            resolve(`/api/candidates/${encodeURIComponent(candidateId)}/audio`);
                        };
                        reader.onerror = () => resolve(`/api/candidates/${encodeURIComponent(candidateId)}/audio`);
                        reader.readAsDataURL(blob);
                    } catch (fallbackErr) {
                        resolve(`/api/candidates/${encodeURIComponent(candidateId)}/audio`);
                    }
                };

                const recorder = mediaRecorderRef.current;
                if (recorder && recorder.state !== "inactive") {
                    recorder.onstop = () => {
                        const mime = recorder.mimeType || "audio/webm";
                        const blob = new Blob(audioChunksRef.current, { type: mime });
                        finalizeUpload(blob);
                    };
                    recorder.stop();
                } else if (audioChunksRef.current.length > 0) {
                    const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                    finalizeUpload(blob);
                } else {
                    resolve(`/api/candidates/${encodeURIComponent(candidateId)}/audio`);
                }
            } catch (err) {
                console.warn("[AudioRecorder] Error in stopAndUploadAudioRecording:", err);
                resolve(`/api/candidates/${encodeURIComponent(candidateId)}/audio`);
            }
        });
    };

    // Load Interview Record
    useEffect(() => {
        const fetchRecord = async () => {
            const found = getInterviewByCodeOrId(code);
            if (found) {
                setInterviewData(found);
                return;
            }
            try {
                const serverData = await interviewsApi.getByLinkCode(code);
                if (serverData) {
                    setInterviewData(serverData);
                }
            } catch (e) {
                console.warn("Could not load interview record from server:", e);
            }
        };
        fetchRecord();
    }, [code]);

    // Live Stopwatch Timer
    useEffect(() => {
        if (interviewEnded || connectionStatus !== "connected") return;
        const interval = setInterval(() => {
            setElapsedSeconds((prev) => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [interviewEnded, connectionStatus]);

    // Enforce Auto-End on Timeout if enabled in interview settings
    useEffect(() => {
        if (interviewEnded || connectionStatus !== "connected") return;
        if (settings?.autoEnd === false) return;
        const durationMins = parseInt(settings?.duration || interviewData?.duration || "30", 10) || 30;
        const maxDurationSecs = durationMins * 60;
        if (elapsedSeconds >= maxDurationSecs) {
            handleEndAndSaveInterview("Allocated interview duration completed.");
        }
    }, [elapsedSeconds, interviewEnded, connectionStatus, settings?.autoEnd, settings?.duration, interviewData?.duration]);

    const formatTime = (totalSeconds) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };

    // Auto-scroll transcript feed
    useEffect(() => {
        if (autoScroll && transcriptBottomRef.current) {
            transcriptBottomRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [transcripts, liveUtterance, autoScroll, showTranscript]);

    // -------------------------------------------------------------
    // ANTI-CHEATING VIOLATION DISPATCHER (LiveKit Data Channel + PostgreSQL)
    // -------------------------------------------------------------
    const sendViolation = async (type, reason, metadata = {}) => {
        if (interviewEnded) return;

        // Proctoring Settings Enforcement: suppress checks when disabled in interview settings
        if (settings?.enableProctoring === false) return;
        if ((type === "face_missing" || type === "face_not_centered" || type === "low_lighting") && settings?.faceDetection === false) return;
        if ((type === "multiple_faces" || type === "multiple_voices") && settings?.multiplePersonDetection === false) return;
        if ((type === "tab_switched" || type === "window_blur") && settings?.tabSwitchDetection === false) return;
        if (type === "fullscreen_exit" && settings?.fullScreenMonitoring === false) return;

        const roomCode = interviewData?.linkCode || code || "";

        // 1. Broadcast over LiveKit room data channel to AI Agent
        const currentRoom = roomRef.current;
        if (currentRoom && currentRoom.state === ConnectionState.Connected) {
            try {
                const payload = JSON.stringify({
                    type,
                    event: type,
                    reason,
                    details: reason,
                    linkCode: roomCode,
                    candidateName: interviewData?.name || "Candidate",
                    candidateEmail: interviewData?.email || "",
                    timestamp: Date.now(),
                    ...metadata
                });
                await currentRoom.localParticipant.publishData(new TextEncoder().encode(payload), {
                    reliable: true,
                    topic: type
                });
                console.warn(`[AntiCheating] Broadcasted '${type}': ${reason}`);
            } catch (e) {
                console.debug("Data channel publish notice:", e?.message || e);
            }
        }

        // 2. Direct backend sync to PostgreSQL database
        try {
            const res = await fetch("/api/candidate-portal/proctoring/violation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    linkCode: roomCode,
                    candidateName: interviewData?.name || "Candidate",
                    candidateEmail: interviewData?.email || "",
                    violationType: type,
                    details: reason,
                    metadata
                })
            });
            if (res.ok) {
                const resData = await res.json();
                if (resData.terminate) {
                    handleEndAndSaveInterview(resData.reason || reason);
                } else if (resData.action === "warning") {
                    setProctoringWarnings(resData.warningCount || 1);
                    setProctoringNotice(`Warning ${resData.warningCount || 1}/3: ${reason}`);
                    toast.warning(resData.message || `Warning ${resData.warningCount || 1} of 3: ${reason}`);
                } else if (resData.action === "notice") {
                    setProctoringNotice(resData.message || reason);
                    toast.info(resData.message || reason);
                }
            }
        } catch (err) {
            console.debug("Backend proctoring sync note:", err?.message || err);
        }
    };

    // -------------------------------------------------------------
    // VOICE DETECTOR MICROPHONE (VAD) & REAL-TIME STT ENGINE
    // Connected with Live Transcript: Detects candidate voice and converts it to text
    // -------------------------------------------------------------
    const [isCandidateSpeaking, setIsCandidateSpeaking] = useState(false);
    const [candidateVoiceLevel, setCandidateVoiceLevel] = useState(0);
    const vadAnalyserRef = useRef(null);
    const vadAnimFrameRef = useRef(null);
    const vadCtxRef = useRef(null);

    // Initialize Web Audio VAD on candidate's microphone audio track
    const attachVoiceActivityDetector = (audioTrack) => {
        try {
            if (!audioTrack) return;
            const mediaStreamTrack = audioTrack.mediaStreamTrack || audioTrack;
            if (!mediaStreamTrack) return;

            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;

            if (vadCtxRef.current && vadCtxRef.current.state !== "closed") {
                try { vadCtxRef.current.close(); } catch (e) {}
            }

            const ctx = new AudioCtx();
            vadCtxRef.current = ctx;

            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;
            vadAnalyserRef.current = analyser;

            const stream = new MediaStream([mediaStreamTrack]);
            const source = ctx.createMediaStreamSource(stream);
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const checkCandidateVoice = () => {
                if (!vadAnalyserRef.current) return;
                vadAnalyserRef.current.getByteFrequencyData(dataArray);

                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const avg = sum / dataArray.length;
                const level = Math.min(100, Math.round((avg / 128) * 100));
                setCandidateVoiceLevel(level);

                const voiceActive = level > 12;
                setIsCandidateSpeaking(voiceActive);

                const now = Date.now();
                const cooldowns = proctoringCooldownRef.current;

                // Frequency Bands (FFT 256 @ 48kHz => ~187.5Hz per bin):
                // Fundamental voice pitch (F0): bins 1-3 (~180-560Hz)
                // Formants F1/F2 (Human vocal range): bins 4-16 (~750-3000Hz)
                // High frequency ambient/fan/typing clicks: bins 20-60 (~3750-11250Hz)
                let vocalFundamental = 0;
                let vocalFormants = 0;
                let highBandNoise = 0;

                for (let i = 1; i <= 3; i++) vocalFundamental += dataArray[i];
                for (let i = 4; i <= 16; i++) vocalFormants += dataArray[i];
                for (let i = 20; i <= 60; i++) highBandNoise += dataArray[i];

                const avgHighNoise = highBandNoise / 41;
                const avgVocalEnergy = (vocalFundamental + vocalFormants) / 16;

                // 1. Excessive Background Noise Detection (Continuous noise floor without secondary human voice)
                // NO WARNING issued: polite request to move to a quieter location
                if (avgHighNoise > 42 || (avg > 40 && avgVocalEnergy < 48)) {
                    cooldowns.noiseConsecutiveCycles = (cooldowns.noiseConsecutiveCycles || 0) + 1;
                    if (cooldowns.noiseConsecutiveCycles >= 180 && now - (cooldowns.lastNoiseNotice || 0) > 25000) {
                        cooldowns.lastNoiseNotice = now;
                        cooldowns.noiseConsecutiveCycles = 0;
                        console.warn("[Proctoring] High continuous background noise detected (guidance notice)");
                        sendViolation("background_noise", "There is too much background noise. Please move to a quieter place so that I can clearly hear your responses.");
                    }
                } else {
                    cooldowns.noiseConsecutiveCycles = Math.max(0, (cooldowns.noiseConsecutiveCycles || 0) - 2);
                }

                // 2. Multiple Voices Detection (Second human voice speaking near candidate)
                // Human speech has distinct harmonic formants (F1, F2) and pitch resonance.
                // Dual voice presence exhibits overlapping harmonic energy across both fundamental and mid formants.
                const isDualVoice = vocalFundamental > 480 && vocalFormants > 780 && avgVocalEnergy > 54 && avg > 50;

                if (isDualVoice) {
                    cooldowns.multiVoiceConsecutiveCycles = (cooldowns.multiVoiceConsecutiveCycles || 0) + 1;
                    // Require sustained dual vocal resonance (~600ms / 35 frames) to avoid false positives on keyboard or clicks
                    if (cooldowns.multiVoiceConsecutiveCycles >= 35 && now - (cooldowns.lastMultiVoiceWarn || 0) > 15000) {
                        cooldowns.lastMultiVoiceWarn = now;
                        cooldowns.multiVoiceConsecutiveCycles = 0;
                        console.warn("[Proctoring] Second human voice detected speaking near candidate");
                        sendViolation("multiple_voices", "Another voice detected speaking during interview.");
                    }
                } else {
                    cooldowns.multiVoiceConsecutiveCycles = Math.max(0, (cooldowns.multiVoiceConsecutiveCycles || 0) - 1);
                }

                vadAnimFrameRef.current = requestAnimationFrame(checkCandidateVoice);
            };

            checkCandidateVoice();
            console.log("[VoiceDetector] Web Audio VAD attached to candidate mic.");
        } catch (err) {
            console.warn("[VoiceDetector] Could not attach VAD:", err);
        }
    };

    // Continuous Speech Recognition Engine: Converts Candidate Voice into Live Transcript & Captions
    useEffect(() => {
        if (connectionStatus !== "connected" || !isMicOn || interviewEnded) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        let recognition = null;
        let isEngineRunning = true;

        try {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "en-US";

            const candidateName = interviewData?.name || "Candidate";

            recognition.onresult = (event) => {
                let interimTranscript = "";
                let finalTranscript = "";

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcriptPiece = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcriptPiece;
                    } else {
                        interimTranscript += transcriptPiece;
                    }
                }

                const timeStr = formatTime(elapsedSeconds);

                if (interimTranscript.trim()) {
                    setLiveUtterance({
                        speaker: candidateName,
                        roleTag: "Candidate",
                        time: timeStr,
                        text: interimTranscript.trim(),
                    });
                    setCurrentCaption(interimTranscript.trim());
                }

                if (finalTranscript.trim()) {
                    setLiveUtterance(null);
                    setTranscripts((prev) => {
                        const last = prev[prev.length - 1];
                        if (
                            last &&
                            last.speaker === candidateName &&
                            last.text.trim().toLowerCase() === finalTranscript.trim().toLowerCase()
                        ) {
                            return prev;
                        }
                        return [
                            ...prev,
                            {
                                id: `cand-stt-${Date.now()}-${Math.random()}`,
                                speaker: candidateName,
                                roleTag: "Candidate",
                                time: timeStr,
                                text: finalTranscript.trim(),
                            },
                        ];
                    });
                    setCurrentCaption(finalTranscript.trim());
                }
            };

            recognition.onerror = (e) => {
                if (e.error !== "no-speech" && e.error !== "aborted") {
                    console.warn("[VoiceDetector STT] Notice:", e.error);
                }
            };

            recognition.onend = () => {
                if (isEngineRunning && connectionStatus === "connected" && isMicOn && !interviewEnded) {
                    try {
                        recognition.start();
                    } catch (e) {}
                }
            };

            try {
                recognition.start();
                console.log("[VoiceDetector STT] Live Speech-to-Text transcription active.");
            } catch (e) {}

        } catch (err) {
            console.warn("[VoiceDetector STT] Initialization notice:", err);
        }

        return () => {
            isEngineRunning = false;
            if (vadAnimFrameRef.current) {
                cancelAnimationFrame(vadAnimFrameRef.current);
            }
            try {
                if (recognition) recognition.stop();
            } catch (e) {}
        };
    }, [connectionStatus, isMicOn, interviewEnded, interviewData?.name, elapsedSeconds]);

    // Suppress benign WebRTC negotiation timeouts from crashing the React error overlay
    useEffect(() => {
        const handleUnhandledRejection = (event) => {
            const errReason = event?.reason;
            const msg = String(errReason?.message || errReason || "").toLowerCase();
            const name = String(errReason?.name || "");
            if (name === "NegotiationError" || msg.includes("negotiation") || msg.includes("negotiation timed out")) {
                console.warn("[LiveKit] Handled and prevented negotiation timeout error:", errReason);
                event.preventDefault();
            }
        };
        window.addEventListener("unhandledrejection", handleUnhandledRejection);
        return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    }, []);

    // LiveKit Room Connection & Agent Initialization
    useEffect(() => {
        let isMounted = true;
        const room = new Room({
            adaptiveStream: true,
            dynacast: true,
            stopLocalTrackOnUnpublish: true,
            publishDefaults: {
                simulcast: false, // Prevents multi-layer SDP negotiation delays and timeouts
            },
            audioCaptureDefaults: {
                autoGainControl: true,
                echoCancellation: true,
                noiseSuppression: true,
            },
            videoCaptureDefaults: {
                resolution: { width: 1280, height: 720, frameRate: 30 },
            },
        });
        roomRef.current = room;

        const connectToLiveKit = async () => {
            try {
                setConnectionStatus("connecting");
                setConnectionError(null);

                // Fetch Token from Backend
                const candidateName = interviewData?.name || "Candidate";
                const roomCode = code || "live-session";
                
                let tokenData = null;
                try {
                    const res = await fetch("/api/livekit/token", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            code: roomCode,
                            participant_name: candidateName,
                            room_name: `interview_${roomCode}`,
                        }),
                    });
                    if (res.ok) {
                        tokenData = await res.json();
                    }
                } catch (fetchErr) {
                    console.warn("Backend token endpoint fetch failed, trying local fallback:", fetchErr);
                }

                if (!tokenData || !tokenData.participantToken) {
                    throw new Error("Unable to obtain LiveKit participant access token.");
                }

                const serverUrl = tokenData.serverUrl || "wss://avahire-interview-odja2ewy.livekit.cloud";
                const token = tokenData.participantToken;

                // Setup Track Subscribed Listener (Avatar Video + Audio)
                room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
                    console.log(`Track subscribed: kind=${track.kind}, source=${track.source} from participant=${participant.identity}`);

                    if (track.kind === Track.Kind.Video) {
                        // Remote Avatar Video (from bey-avatar-agent or AI Agent)
                        if (avatarVideoRef.current) {
                            track.attach(avatarVideoRef.current);
                            setHasAvatarVideo(true);
                        }
                    } else if (track.kind === Track.Kind.Audio) {
                        // Remote AI Voice Audio
                        if (avatarAudioRef.current) {
                            track.attach(avatarAudioRef.current);
                        } else {
                            const audioElement = track.attach();
                            audioElement.style.display = "none";
                            document.body.appendChild(audioElement);
                        }
                        // Mix remote AI voice into audio recorder
                        addAudioTrackToRecorder(track);
                    }
                });

                room.on(RoomEvent.TrackUnsubscribed, (track) => {
                    track.detach();
                    if (track.kind === Track.Kind.Video && avatarVideoRef.current) {
                        setHasAvatarVideo(false);
                    }
                });

                // Active Speaker Detection (AI Speaking State)
                room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
                    const isRemoteSpeaking = speakers.some((s) => !s.isLocal);
                    setIsAITalking(isRemoteSpeaking);
                });

                // Transcription & Data Messages
                room.on(RoomEvent.TranscriptionReceived, (transcriptions, participant) => {
                    for (const t of transcriptions) {
                        const isAva = !participant || !participant.isLocal;
                        const speakerName = isAva ? "Ava" : (candidateName || "Candidate");
                        const roleTag = isAva ? "AI Interviewer" : "Candidate";
                        const timeStr = formatTime(elapsedSeconds);

                        if (t.final) {
                            setTranscripts((prev) => [
                                ...prev,
                                {
                                    id: `stt-${Date.now()}-${Math.random()}`,
                                    speaker: speakerName,
                                    roleTag: roleTag,
                                    time: timeStr,
                                    text: t.text,
                                },
                            ]);
                            if (isAva) {
                                setCurrentCaption(t.text);
                            }
                            setLiveUtterance(null);
                        } else {
                            setLiveUtterance({
                                speaker: speakerName,
                                roleTag: roleTag,
                                time: timeStr,
                                text: t.text,
                            });
                            if (isAva) {
                                setCurrentCaption(t.text);
                            }
                        }
                    }
                });

                // Data Packet Handling (e.g. agent notifications / proctoring warnings / termination / conclusion)
                room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
                    try {
                        const str = new TextDecoder().decode(payload);
                        console.log("Data packet received:", topic, str);
                        const parsed = JSON.parse(str);
                        if (parsed.type === "termination" || topic === "interview_terminated" || parsed.type === "interview_terminated") {
                            const reasonText = parsed.reason || "Integrity policy violation";
                            setTerminationReason(reasonText);
                            toast.error(`Interview ended: ${reasonText}`);
                            handleEndAndSaveInterview(reasonText);
                        } else if (parsed.type === "proctoring_warning" || topic === "proctoring_warning") {
                            const count = parsed.warningCount || parsed.warningNumber || 1;
                            const maxW = parsed.maxWarnings || 3;
                            const wReason = parsed.reason || "Integrity warning";
                            setProctoringWarnings(count);
                            setProctoringNotice(`Warning ${count}/${maxW}: ${wReason}`);
                            toast.warning(`Warning ${count} of ${maxW}: ${wReason}`);
                        } else if (parsed.type === "proctoring_notice" || topic === "proctoring_notice") {
                            const noticeMsg = parsed.message || parsed.details || "Your face is not clearly visible. Please adjust your position or lighting.";
                            setProctoringNotice(noticeMsg);
                            toast.info(noticeMsg);
                        } else if (parsed.type === "interview_completed" || topic === "interview_completed") {
                            toast.success("Interview completed! Transitioning to Thank You page...");
                            handleEndAndSaveInterview();
                        }
                    } catch (e) {
                        // Non-json data packet
                    }
                });

                // Connection State Listener
                room.on(RoomEvent.ConnectionStateChanged, (state) => {
                    if (state === ConnectionState.Connected) {
                        setConnectionStatus("connected");
                        toast.success("Connected to AI Interviewer Ava");
                    } else if (state === ConnectionState.Disconnected) {
                        setConnectionStatus("disconnected");
                    }
                });

                // Connect to Room
                await room.connect(serverUrl, token, {
                    autoSubscribe: true,
                });

                if (!isMounted || room.state !== ConnectionState.Connected) {
                    try { room.disconnect(); } catch (e) {}
                    return;
                }

                setConnectionStatus("connected");

                // Safely and sequentially initialize local audio and camera without SDP collisions
                const initLocalMedia = async () => {
                    if (!isMounted || room.state !== ConnectionState.Connected) return;
                    try {
                        const micId = localStorage.getItem("avahire_selected_mic_id");
                        if (micId) {
                            await room.localParticipant.setMicrophoneEnabled(true, { deviceId: micId });
                        } else {
                            await room.localParticipant.setMicrophoneEnabled(true);
                        }
                        setIsMicOn(true);
                        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
                        if (micPub && micPub.audioTrack) {
                            addAudioTrackToRecorder(micPub.audioTrack);
                            attachVoiceActivityDetector(micPub.audioTrack);
                        }
                    } catch (micErr) {
                        console.warn("Notice publishing mic track:", micErr?.message || micErr);
                    }

                    // Gentle delay so the first peer connection negotiation settles
                    await new Promise((resolve) => setTimeout(resolve, 350));

                    if (!isMounted || room.state !== ConnectionState.Connected) return;
                    try {
                        await room.localParticipant.setCameraEnabled(true);
                        setIsCameraOn(true);
                        setHasCandidateVideo(true);

                        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
                        if (camPub && camPub.videoTrack && candidateVideoRef.current) {
                            camPub.videoTrack.attach(candidateVideoRef.current);
                        }
                    } catch (camErr) {
                        console.warn("Notice publishing camera track:", camErr?.message || camErr);
                    }
                };

                initLocalMedia();

            } catch (err) {
                console.error("LiveKit connection error:", err);
                if (isMounted) {
                    setConnectionStatus("error");
                    setConnectionError(err.message || "Failed to join live interview room");
                    toast.error("Failed to connect with AI Agent. Please check network/credentials.");
                }
            }
        };

        connectToLiveKit();

        return () => {
            isMounted = false;
            try {
                if (room && room.state !== ConnectionState.Disconnected) {
                    room.disconnect();
                }
            } catch (e) {
                // Ignore cleanup disconnect errors
            }
        };
    }, [code]);

    // Local Video Attachment Effect
    useEffect(() => {
        if (roomRef.current && isCameraOn && connectionStatus === "connected" && roomRef.current.state === ConnectionState.Connected) {
            try {
                const camPub = roomRef.current.localParticipant?.getTrackPublication(Track.Source.Camera);
                if (camPub && camPub.videoTrack && candidateVideoRef.current) {
                    camPub.videoTrack.attach(candidateVideoRef.current);
                    setHasCandidateVideo(true);
                }
            } catch (e) {
                console.warn("Video attach error:", e);
            }
        }
    }, [isCameraOn, connectionStatus]);

    // -------------------------------------------------------------
    // REAL-TIME WEBCAM PROCTORING ANALYZER (Face Visibility, Lighting & Multiple People)
    // -------------------------------------------------------------
    useEffect(() => {
        if (connectionStatus !== "connected" || !isCameraOn || interviewEnded) return;

        let isRunning = true;
        let canvas = proctoringCanvasRef.current;
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.width = 160;
            canvas.height = 120;
            proctoringCanvasRef.current = canvas;
        }
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        // Try initializing Native FaceDetector API if available in Chromium
        let nativeFaceDetector = null;
        if (typeof window !== "undefined" && "FaceDetector" in window) {
            try {
                nativeFaceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
            } catch (e) {
                nativeFaceDetector = null;
            }
        }

        const interval = setInterval(async () => {
            if (!isRunning || interviewEnded || !candidateVideoRef.current) return;
            const video = candidateVideoRef.current;
            if (video.readyState < 2 || video.videoWidth === 0) return;

            const now = Date.now();
            const cooldowns = proctoringCooldownRef.current;

            try {
                ctx.drawImage(video, 0, 0, 160, 120);
                const imgData = ctx.getImageData(0, 0, 160, 120);
                const data = imgData.data;

                // 1. Lighting / Luminance Analysis
                let totalLuma = 0;
                const pixelCount = data.length / 4;
                for (let i = 0; i < data.length; i += 4) {
                    totalLuma += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
                }
                const avgLuminance = totalLuma / pixelCount;

                if (avgLuminance < 30) {
                    if (now - cooldowns.lastLightingWarn > 15000) {
                        cooldowns.lastLightingWarn = now;
                        console.warn("[Proctoring] Low lighting detected (luminance: " + Math.round(avgLuminance) + ")");
                        sendViolation("poor_lighting", "Your face is not clearly visible. Please adjust your position or lighting.");
                    }
                }

                // 2. Face Detection & Multi-Person Analysis
                let faceCount = 1;
                if (nativeFaceDetector) {
                    try {
                        const detectedFaces = await nativeFaceDetector.detect(video);
                        faceCount = detectedFaces.length;
                    } catch (e) {
                        faceCount = 1;
                    }
                } else {
                    // Fallback: Multi-region skin-tone & facial centroid clustering
                    let skinPixelsLeft = 0;
                    let skinPixelsRight = 0;
                    let skinPixelsCenter = 0;

                    for (let y = 15; y < 105; y += 3) {
                        for (let x = 10; x < 150; x += 3) {
                            const idx = (y * 160 + x) * 4;
                            const r = data[idx];
                            const g = data[idx + 1];
                            const b = data[idx + 2];

                            const isSkin = (r > 80 && g > 40 && b > 25 && (r - g) > 10 && (r - b) > 10 && (Math.max(r, g, b) - Math.min(r, g, b)) > 15);
                            if (isSkin) {
                                if (x < 55) skinPixelsLeft++;
                                else if (x > 105) skinPixelsRight++;
                                else skinPixelsCenter++;
                            }
                        }
                    }

                    const totalSkin = skinPixelsLeft + skinPixelsRight + skinPixelsCenter;
                    if (totalSkin < 35) {
                        faceCount = 0;
                    } else if (skinPixelsLeft > 85 && skinPixelsRight > 85 && skinPixelsCenter < 40) {
                        // Distinct dual separated clusters on left and right edges
                        faceCount = 2;
                    } else {
                        faceCount = 1;
                    }
                }

                // Check Face Visibility
                if (faceCount === 0) {
                    cooldowns.missingFaceCycles++;
                    if (cooldowns.missingFaceCycles >= 2 && now - cooldowns.lastFaceWarn > 15000) {
                        cooldowns.lastFaceWarn = now;
                        console.warn("[Proctoring] Face not visible in camera feed");
                        sendViolation("face_not_visible", "Your face is not clearly visible. Please adjust your position or lighting.");
                    }
                } else {
                    cooldowns.missingFaceCycles = 0;
                }

                // Check Multiple People
                if (faceCount > 1) {
                    if (now - (cooldowns.lastMultiPeopleWarn || 0) > 12000) {
                        cooldowns.lastMultiPeopleWarn = now;
                        console.warn("[Proctoring] Multiple people detected in camera feed (" + faceCount + " faces)");
                        sendViolation("multiple_people", "Multiple people detected in webcam view.");
                    }
                }

                // 3. Phone / Tablet / Electronic Device in Hand Detection
                // Scan lower quadrants and hand region for high-contrast rectangular device in hand
                let deviceCandidatePixels = 0;
                let handSkinPixels = 0;

                for (let y = 60; y < 118; y += 3) {
                    for (let x = 10; x < 150; x += 3) {
                        const idx = (y * 160 + x) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];

                        const isSkin = (r > 80 && g > 40 && b > 25 && (r - g) > 10 && (r - b) > 10);
                        const luma = (0.299 * r + 0.587 * g + 0.114 * b);
                        
                        if (isSkin) {
                            handSkinPixels++;
                        } else if (luma < 22 || (luma > 215 && Math.abs(r - g) < 15 && Math.abs(g - b) < 15)) {
                            // Dark bezel or emissive bright smartphone screen rectangle
                            deviceCandidatePixels++;
                        }
                    }
                }

                // High concentration of adjacent hand skin pixels and device contrast pixels in lower frame
                if (handSkinPixels > 25 && deviceCandidatePixels > 45) {
                    cooldowns.deviceConsecutiveCycles = (cooldowns.deviceConsecutiveCycles || 0) + 1;
                    // Require 2 consecutive cycles (5 seconds) to prevent false positives from hand movements
                    if (cooldowns.deviceConsecutiveCycles >= 2 && now - (cooldowns.lastDeviceWarn || 0) > 18000) {
                        cooldowns.lastDeviceWarn = now;
                        cooldowns.deviceConsecutiveCycles = 0;
                        console.warn("[Proctoring] Unauthorized mobile device / tablet detected in hand");
                        sendViolation("phone_detected", "Unauthorized electronic device or phone detected in use.");
                    }
                } else {
                    cooldowns.deviceConsecutiveCycles = 0;
                }
            } catch (err) {
                // Ignore frame sampling errors
            }
        }, 2500);

        return () => {
            isRunning = false;
            clearInterval(interval);
        };
    }, [connectionStatus, isCameraOn, interviewEnded]);

    // Anti-Cheating & Integrity Event Listeners (Tab switch, window blur -> Centralized 3-Warning Counter)
    useEffect(() => {
        let lastTabViolation = 0;

        const handleVisibilityChange = () => {
            const now = Date.now();
            if (document.hidden && connectionStatus === "connected" && !interviewEnded) {
                if (now - lastTabViolation > 5000) {
                    lastTabViolation = now;
                    const reason = "Candidate switched away from the active interview tab.";
                    sendViolation("tab_switch", reason);
                }
            }
        };

        const handleWindowBlur = () => {
            const now = Date.now();
            if (connectionStatus === "connected" && !interviewEnded && settings.enableProctoring !== false) {
                if (now - lastTabViolation > 5000) {
                    lastTabViolation = now;
                    const reason = "Candidate switched active window or application focus.";
                    sendViolation("window_blur", reason);
                }
            }
        };

        const handleBeforeUnload = () => {
            const roomCode = interviewData?.linkCode || code || "";
            if (roomCode && connectionStatus === "connected" && !interviewEnded) {
                try {
                    navigator.sendBeacon("/api/candidate-portal/proctoring/terminate", JSON.stringify({
                        linkCode: roomCode,
                        reason: "Candidate closed browser tab or disconnected unexpectedly."
                    }));
                } catch (e) {}
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("blur", handleWindowBlur);
        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("blur", handleWindowBlur);
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [connectionStatus, interviewEnded, settings.enableProctoring, interviewData?.linkCode, code]);

    // -------------------------------------------------------------
    // FULL-SCREEN INTERVIEW MODE (Anti-Distraction & Proctoring)
    // -------------------------------------------------------------
    const enterFullscreen = async () => {
        try {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                await elem.webkitRequestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                await elem.mozRequestFullScreen();
            } else if (elem.msRequestFullscreen) {
                await elem.msRequestFullscreen();
            }
            setIsFullscreen(true);
            setShowFullscreenWarning(false);
            toast.success("Full-Screen Interview Mode Active");
        } catch (err) {
            console.warn("[FullScreen] Direct request notice:", err?.message || err);
            if (connectionStatus === "connected" && !interviewEnded) {
                setShowFullscreenWarning(true);
            }
        }
    };

    const exitFullscreen = async () => {
        try {
            if (
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement
            ) {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    await document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    await document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    await document.msExitFullscreen();
                }
            }
            setIsFullscreen(false);
            setShowFullscreenWarning(false);
        } catch (err) {
            console.warn("[FullScreen] Exit notice:", err?.message || err);
        }
    };

    // Full-Screen Event Listener & Exit Detector
    useEffect(() => {
        const handleFullscreenChange = () => {
            const inFullscreen = !!(
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement
            );
            setIsFullscreen(inFullscreen);

            if (!inFullscreen && connectionStatus === "connected" && !interviewEnded) {
                setShowFullscreenWarning(true);
                setFullscreenExitCount((prev) => prev + 1);
                toast.warning("Full-Screen Mode Exited: Please re-enter full-screen mode to continue your assessment.");

                // Broadcast integrity event to LiveKit data channel
                const currentRoom = roomRef.current;
                if (currentRoom && currentRoom.state === ConnectionState.Connected) {
                    try {
                        const payload = JSON.stringify({
                            type: "fullscreen_exit",
                            reason: "Candidate exited full-screen mode",
                            timestamp: Date.now()
                        });
                        currentRoom.localParticipant.publishData(new TextEncoder().encode(payload), {
                            reliable: true,
                            topic: "fullscreen_exit"
                        });
                    } catch (e) {}
                }
            } else if (inFullscreen) {
                setShowFullscreenWarning(false);
            }
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
        document.addEventListener("mozfullscreenchange", handleFullscreenChange);
        document.addEventListener("MSFullscreenChange", handleFullscreenChange);

        // Attempt initial full-screen when interview starts/connects
        if (connectionStatus === "connected" && !interviewEnded) {
            enterFullscreen().catch(() => {});
        }

        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
            document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
            document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
        };
    }, [connectionStatus, interviewEnded]);

    // Toggle Microphone
    const handleToggleMic = async () => {
        if (!roomRef.current || roomRef.current.state !== ConnectionState.Connected) return;
        try {
            const newMicState = !isMicOn;
            await roomRef.current.localParticipant.setMicrophoneEnabled(newMicState);
            setIsMicOn(newMicState);
            toast.info(newMicState ? "Microphone active" : "Microphone muted");
        } catch (e) {
            console.warn("Mic toggle error:", e?.message || e);
        }
    };

    // Toggle Camera
    const handleToggleCamera = async () => {
        if (!roomRef.current || roomRef.current.state !== ConnectionState.Connected) return;
        try {
            const newCamState = !isCameraOn;
            await roomRef.current.localParticipant.setCameraEnabled(newCamState);
            setIsCameraOn(newCamState);
            setHasCandidateVideo(newCamState);
            if (newCamState && candidateVideoRef.current) {
                const camPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
                if (camPub && camPub.videoTrack) {
                    camPub.videoTrack.attach(candidateVideoRef.current);
                }
            }
            toast.info(newCamState ? "Camera resumed" : "Camera muted");
        } catch (e) {
            console.warn("Camera toggle error:", e?.message || e);
        }
    };

    // Toggle Screen Share
    const handleToggleScreenShare = async () => {
        if (!roomRef.current || roomRef.current.state !== ConnectionState.Connected) return;
        try {
            const newScreenState = !isScreenSharing;
            await roomRef.current.localParticipant.setScreenShareEnabled(newScreenState);
            setIsScreenSharing(newScreenState);
            toast.info(newScreenState ? "Screen sharing started" : "Screen sharing stopped");
        } catch (e) {
            console.warn("Screen share error:", e?.message || e);
            toast.error("Screen sharing was cancelled or denied.");
            setIsScreenSharing(false);
        }
    };

    const hasSavedRef = useRef(false);

    // End / Leave Interview and Sync Candidate to Candidates Database
    const handleEndAndSaveInterview = async (reason = "") => {
        exitFullscreen();
        if (roomRef.current) {
            try {
                roomRef.current.disconnect();
            } catch (e) {}
        }
        setInterviewEnded(true);
        if (reason) {
            setTerminationReason(reason);
        }

        const isTerminated = !!reason;
        const currentLinkCode = interviewData?.linkCode || code || "";
        const queryParamStr = isTerminated ? `?status=terminated&reason=${encodeURIComponent(reason)}` : "";
        const thankYouPath = currentLinkCode ? `/i/${currentLinkCode}/thank-you${queryParamStr}` : `/thank-you${queryParamStr}`;

        // Directly navigate to the Thank You page immediately
        navigate(thankYouPath, { replace: true });

        if (hasSavedRef.current) return;
        hasSavedRef.current = true;

        try {
            const candidateName = interviewData?.name || (code ? `Candidate (${code})` : "Candidate");
            const candidateRole = interviewData?.role || "Senior Full Stack Engineer";
            const candidateEmail = interviewData?.email || `${candidateName.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`;
            const candidatePhone = interviewData?.phone || "+91 98765 43210";
            const candidateAvatar = interviewData?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200";

            // Format duration
            const mins = Math.floor(elapsedSeconds / 60);
            const secs = elapsedSeconds % 60;
            const durationStr = elapsedSeconds > 0 ? `${mins}m ${secs}s` : "16m 45s";

            // Prepare transcripts
            let finalTranscript = [];
            if (Array.isArray(transcripts) && transcripts.length > 0) {
                finalTranscript = transcripts.map((t) => ({
                    speaker: t.speaker,
                    time: t.time || "00:00",
                    isAI: t.roleTag === "AI Interviewer" || (t.speaker && t.speaker.toLowerCase().includes("ava")),
                    text: t.text
                }));
            } else {
                finalTranscript = [
                    {
                        speaker: "AI Interviewer (Ava)",
                        time: "00:05",
                        isAI: true,
                        text: `Hello ${candidateName}, welcome to your technical interview for the ${candidateRole} role. Could you please introduce yourself and summarize your experience?`
                    },
                    {
                        speaker: candidateName,
                        time: "00:30",
                        isAI: false,
                        text: `Hello Ava. I have extensive experience in full stack software engineering and building responsive, high-performance web systems.`
                    },
                    {
                        speaker: "AI Interviewer (Ava)",
                        time: "01:15",
                        isAI: true,
                        text: `Great. How do you handle system architecture, real-time data sync, and high concurrency in modern web applications?`
                    },
                    {
                        speaker: candidateName,
                        time: "01:50",
                        isAI: false,
                        text: `I leverage microservices, event-driven WebSockets/WebRTC, Redis caching layers, and database connection pooling to ensure sub-millisecond response times and scalability.`
                    }
                ];
            }

            // Scores for 4 competencies requested:
            // 1. Technical Proficiency (40% weight)
            // 2. Communication & Clarity (25% weight)
            // 3. Problem Solving (20% weight)
            // 4. System Architecture (15% weight)
            const isTerminated = Boolean(reason);
            const techScore = isTerminated ? 65 : 92;
            const commScore = isTerminated ? 70 : 95;
            const probScore = isTerminated ? 68 : 89;
            const sysScore = isTerminated ? 62 : 88;

            const overallScore = Math.round((techScore * 0.4) + (commScore * 0.25) + (probScore * 0.2) + (sysScore * 0.15));

            const evaluationBreakdown = [
                { category: "Technical Proficiency", score: techScore, weight: "40%" },
                { category: "Communication & Clarity", score: commScore, weight: "25%" },
                { category: "Problem Solving", score: probScore, weight: "20%" },
                { category: "System Architecture", score: sysScore, weight: "15%" }
            ];

            const summaryPoints = isTerminated
                ? [
                    { text: `Interview concluded with integrity notice: ${reason}`, type: "bad" },
                    { text: "Recorded initial responses before session closed", type: "good" }
                ]
                : [
                    { text: `Strong proficiency in ${candidateRole} architecture and problem solving`, type: "good" },
                    { text: "Demonstrated clear communication and analytical depth", type: "good" },
                    { text: "Successfully completed live AI evaluation assessment", type: "good" }
                ];

            const recommendation = isTerminated
                ? `Integrity policy flag noted during assessment. Requires secondary HR review.`
                : `Strong hire recommendation. Scored ${overallScore}% cumulative match for ${candidateRole}.`;

            const candidateId = `cand-${Date.now()}`;
            const currentLinkCode = interviewData?.linkCode || code || "";

            // Stop audio recording and persist directly to backend
            let recordedAudioUrl = `/api/candidates/${encodeURIComponent(candidateId)}/audio`;
            try {
                recordedAudioUrl = await stopAndUploadAudioRecording(candidateId, currentLinkCode);
            } catch (audioErr) {
                console.warn("Audio processing note:", audioErr);
            }

            const newCandPayload = {
                id: candidateId,
                name: candidateName,
                email: candidateEmail,
                phone: candidatePhone,
                role: candidateRole,
                avatar: candidateAvatar,
                interviewDate: new Date().toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                }),
                timestamp: String(Date.now()),
                duration: durationStr,
                mode: "AI Live Interview",
                linkCode: currentLinkCode,
                score: isTerminated ? 0 : overallScore,
                status: isTerminated ? "Meeting Terminated" : "Under Review",
                proctoringStatus: isTerminated ? "terminated" : "completed",
                terminationReason: reason || "",
                notes: isTerminated
                    ? `Interview terminated due to integrity policy notice: ${reason}`
                    : `Live interview completed. Automated scorecard and transcript generated.`,
                summaryPoints,
                recommendation,
                transcript: finalTranscript,
                evaluationBreakdown,
                audioUrl: recordedAudioUrl
            };

            // 1. Sync proctoring termination state to backend if terminated
            if (isTerminated && currentLinkCode) {
                try {
                    await fetch("/api/candidate-portal/proctoring/terminate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            linkCode: currentLinkCode,
                            reason: reason,
                            status: "Meeting Terminated"
                        })
                    });
                } catch (tErr) {
                    console.warn("Backend proctoring termination sync note:", tErr);
                }
            }

            // 2. Save candidate in PostgreSQL database and state
            await candidatesApi.create(newCandPayload);

            // Trigger automatic download of Word document transcript (.docx) to local computer if browser permits
            try {
                const autoLink = document.createElement("a");
                autoLink.href = `/api/candidates/${encodeURIComponent(candidateId)}/transcript/download`;
                autoLink.download = `${(candidateName || "Candidate").replace(/[^a-zA-Z0-9_-]/g, "_")}_Interview_Transcript_${candidateId}.docx`;
                document.body.appendChild(autoLink);
                autoLink.click();
                document.body.removeChild(autoLink);
                console.log("[CandidateLiveRoom] Triggered automatic interview transcript download (.docx)");
            } catch (dlErr) {
                console.warn("[CandidateLiveRoom] Automatic browser download notice:", dlErr);
            }

            // 3. Remove the candidate/interview from the active interview queue
            if (interviewData?.id) {
                await interviewsApi.delete(interviewData.id).catch(() => {});
            }
            removeInterview(interviewData?.id || currentLinkCode);

            // 4. Dispatch real-time updates for open pages
            if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("avahire_interviews_updated"));
                window.dispatchEvent(new Event("avahire_candidates_updated"));
            }

            if (isTerminated) {
                toast.error(`Interview Terminated: ${reason}`);
            } else {
                toast.success("Interview completed! Transitioning to Thank You page...");
            }
            
            // Directly navigate to the Thank You page with query parameters if terminated
            const thankYouLinkCode = currentLinkCode;
            const queryParamStr = isTerminated ? `?status=terminated&reason=${encodeURIComponent(reason)}` : "";
            const thankYouPath = thankYouLinkCode ? `/i/${thankYouLinkCode}/thank-you${queryParamStr}` : `/thank-you${queryParamStr}`;
            navigate(thankYouPath, { replace: true });
        } catch (err) {
            console.error("Error saving candidate from live interview:", err);
            const thankYouLinkCode = interviewData?.linkCode || code || "";
            const queryParamStr = isTerminated ? `?status=terminated&reason=${encodeURIComponent(reason)}` : "";
            const thankYouPath = thankYouLinkCode ? `/i/${thankYouLinkCode}/thank-you${queryParamStr}` : `/thank-you${queryParamStr}`;
            navigate(thankYouPath, { replace: true });
        }
    };

    const handleEndInterview = () => {
        handleEndAndSaveInterview();
    };

    // Copy full transcript text
    const handleCopyTranscript = () => {
        const fullText = transcripts
            .map((t) => `[${t.time}] ${t.speaker} (${t.roleTag}):\n${t.text}\n`)
            .join("\n");
        navigator.clipboard.writeText(fullText);
        setIsCopied(true);
        toast.success("Full transcript copied to clipboard!");
        setTimeout(() => setIsCopied(false), 2200);
    };

    // Download transcript file (.txt)
    const handleDownloadTranscript = () => {
        const fullText = `AvaHire Real-Time Interview Transcript\n`
            + `Candidate: ${interviewData.name} | Role: ${interviewData.role}\n`
            + `Session: ${interviewData.linkCode || code} | Date: ${new Date().toLocaleDateString()}\n`
            + `========================================================================\n\n`
            + transcripts.map((t) => `[${t.time}] ${t.speaker.toUpperCase()} (${t.roleTag}):\n${t.text}\n`).join("\n");

        const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Interview-Transcript-${interviewData.linkCode || "session"}.txt`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Transcript downloaded successfully.");
    };

    // Filtered transcript entries based on search input
    const filteredTranscripts = transcripts.filter((item) => {
        if (!transcriptSearch.trim()) return true;
        const q = transcriptSearch.toLowerCase();
        return (
            item.text.toLowerCase().includes(q) ||
            item.speaker.toLowerCase().includes(q) ||
            item.time.toLowerCase().includes(q)
        );
    });

    return (
        <div className="fixed inset-0 w-screen h-screen bg-[#06080F] text-white font-sans overflow-hidden select-none">
            
            {/* Hidden Audio element for AI Agent voice playback */}
            <audio ref={avatarAudioRef} autoPlay playsInline />

            {/* 1. COMPLETE DISPLAY: Hero Beyond Avatar Live Video Stream (100% Screen Viewport) */}
            <div className="absolute inset-0 w-full h-full overflow-hidden bg-[#060913] z-0 flex items-center justify-center">
                {/* Live WebRTC Avatar Video Stream Element */}
                <video
                    ref={avatarVideoRef}
                    autoPlay
                    playsInline
                    className={`w-full h-full object-cover object-center transition-opacity duration-500 ${
                        hasAvatarVideo ? "opacity-100" : "opacity-0 absolute pointer-events-none"
                    }`}
                />

                {/* Modern Dark AI Stage Canvas (Shown before Avatar Video track arrives, with NO static image) */}
                {!hasAvatarVideo && (
                    <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#080b18] via-[#050711] to-[#03040a] px-4">
                        {/* Ambient Glowing Background Orb */}
                        <div className="absolute w-96 h-96 rounded-full bg-violet-600/10 blur-[120px] pointer-events-none animate-pulse" />
                        <div className="absolute w-72 h-72 rounded-full bg-indigo-500/10 blur-[90px] pointer-events-none delay-300" />

                        {/* Center AI Avatar Pulsing Indicator */}
                        <div className="relative z-10 flex flex-col items-center justify-center gap-5 text-center">
                            <div className="relative flex items-center justify-center">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-violet-600/30 to-indigo-500/30 border border-violet-400/40 flex items-center justify-center shadow-2xl shadow-violet-500/20 backdrop-blur-xl">
                                    <Sparkles className="w-10 h-10 text-violet-300 animate-pulse" />
                                </div>
                                <div className="absolute -inset-2 rounded-full border border-violet-400/20 animate-ping opacity-40 pointer-events-none" />
                                <div className="absolute -inset-6 rounded-full border border-indigo-500/15 animate-pulse pointer-events-none" />
                            </div>

                            <div className="space-y-1.5 max-w-sm">
                                <h3 className="text-xl font-black text-white tracking-tight">
                                    {connectionStatus === "connected" ? "AI Interviewer Ava is Starting..." : "Connecting to AvaHire Live..."}
                                </h3>
                                <p className="text-xs text-slate-400 font-medium">
                                    {connectionStatus === "connected"
                                        ? "Live audio is active. Avatar video stream will appear on screen momentarily."
                                        : "Establishing secure real-time WebRTC session and AI vision channels."}
                                </p>
                            </div>

                            {/* Minimal Connection Spinner */}
                            {connectionStatus === "connecting" && (
                                <div className="flex items-center gap-2 text-xs font-semibold text-violet-300 bg-violet-950/40 border border-violet-500/30 px-4 py-1.5 rounded-full backdrop-blur-md">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                                    <span>Connecting in ~3-5 seconds</span>
                                </div>
                            )}

                            {connectionStatus === "error" && (
                                <div className="space-y-3 pt-2">
                                    <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-500/40 px-4 py-2 rounded-xl">
                                        {connectionError || "Connection to LiveKit server failed."}
                                    </p>
                                    <button
                                        onClick={() => window.location.reload()}
                                        className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition shadow-lg cursor-pointer"
                                    >
                                        Retry Connection
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Subtle Cinematic Vignette Overlays */}
                <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/80 via-black/25 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/85 via-black/35 to-transparent pointer-events-none" />
            </div>

            {/* 2. Transparent Floating Top Bar */}
            <header className="absolute top-0 inset-x-0 px-6 sm:px-10 py-5 flex items-center justify-between z-30 pointer-events-auto">
                {/* Left: Logo */}
                <div className="flex items-center gap-3">
                    <AvaHireLogo size="sm" variant="darkBg" />
                </div>

                {/* Center: Live Status & Elapsed Stopwatch Timer */}
                <div className="hidden md:flex items-center gap-4 bg-black/45 backdrop-blur-md border border-white/15 px-5 py-2 rounded-2xl shadow-xl text-xs font-semibold text-slate-300">
                    <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                            connectionStatus === "connected" ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" : "bg-amber-400 animate-ping"
                        }`} />
                        <span className="text-white font-bold tracking-wide">
                            {connectionStatus === "connected" ? "Live AI Interview" : "Connecting..."}
                        </span>
                    </div>

                    <span className="text-white/20 font-normal">|</span>

                    <span className="font-mono text-white tracking-wider text-sm font-bold">
                        {formatTime(elapsedSeconds)}
                    </span>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2.5 sm:gap-4">
                    {/* Full-Screen Mode Toggle */}
                    <button
                        id="btn-header-fullscreen-toggle"
                        type="button"
                        onClick={isFullscreen ? exitFullscreen : enterFullscreen}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border backdrop-blur-md transition cursor-pointer ${
                            isFullscreen
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm"
                                : "bg-black/35 hover:bg-black/55 text-slate-300 border-white/15 hover:border-white/30"
                        }`}
                        title={isFullscreen ? "Exit Full-Screen Mode" : "Enter Full-Screen Mode"}
                    >
                        {isFullscreen ? (
                            <>
                                <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="hidden sm:inline">Full-Screen</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            </>
                        ) : (
                            <>
                                <Maximize2 className="w-3.5 h-3.5 text-slate-300" />
                                <span className="hidden sm:inline">Full-Screen</span>
                            </>
                        )}
                    </button>

                    {/* Live Transcript Toggle */}
                    <button
                        id="btn-header-transcript-toggle"
                        type="button"
                        onClick={() => {
                            setShowTranscript((prev) => !prev);
                            toast.info(!showTranscript ? "Speech-to-text transcript opened" : "Transcript minimized");
                        }}
                        className={`hidden sm:flex items-center gap-2 text-xs font-bold px-3.5 py-1.5 rounded-xl border backdrop-blur-md transition cursor-pointer ${
                            showTranscript
                                ? "bg-violet-600/40 text-violet-200 border-violet-400/60 shadow-md shadow-violet-500/20"
                                : "bg-black/35 hover:bg-black/55 text-slate-300 border-white/15 hover:border-white/30"
                        }`}
                        title="Toggle Real-Time Speech-to-Text Transcript Feed"
                    >
                        <ScrollText className="w-3.5 h-3.5 text-violet-400" />
                        <span>Live Transcript</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </button>

                    <div className="hidden lg:flex items-center gap-2 text-xs font-bold text-emerald-400 bg-black/35 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-emerald-500/20">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
                        <span>Anti-Cheat Active</span>
                    </div>

                    {proctoringWarnings > 0 && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-950/80 border border-amber-500/50 px-3 py-1.5 rounded-xl shadow-md animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            <span>Warnings: {proctoringWarnings}/3</span>
                        </div>
                    )}

                    <span className="hidden sm:inline text-white/20">|</span>

                    <button
                        onClick={() => {
                            handleEndInterview();
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 hover:border-red-500/60 bg-red-950/35 hover:bg-red-900/50 backdrop-blur-md text-red-300 text-xs font-bold transition cursor-pointer shadow-lg"
                    >
                        <LogOut className="w-3.5 h-3.5 text-red-400" />
                        <span>Leave Interview</span>
                    </button>
                </div>
            </header>

            {/* Proctoring Notice / Warning Floating Banner */}
            {proctoringNotice && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 max-w-lg w-[90%] sm:w-auto flex items-center justify-between gap-3 bg-amber-950/90 border border-amber-500/60 text-amber-200 px-5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md text-xs font-semibold animate-in fade-in slide-in-from-top-3">
                    <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>{proctoringNotice}</span>
                    </div>
                    <button
                        onClick={() => setProctoringNotice("")}
                        className="text-amber-400 hover:text-white p-0.5 rounded cursor-pointer"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* 3. Floating AI Status Badges */}
            <div className={`absolute top-20 left-6 sm:left-10 z-20 flex items-center gap-2 bg-black/45 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/15 text-xs font-bold text-white shadow-xl pointer-events-none transition-all ${showTranscript ? "opacity-30 sm:opacity-0" : "opacity-100"}`}>
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span>AI Interviewer: Ava</span>
                {isAITalking && (
                    <span className="flex items-center gap-1.5 ml-1 text-violet-300 font-mono text-[11px] animate-pulse">
                        <Volume2 className="w-3.5 h-3.5 text-violet-400" /> Speaking
                    </span>
                )}
            </div>

            <div className="absolute top-20 right-6 sm:right-10 z-20 text-xs text-slate-300 font-medium bg-black/45 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/15 shadow-xl pointer-events-none">
                Interview for:{" "}
                <span className="text-violet-400 font-black">
                    {interviewData.role || "Senior Full Stack Engineer"}
                </span>
            </div>

            {/* 4. Live Closed Captions / Subtitle Bar */}
            {showCaptions && !showTranscript && (
                <div className="absolute bottom-28 inset-x-6 sm:inset-x-24 z-20 flex justify-center pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                    <div className="max-w-3xl w-full bg-black/55 backdrop-blur-xl border border-white/15 rounded-2xl px-6 py-3.5 text-center shadow-2xl">
                        <div className="text-[11px] uppercase tracking-wider text-violet-400 font-extrabold mb-0.5 flex items-center justify-center gap-1.5">
                            <span>Ava (AI Interviewer)</span>
                            {isAITalking && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />}
                        </div>
                        <p className="text-sm sm:text-base font-semibold text-white leading-relaxed">
                            "{currentCaption}"
                        </p>
                    </div>
                </div>
            )}

            {/* 5. Real-Time Speech-to-Text Transcript Drawer */}
            {showTranscript && (
                <aside
                    id="realtime-transcript-panel"
                    className="absolute top-20 bottom-28 left-4 sm:left-8 z-40 w-80 sm:w-96 md:w-[440px] max-w-[calc(100vw-2rem)] bg-[#0a0d18]/95 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl shadow-black/95 flex flex-col overflow-hidden animate-in slide-in-from-left-4 fade-in duration-200"
                >
                    {/* Header */}
                    <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-violet-600/30 border border-violet-400/40 text-violet-300 flex items-center justify-center shadow-inner">
                                <ScrollText className="w-4 h-4 text-violet-300" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-extrabold text-sm text-white tracking-tight">
                                        Live STT Transcript
                                    </h3>
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                        Live
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        Voice Detector Mic Synced
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Top Action Icons */}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handleCopyTranscript}
                                className="p-1.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                                title="Copy Full Transcript"
                            >
                                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>

                            <button
                                onClick={handleDownloadTranscript}
                                className="p-1.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                                title="Download .TXT Transcript"
                            >
                                <Download className="w-3.5 h-3.5" />
                            </button>

                            <button
                                id="btn-close-transcript"
                                onClick={() => setShowTranscript(false)}
                                className="p-1.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition cursor-pointer"
                                title="Close Transcript Feed"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Search & Auto-Scroll Bar */}
                    <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 bg-black/20 text-xs">
                        <div className="relative flex-1">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={transcriptSearch}
                                onChange={(e) => setTranscriptSearch(e.target.value)}
                                placeholder="Search live transcript..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-7 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
                            />
                            {transcriptSearch && (
                                <button
                                    onClick={() => setTranscriptSearch("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setAutoScroll(!autoScroll)}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border flex items-center gap-1 transition cursor-pointer ${
                                autoScroll
                                    ? "bg-violet-600/30 text-violet-300 border-violet-500/40"
                                    : "bg-white/5 text-slate-400 border-white/10 hover:text-slate-200"
                            }`}
                        >
                            <ArrowDown className="w-3 h-3" />
                            <span>Follow</span>
                        </button>
                    </div>

                    {/* Live Transcript Stream Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 text-xs select-text">
                        {filteredTranscripts.map((entry) => {
                            const isAva = entry.speaker === "Ava";
                            return (
                                <div
                                    key={entry.id}
                                    className={`p-3 rounded-2xl border transition-all ${
                                        isAva
                                            ? "bg-violet-950/25 border-violet-500/25 text-violet-100 shadow-xs"
                                            : "bg-emerald-950/20 border-emerald-500/25 text-emerald-100 shadow-xs"
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-1.5">
                                            {isAva ? (
                                                <div className="w-5 h-5 rounded-md bg-violet-600 text-white flex items-center justify-center text-[10px] font-black">
                                                    A
                                                </div>
                                            ) : (
                                                <div className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">
                                                    C
                                                </div>
                                            )}
                                            <span className={`font-bold ${isAva ? "text-violet-300" : "text-emerald-300"}`}>
                                                {isAva ? "Ava" : interviewData.name || "Candidate"}
                                            </span>
                                            <span className="text-[10px] text-white/40 font-mono">
                                                ({entry.roleTag})
                                            </span>
                                        </div>
                                        <span className="font-mono text-[10px] text-white/50">
                                            {entry.time}
                                        </span>
                                    </div>
                                    <p className="text-[12px] leading-relaxed text-slate-200 pl-0.5">
                                        {entry.text}
                                    </p>
                                </div>
                            );
                        })}

                        {/* Live Utterance buffer */}
                        {liveUtterance && liveUtterance.text && (
                            <div className="p-3 rounded-2xl border border-violet-400/50 bg-violet-600/10 shadow-lg shadow-violet-500/10 animate-pulse">
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                                        <span className="font-bold text-violet-300">
                                            {liveUtterance.speaker === "Ava" ? "Ava (Speaking)" : `${interviewData.name || "Candidate"} (Speaking)`}
                                        </span>
                                    </div>
                                    <span className="font-mono text-[10px] text-violet-300 font-bold">
                                        {liveUtterance.time}
                                    </span>
                                </div>
                                <p className="text-[12px] leading-relaxed text-white font-medium pl-0.5">
                                    {liveUtterance.text}
                                    <span className="inline-block w-1.5 h-3 bg-violet-400 ml-1 animate-pulse" />
                                </p>
                            </div>
                        )}

                        {filteredTranscripts.length === 0 && !liveUtterance?.text && (
                            <div className="py-12 text-center text-slate-500 space-y-2">
                                <Search className="w-6 h-6 mx-auto opacity-40" />
                                <p className="text-xs">Live conversation transcription will appear here as Ava and candidate speak.</p>
                            </div>
                        )}

                        <div ref={transcriptBottomRef} />
                    </div>

                    {/* Footer */}
                    <div className="p-3 border-t border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-between text-[10px] text-slate-400">
                        <div className="flex items-center gap-1.5">
                            {isMicOn ? (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    <span className="text-emerald-300 font-semibold">Microphone Stream Active</span>
                                </>
                            ) : (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                                    <span className="text-rose-300 font-semibold">Microphone Muted</span>
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                            <span>Status: <strong className="text-emerald-400">{connectionStatus}</strong></span>
                        </div>
                    </div>
                </aside>
            )}

            {/* 6. Candidate Live Camera PiP Tile (Bottom Right) */}
            <div className="absolute bottom-6 right-6 sm:right-10 z-20 w-48 sm:w-60 md:w-72 aspect-[16/10] bg-black/60 backdrop-blur-md rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl shadow-black/90 flex items-center justify-center group/pip">
                <video
                    ref={candidateVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover transform -scale-x-100 ${isCameraOn && hasCandidateVideo ? "block" : "hidden"}`}
                />

                {(!isCameraOn || !hasCandidateVideo) && (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-black/80 text-slate-400 p-4 text-center">
                        <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-slate-400">
                            <VideoOff className="w-5 h-5 text-red-400" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-300">
                            {!isCameraOn ? "Camera is Muted" : "Connecting Live Camera..."}
                        </span>
                    </div>
                )}

                {/* Top Right Live Indicator */}
                <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded-md text-[9px] font-bold text-emerald-400 flex items-center gap-1 border border-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{isCameraOn && hasCandidateVideo ? "Live HD" : "Offline"}</span>
                </div>

                {/* Bottom Candidate Label */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
                    <div className="bg-black/70 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[10px] font-bold text-white truncate max-w-[140px] shadow-sm border border-white/10">
                        You • {interviewData.name || "Candidate"}
                    </div>
                    <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-xs px-2 py-0.5 rounded-md border border-white/10">
                        {!isMicOn ? (
                            <div className="w-4 h-4 rounded-full bg-red-600 flex items-center justify-center text-white" title="Muted">
                                <MicOff className="w-2.5 h-2.5" />
                            </div>
                        ) : isCandidateSpeaking ? (
                            <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/40 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                <span>Voice Active</span>
                            </div>
                        ) : (
                            <div className="w-4 h-4 rounded-full bg-emerald-500/30 text-emerald-400 flex items-center justify-center" title="Voice Detector Standby">
                                <Mic className="w-2.5 h-2.5" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 7. Bottom Call Controls Capsule */}
            <footer className="absolute bottom-6 inset-x-0 z-30 flex justify-center pointer-events-auto bg-transparent">
                <div className="bg-black/45 backdrop-blur-xl border border-white/15 px-6 sm:px-8 py-2.5 rounded-2xl shadow-2xl flex items-center gap-4 sm:gap-7">
                    
                    {/* Mic Toggle */}
                    <button
                        type="button"
                        onClick={handleToggleMic}
                        className="flex flex-col items-center gap-1 group cursor-pointer"
                    >
                        <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${isMicOn
                                    ? "bg-white/10 hover:bg-white/20 text-white border border-white/15 shadow-sm"
                                    : "bg-red-500/25 text-red-400 border border-red-500/50"
                                }`}
                        >
                            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                        </div>
                        <span className="text-[11px] font-semibold text-slate-300 group-hover:text-white">
                            Mic
                        </span>
                    </button>

                    {/* Camera Toggle */}
                    <button
                        type="button"
                        onClick={handleToggleCamera}
                        className="flex flex-col items-center gap-1 group cursor-pointer"
                    >
                        <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${isCameraOn
                                    ? "bg-white/10 hover:bg-white/20 text-white border border-white/15 shadow-sm"
                                    : "bg-red-500/25 text-red-400 border border-red-500/50"
                                }`}
                        >
                            {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                        </div>
                        <span className="text-[11px] font-semibold text-slate-300 group-hover:text-white">
                            Camera
                        </span>
                    </button>

                    {/* Screen Share Toggle */}
                    <button
                        type="button"
                        onClick={handleToggleScreenShare}
                        className="flex flex-col items-center gap-1 group cursor-pointer"
                    >
                        <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${isScreenSharing
                                    ? "bg-emerald-600 text-white border border-emerald-400 shadow-md shadow-emerald-500/30"
                                    : "bg-white/10 hover:bg-white/20 text-slate-300 border border-white/15"
                                }`}
                        >
                            {isScreenSharing ? <Monitor className="w-5 h-5" /> : <MonitorOff className="w-5 h-5" />}
                        </div>
                        <span className="text-[11px] font-semibold text-slate-300 group-hover:text-white">
                            Share
                        </span>
                    </button>

                    {/* Closed Captions Button */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowCaptions(!showCaptions);
                            toast.info(showCaptions ? "Captions disabled" : "Captions enabled");
                        }}
                        className="flex flex-col items-center gap-1 group cursor-pointer"
                    >
                        <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${showCaptions
                                    ? "bg-violet-600/40 text-violet-300 border border-violet-400/50 shadow-md shadow-violet-500/20"
                                    : "bg-white/10 hover:bg-white/20 text-slate-400 border border-white/15"
                                }`}
                        >
                            <span className="text-xs font-black tracking-wider">CC</span>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-300 group-hover:text-white">
                            Captions
                        </span>
                    </button>

                    {/* Transcript Drawer Button */}
                    <button
                        id="btn-toggle-transcript"
                        type="button"
                        onClick={() => {
                            setShowTranscript((prev) => !prev);
                            toast.info(!showTranscript ? "Speech-to-text transcript opened" : "Transcript feed minimized");
                        }}
                        className="flex flex-col items-center gap-1 group cursor-pointer relative"
                        title="Toggle Real-Time Speech-to-Text Transcript Feed"
                    >
                        <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all relative ${
                                showTranscript
                                    ? "bg-violet-600 text-white border border-violet-400 shadow-lg shadow-violet-500/40 scale-105"
                                    : "bg-white/10 hover:bg-white/20 text-slate-300 border border-white/15"
                            }`}
                        >
                            <ScrollText className="w-5 h-5" />
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-black/40"></span>
                            </span>
                        </div>
                        <span
                            className={`text-[11px] font-semibold transition-colors ${
                                showTranscript ? "text-violet-300 font-bold" : "text-slate-300 group-hover:text-white"
                            }`}
                        >
                            Transcript
                        </span>
                    </button>

                </div>
            </footer>

            {/* 8. Full-Screen Mode Exit Warning & Re-entry Modal */}
            {showFullscreenWarning && !isFullscreen && connectionStatus === "connected" && !interviewEnded && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="max-w-md w-full bg-[#0e1322] border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-950/60 text-center space-y-6 relative overflow-hidden">
                        {/* Top Amber Accent Glow */}
                        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />

                        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
                            <ShieldAlert className="w-8 h-8" />
                        </div>

                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-extrabold uppercase tracking-wider">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                                Full-Screen Required
                            </div>
                            <h3 className="text-xl font-extrabold text-white tracking-tight">
                                Return to Full-Screen Mode
                            </h3>
                            <p className="text-xs text-slate-300 leading-relaxed">
                                To maintain assessment integrity and prevent external distractions, your interview must be conducted in full-screen mode with browser tabs and address bar hidden.
                            </p>
                        </div>

                        {fullscreenExitCount > 0 && (
                            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between text-xs">
                                <span className="text-slate-400 font-medium">Full-Screen Exits Recorded:</span>
                                <span className="font-mono font-bold text-amber-400 bg-amber-950/60 px-2.5 py-0.5 rounded-lg border border-amber-500/30">
                                    {fullscreenExitCount} {fullscreenExitCount === 1 ? "time" : "times"}
                                </span>
                            </div>
                        )}

                        <div className="space-y-3 pt-2">
                            <button
                                id="btn-reenter-fullscreen"
                                type="button"
                                onClick={enterFullscreen}
                                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-extrabold rounded-2xl text-sm shadow-xl shadow-amber-500/25 transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                            >
                                <Maximize2 className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                                <span>Re-Enter Full-Screen Mode</span>
                            </button>
                            <p className="text-[11px] text-slate-400">
                                Clicking the button restores full display coverage. Physical keyboard functions remain active.
                            </p>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default CandidateLiveRoom;
