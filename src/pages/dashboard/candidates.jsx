import React, { useState, useMemo, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { candidatesApi, jobsApi, resumesApi, interviewsApi } from "@/services/api";
import { getMatchingResumesForJob, enrichCandidateForJob } from "@/utils/jdMatcher";
import {
    Mail,
    Phone,
    Calendar,
    Clock,
    Check,
    X,
    Filter,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    Search,
    SlidersHorizontal,
    Video,
    Sparkles,
    ShieldAlert,
    Download,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Star,
    Save,
    CheckCircle2,
    AlertCircle,
    Bot,
    User,
    Users,
    Database,
    Trash2,
    Briefcase,
    FileText,
    ExternalLink,
    Copy,
    RotateCw,
    ShieldCheck
} from "lucide-react";

const initialCandidates = [];

const Candidates = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const jobQueryParam = searchParams.get("job") || "";
    const statusQueryParam = searchParams.get("status") || "All";
    const searchQueryParam = searchParams.get("search") || "";

    const [candidates, setCandidates] = useState(initialCandidates);
    const [jobs, setJobs] = useState([]);
    const [resumes, setResumes] = useState([]);
    const [interviews, setInterviews] = useState([]);
    const [selectedPortalCandidate, setSelectedPortalCandidate] = useState(null);
    const [copiedPortalId, setCopiedPortalId] = useState(null);
    const [sortBy, setSortBy] = useState("Latest Interview");
    const [statusFilter, setStatusFilter] = useState(statusQueryParam || "All");
    const [jobFilter, setJobFilter] = useState(jobQueryParam);
    const [searchQuery, setSearchQuery] = useState(searchQueryParam);
    const [preferences, setPreferences] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("avahire_settings_preferences") || "{}");
        } catch {
            return {};
        }
    });
    const [pageSize, setPageSize] = useState(() => {
        try {
            const prefs = JSON.parse(localStorage.getItem("avahire_settings_preferences") || "{}");
            return Number(prefs.candidatesPerPage) || 10;
        } catch {
            return 10;
        }
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [showFilterModal, setShowFilterModal] = useState(false);

    // Expanded candidate accordion / downward drawer state
    const [expandedCandidateId, setExpandedCandidateId] = useState(null);
    const [drawerTab, setDrawerTab] = useState("transcript"); // "transcript" | "evaluation" | "scores"

    // Real Audio Player State for Interview Recording Playback
    const audioRef = useRef(null);
    const [playingAudioCandidateId, setPlayingAudioCandidateId] = useState(null);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioCurrentTime, setAudioCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState("1x");
    const [currentCandidateNotes, setCurrentCandidateNotes] = useState({});

    const formatAudioTime = (secs) => {
        if (!Number.isFinite(secs) || isNaN(secs) || secs < 0) return "00:00";
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    const handleTogglePlayAudio = (candidate) => {
        const audio = audioRef.current;
        if (!audio || !candidate) return;

        if (playingAudioCandidateId === candidate.id) {
            if (isAudioPlaying) {
                audio.pause();
                setIsAudioPlaying(false);
            } else {
                audio.play().then(() => {
                    setIsAudioPlaying(true);
                }).catch((e) => {
                    console.warn("Resume playback note:", e);
                });
            }
        } else {
            audio.pause();
            const src = candidate.audioUrl || `/api/candidates/${encodeURIComponent(candidate.id)}/audio`;
            audio.src = src;
            audio.playbackRate = playbackSpeed === "2x" ? 2.0 : (playbackSpeed === "1.5x" ? 1.5 : 1.0);
            audio.muted = isMuted;
            setPlayingAudioCandidateId(candidate.id);
            setAudioCurrentTime(0);
            setAudioDuration(0);
            audio.play().then(() => {
                setIsAudioPlaying(true);
            }).catch((err) => {
                console.warn("Audio playback notice:", err);
                setIsAudioPlaying(false);
            });
        }
    };

    const handleSeekAudio = (e, candidate) => {
        const audio = audioRef.current;
        if (!audio) return;
        if (candidate && playingAudioCandidateId !== candidate.id) return;

        const dur = (Number.isFinite(audioDuration) && audioDuration > 0)
            ? audioDuration
            : (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);

        if (!dur || !Number.isFinite(dur) || dur <= 0) return;

        const rect = e.currentTarget.getBoundingClientRect();
        if (!rect || !rect.width || rect.width <= 0) return;

        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        if (!Number.isFinite(ratio)) return;

        const newTime = ratio * dur;
        if (Number.isFinite(newTime) && newTime >= 0) {
            try {
                audio.currentTime = newTime;
                setAudioCurrentTime(newTime);
            } catch (err) {
                console.warn("Failed to seek audio:", err);
            }
        }
    };

    const handleSpeedChange = () => {
        const nextSpeed = playbackSpeed === "1x" ? "1.5x" : playbackSpeed === "1.5x" ? "2x" : "1x";
        setPlaybackSpeed(nextSpeed);
        if (audioRef.current) {
            audioRef.current.playbackRate = nextSpeed === "2x" ? 2.0 : (nextSpeed === "1.5x" ? 1.5 : 1.0);
        }
    };

    const handleMuteToggle = () => {
        const nextMute = !isMuted;
        setIsMuted(nextMute);
        if (audioRef.current) {
            audioRef.current.muted = nextMute;
        }
    };

    useEffect(() => {
        if (jobQueryParam) setJobFilter(jobQueryParam);
        if (statusQueryParam && statusQueryParam !== "All") setStatusFilter(statusQueryParam);
        if (searchQueryParam) setSearchQuery(searchQueryParam);
    }, [jobQueryParam, statusQueryParam, searchQueryParam]);

    useEffect(() => {
        const fetchCandidates = async () => {
            try {
                const [candData, jobsData, resumesData, ivData] = await Promise.all([
                    candidatesApi.getAll().catch(() => []),
                    jobsApi.getAll().catch(() => []),
                    resumesApi.getAll().catch(() => []),
                    interviewsApi.getAll().catch(() => [])
                ]);
                if (Array.isArray(candData)) {
                    setCandidates(candData);
                }
                if (Array.isArray(jobsData)) {
                    setJobs(jobsData);
                }
                if (Array.isArray(resumesData)) {
                    setResumes(resumesData);
                }
                if (Array.isArray(ivData)) {
                    setInterviews(ivData);
                }
            } catch (err) {
                console.error("Failed to load candidates/interviews from backend:", err);
            }
        };
        fetchCandidates();

        const handleSync = () => {
            fetchCandidates();
        };

        const handlePrefUpdate = (e) => {
            const prefs = e.detail || JSON.parse(localStorage.getItem("avahire_settings_preferences") || "{}");
            setPreferences(prefs);
            if (prefs.candidatesPerPage) {
                setPageSize(Number(prefs.candidatesPerPage) || 10);
            }
        };

        window.addEventListener("avahire_candidates_updated", handleSync);
        window.addEventListener("avahire_preferences_updated", handlePrefUpdate);

        // Auto Refresh Interval
        let refreshTimer = null;
        const autoRefreshPref = preferences.autoRefresh || "Every 5 minutes";
        let intervalMs = 0;
        if (autoRefreshPref === "Every 1 minute") intervalMs = 60000;
        else if (autoRefreshPref === "Every 5 minutes") intervalMs = 300000;
        else if (autoRefreshPref === "Every 15 minutes") intervalMs = 900000;

        if (intervalMs > 0) {
            refreshTimer = setInterval(() => {
                fetchCandidates();
            }, intervalMs);
        }

        return () => {
            window.removeEventListener("avahire_candidates_updated", handleSync);
            window.removeEventListener("avahire_preferences_updated", handlePrefUpdate);
            if (refreshTimer) clearInterval(refreshTimer);
        };
    }, [preferences.autoRefresh]);

    const getCandidateInterview = (candidate) => {
        if (!candidate) return null;
        return interviews.find(
            (iv) =>
                (iv.email && candidate.email && iv.email.toLowerCase() === candidate.email.toLowerCase()) ||
                iv.candidateId === candidate.id ||
                iv.id === candidate.interviewId ||
                iv.resumeId === candidate.id
        );
    };

    const handleCopyPortalLink = (linkCode) => {
        const portalUrl = `${window.location.origin}/i/${linkCode}`;
        navigator.clipboard?.writeText(portalUrl);
        setCopiedPortalId(linkCode);
        toast.success(`Candidate Portal link copied: ${portalUrl}`);
        setTimeout(() => setCopiedPortalId(null), 2500);
    };

    const handleOpenCandidatePortalModal = (candidate) => {
        const existingIv = getCandidateInterview(candidate);
        const linkCode = existingIv?.linkCode || candidate.linkCode || "ava" + Math.floor(100 + Math.random() * 900);
        setSelectedPortalCandidate({
            candidate,
            linkCode,
            isExisting: !!existingIv,
            interview: existingIv
        });
    };

    const handleGenerateLinkForCandidate = async (candidate) => {
        const existingIv = getCandidateInterview(candidate);
        if (existingIv) {
            handleOpenCandidatePortalModal(candidate);
            return;
        }
        const newCode = "ava" + Math.floor(100 + Math.random() * 900);
        const dateObj = new Date();
        const formattedDate = dateObj.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric"
        });
        const newIv = {
            id: `iv-${Date.now()}`,
            candidateId: candidate.id,
            resumeId: candidate.id,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone || "",
            avatar: candidate.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150",
            role: candidate.role || "Software Engineer",
            company: "AvaHire Technologies Pvt. Ltd.",
            date: formattedDate,
            dayOfWeek: "Today",
            time: "11:00 AM",
            timeZone: "IST",
            duration: "45 Minutes",
            linkCode: newCode,
            status: "Scheduled",
            expiry: "Not started",
            isExpired: false
        };
        try {
            const created = await interviewsApi.create(newIv);
            setInterviews((prev) => [created || newIv, ...prev]);
            toast.success(`Candidate Portal link generated for ${candidate.name}! (Code: ${newCode})`);
            setSelectedPortalCandidate({
                candidate,
                linkCode: newCode,
                isExisting: true,
                interview: created || newIv
            });
        } catch (err) {
            setInterviews((prev) => [newIv, ...prev]);
            setSelectedPortalCandidate({
                candidate,
                linkCode: newCode,
                isExisting: true,
                interview: newIv
            });
        }
    };

    const parseSafeArray = (val, defaultVal = []) => {
        if (Array.isArray(val)) return val;
        if (typeof val === "string") {
            try {
                const p = JSON.parse(val);
                if (Array.isArray(p)) return p;
            } catch { }
        }
        return defaultVal;
    };

    // Sorting and Filtering (includes JD-matched shortlisted resumes when filtering by a job)
    const filteredCandidates = useMemo(() => {
        const baseList = Array.isArray(candidates) ? candidates : [];
        let combinedList = [...baseList];

        if (jobFilter) {
            const targetJob = jobs.find(
                (j) => j && (j.title || "").toLowerCase() === jobFilter.toLowerCase()
            );
            if (targetJob) {
                const jdMatchedResumes = getMatchingResumesForJob(resumes, targetJob, jobs).map((r) => ({
                    id: r.id,
                    name: r.name,
                    email: r.email,
                    phone: r.phone || "Not specified",
                    avatar:
                        r.avatar ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(r.name || "C")}&background=ede9fe&color=6d28d9`,
                    role: targetJob.title,
                    interviewDate: r.uploadedDate || "Shortlisted via JD",
                    duration: r.experience || "0 Years",
                    mode: `JD Match: ${r.matchScore}%`,
                    score: typeof r.atsScore === "number" ? r.atsScore : (Number(r.atsScore) || 0),
                    status: "Shortlisted",
                    recommendation: r.summary || `Automatically shortlisted for ${targetJob.title} based on JD match.`,
                    summaryPoints: [
                        ...(r.matchedSkills || []).map((sk) => ({
                            type: "good",
                            text: `Matched required JD skill: ${sk}`
                        })),
                        ...(r.missingSkills || []).slice(0, 2).map((sk) => ({
                            type: "warn",
                            text: `Additional skill in JD: ${sk}`
                        }))
                    ],
                    transcript: [],
                    notes: ""
                }));
                // Only show candidates/resumes that match the target job's JD
                combinedList = jdMatchedResumes;
            }
        }

        return combinedList
            .filter((c) => {
                if (!c) return false;
                const statusStr = (c.status || "").toLowerCase();
                if (statusFilter === "All") {
                    // Candidate page default view: omit candidates whose decision has been made (Selected or Rejected)
                    if (statusStr === "selected" || statusStr === "rejected") return false;
                } else if (statusStr !== statusFilter.toLowerCase()) {
                    return false;
                }
                if (jobFilter && !c.role?.toLowerCase().includes(jobFilter.toLowerCase())) return false;
                if (searchQuery && !(
                    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    c.role?.toLowerCase().includes(searchQuery.toLowerCase())
                )) return false;
                return true;
            })
            .sort((a, b) => {
                if (sortBy === "Latest Interview") return (b.timestamp || 0) - (a.timestamp || 0);
                if (sortBy === "Oldest Interview") return (a.timestamp || 0) - (b.timestamp || 0);
                if (sortBy === "Highest Score") return (b.score || 0) - (a.score || 0);
                if (sortBy === "Lowest Score") return (a.score || 0) - (b.score || 0);
                return 0;
            });
    }, [candidates, jobs, resumes, sortBy, statusFilter, jobFilter, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));

    const paginatedCandidates = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredCandidates.slice(startIndex, startIndex + pageSize);
    }, [filteredCandidates, currentPage, pageSize]);

    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, jobFilter, searchQuery, sortBy, pageSize]);

    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const toggleExpandCandidate = (id) => {
        setExpandedCandidateId((prev) => (prev === id ? null : id));
    };

    const handleSelectCandidate = async (id, name, e) => {
        e?.stopPropagation();
        // Immediately remove candidate from the candidate page list
        setCandidates((prev) => (Array.isArray(prev) ? prev.filter((c) => c && c.id !== id) : []));
        setResumes((prev) => (Array.isArray(prev) ? prev.filter((r) => r && r.id !== id) : []));
        if (expandedCandidateId === id) {
            setExpandedCandidateId(null);
        }
        if (playingAudioCandidateId === id) {
            if (audioRef.current) audioRef.current.pause();
            setIsAudioPlaying(false);
            setPlayingAudioCandidateId(null);
        }
        toast.success(`${name} marked as Selected and moved to Reports!`);
        try {
            await candidatesApi.update(id, { status: "Selected" });
        } catch (err) {
            console.error("Failed to sync candidate status:", err);
        }
    };

    const handleRejectCandidate = async (id, name, e) => {
        e?.stopPropagation();
        // Immediately remove candidate from the candidate page list
        setCandidates((prev) => (Array.isArray(prev) ? prev.filter((c) => c && c.id !== id) : []));
        setResumes((prev) => (Array.isArray(prev) ? prev.filter((r) => r && r.id !== id) : []));
        if (expandedCandidateId === id) {
            setExpandedCandidateId(null);
        }
        if (playingAudioCandidateId === id) {
            if (audioRef.current) audioRef.current.pause();
            setIsAudioPlaying(false);
            setPlayingAudioCandidateId(null);
        }
        toast.error(`${name} marked as Rejected and removed from candidates.`);
        try {
            await candidatesApi.update(id, { status: "Rejected" });
        } catch (err) {
            console.error("Failed to sync candidate status:", err);
        }
    };

    const handleSaveNotes = async (candidateId, candidateName) => {
        const text = currentCandidateNotes[candidateId] || "";
        setCandidates((prev) =>
            prev.map((c) => (c.id === candidateId ? { ...c, notes: text } : c))
        );
        toast.success(`Notes saved for ${candidateName}`);
        try {
            await candidatesApi.update(candidateId, { notes: text });
        } catch (err) {
            console.error("Failed to sync candidate notes:", err);
        }
    };

    const handleDownloadTranscript = (candidate, e) => {
        e?.stopPropagation();
        const url = candidatesApi.getTranscriptDownloadUrl(candidate.id);
        const safeName = (candidate.name || "Candidate").replace(/[^a-zA-Z0-9_-]/g, "_");
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}_Interview_Transcript.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`Downloading Word transcript (.docx) for ${candidate.name}...`);
    };

    const handleDownloadRecording = (candidate, e) => {
        e?.stopPropagation();
        const url = candidatesApi.getAudioDownloadUrl(candidate.id);
        const safeName = (candidate.name || "Candidate").replace(/[^a-zA-Z0-9_-]/g, "_");
        const a = document.createElement("a");
        a.href = url;
        a.download = `Interview_Recording_${safeName}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`Downloading interview audio for ${candidate.name}...`);
    };

    const handleDeleteCandidate = async (id, name, e) => {
        e?.stopPropagation();
        let confirmed = true;
        try {
            confirmed = window.confirm(`Are you sure you want to delete ${name}?`);
        } catch (err) {
            confirmed = true;
        }
        if (!confirmed) return;
        try {
            await candidatesApi.delete(id);
            setCandidates((prev) => (Array.isArray(prev) ? prev.filter((c) => c && c.id !== id) : []));
            if (expandedCandidateId === id) {
                setExpandedCandidateId(null);
            }
            toast.success(`${name} removed successfully!`);
        } catch (err) {
            console.error("Failed to delete candidate:", err);
            toast.error("Failed to delete candidate");
        }
    };

    const getScoreColor = (score) => {
        if (score >= 80) return "text-emerald-600";
        if (score >= 70) return "text-emerald-600";
        if (score >= 65) return "text-amber-600";
        return "text-rose-600";
    };

    const getStatusBadge = (status) => {
        if (status === "Selected") {
            return "bg-emerald-50 text-emerald-700 border border-emerald-200/80";
        }
        if (status === "Rejected") {
            return "bg-rose-50 text-rose-600 border border-rose-200/80";
        }
        if (status === "Meeting Terminated" || status === "Terminated") {
            return "bg-rose-100 text-rose-800 border border-rose-300 font-bold";
        }
        return "bg-amber-50 text-amber-700 border border-amber-200/80";
    };

    return (
        <div className="space-y-5 max-w-7xl mx-auto -mt-2" data-testid="interviewed-candidates-page">
            {/* Real Audio Controller (Hidden) */}
            <audio
                ref={audioRef}
                className="hidden"
                preload="metadata"
                onTimeUpdate={() => {
                    const ct = audioRef.current?.currentTime;
                    if (Number.isFinite(ct)) {
                        setAudioCurrentTime(ct);
                    }
                }}
                onLoadedMetadata={() => {
                    const d = audioRef.current?.duration;
                    if (Number.isFinite(d)) {
                        setAudioDuration(d);
                    }
                }}
                onCanPlay={() => {
                    const d = audioRef.current?.duration;
                    if (Number.isFinite(d)) {
                        setAudioDuration(d);
                    }
                }}
                onEnded={() => {
                    setIsAudioPlaying(false);
                    setAudioCurrentTime(0);
                }}
                onError={(e) => {
                    console.warn("Audio element error:", e);
                    setIsAudioPlaying(false);
                }}
            />

            {/* Top Bar / Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                        All Interviewed Candidates
                    </h1>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-700 rounded-lg text-xs font-semibold border border-violet-200 shadow-2xs">
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                        <span>Pipeline Active</span>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Sort Dropdown */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span className="text-slate-400 font-medium whitespace-nowrap">Sort by:</span>
                        <div className="relative">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="appearance-none bg-white border border-slate-200 rounded-xl px-3.5 py-2 pr-8 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer shadow-xs"
                            >
                                <option>Latest Interview</option>
                                <option>Oldest Interview</option>
                                <option>Highest Score</option>
                                <option>Lowest Score</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>

                    {/* Filter Button */}
                    <button
                        onClick={() => setShowFilterModal(true)}
                        className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition shadow-xs cursor-pointer"
                        title="Filters"
                    >
                        <Filter className="w-4 h-4" />
                    </button>

                    {/* Reports Quick Link */}
                    <Link
                        to="/app/reports"
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
                        title="Download Daily Selected Candidates Excel Reports & Audio/Transcripts"
                    >
                        <FileText className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Reports</span>
                    </Link>
                </div>
            </div>

            {/* Active Filters Bar */}
            {(jobFilter || statusFilter !== "All" || searchQuery) && (
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                        {jobFilter && (
                            <span className="px-2.5 py-1 bg-violet-100 text-violet-700 rounded-lg font-bold flex items-center gap-1">
                                Job: {jobFilter}
                                <button onClick={() => setJobFilter("")} className="hover:text-violet-900 cursor-pointer">×</button>
                            </span>
                        )}
                        {statusFilter !== "All" && (
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1">
                                Status: {statusFilter}
                                <button onClick={() => setStatusFilter("All")} className="hover:text-emerald-900 cursor-pointer">×</button>
                            </span>
                        )}
                        <button
                            onClick={() => {
                                setJobFilter("");
                                setStatusFilter("All");
                                setSearchQuery("");
                            }}
                            className="text-slate-400 hover:text-rose-600 font-bold underline"
                        >
                            Reset filters
                        </button>
                    </div>
                </div>
            )}

            {/* Candidates Card List with Downward Opening Transcript Drawer */}
            <div className="space-y-4">
                {filteredCandidates.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 space-y-3 shadow-xs">
                        <Users className="w-12 h-12 mx-auto text-slate-300" />
                        <div>
                            <h3 className="font-bold text-slate-700 text-base">No candidates found</h3>
                            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                No candidate records match your criteria. When candidates participate in technical interviews, their evaluations will appear here.
                            </p>
                        </div>
                    </div>
                ) : (
                    paginatedCandidates.map((candidate, idx) => {
                        const isExpanded = expandedCandidateId === candidate.id;
                        const candidateInterview = getCandidateInterview(candidate);

                        return (
                            <div
                                key={candidate.id ? `${candidate.id}-${idx}` : `cand-${idx}`}
                                data-testid={`candidate-card-${candidate.id}`}
                                className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden shadow-xs ${isExpanded
                                        ? "border-violet-300 shadow-md ring-1 ring-violet-200"
                                        : "border-slate-100 hover:border-slate-200"
                                    }`}
                            >
                                {/* Candidate Header / Summary Row */}
                                <div
                                    onClick={() => toggleExpandCandidate(candidate.id)}
                                    className={`${preferences.compactView ? "p-4 sm:p-4.5" : "p-5 sm:p-6"} flex flex-col lg:flex-row lg:items-center justify-between gap-6 cursor-pointer hover:bg-slate-50/40 transition-colors`}
                                >
                                    {/* Column 1: Candidate Avatar & Contact Info */}
                                    <div className="flex items-center gap-4 min-w-[240px]">
                                        {preferences.showAvatars !== false ? (
                                            <img
                                                src={candidate.avatar}
                                                alt={candidate.name}
                                                className="w-14 h-14 rounded-full object-cover border border-slate-200 shrink-0 shadow-xs"
                                            />
                                        ) : (
                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-xs">
                                                {candidate.name?.slice(0, 2)?.toUpperCase() || "CA"}
                                            </div>
                                        )}
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-bold text-slate-900 leading-snug">
                                                    {candidate.name}
                                                </h3>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                <span className="truncate">{candidate.email}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                <span>{candidate.phone}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 2: Role & Interview Details */}
                                    <div className="space-y-1 min-w-[200px]">
                                        <div className="text-sm font-bold text-slate-900">{candidate.role}</div>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span>{candidate.interviewDate}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span>Duration: {candidate.duration}</span>
                                        </div>
                                        <div className="text-xs font-bold text-violet-600 pt-0.5">
                                            {candidate.mode}
                                        </div>
                                    </div>

                                    {/* Column 3: Score & Status Pill */}
                                    <div className="text-center sm:text-right lg:text-center min-w-[140px] space-y-1.5 self-start lg:self-center">
                                        <div className={`text-2xl font-extrabold tracking-tight ${getScoreColor(candidate.score)}`}>
                                            {candidate.score} <span className="text-sm font-bold text-slate-400">/ 100</span>
                                        </div>
                                        <div>
                                            <span
                                                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(
                                                    candidate.status
                                                )}`}
                                            >
                                                {candidate.status}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Column 4: Candidate Portal + Select & Reject Action Buttons */}
                                    {!isExpanded ? (
                                        <div className="flex flex-col gap-2 min-w-[190px] shrink-0">
                                            {/* Candidate Portal */}
                                            {candidateInterview && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenCandidatePortalModal(candidate);
                                                    }}
                                                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 border border-violet-200/90 text-violet-700 rounded-xl text-xs font-bold transition active:scale-[0.98] shadow-2xs group cursor-pointer"
                                                    title="Candidate Portal Access & Live Link"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5 text-violet-600 group-hover:scale-110 transition-transform" />
                                                    <span>Candidate Portal ({candidateInterview.linkCode})</span>
                                                </button>
                                            )}

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={(e) => handleSelectCandidate(candidate.id, candidate.name, e)}
                                                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-white hover:bg-emerald-50 border border-emerald-500 text-emerald-600 rounded-xl text-xs font-semibold transition active:scale-[0.98] shadow-xs cursor-pointer"
                                                >
                                                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                                                    <span>Select</span>
                                                </button>

                                                <button
                                                    onClick={(e) => handleRejectCandidate(candidate.id, candidate.name, e)}
                                                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-white hover:bg-rose-50 border border-rose-400 text-rose-500 rounded-xl text-xs font-semibold transition active:scale-[0.98] shadow-xs cursor-pointer"
                                                >
                                                    <X className="w-3.5 h-3.5 text-rose-500 stroke-[2.5]" />
                                                    <span>Reject</span>
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-end gap-2 min-w-[190px] shrink-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenCandidatePortalModal(candidate);
                                                }}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 font-mono text-xs font-bold border border-violet-200/80 transition shadow-2xs cursor-pointer"
                                                title="View Candidate Portal Link"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5 text-violet-600" />
                                                <span>Portal: /i/{candidateInterview?.linkCode || "portal"}</span>
                                            </button>
                                            <div className="flex items-center gap-2 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-4 py-2 rounded-xl transition">
                                                <span>Hide Transcript</span>
                                                <ChevronUp className="w-4 h-4" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* DOWNWARD EXPANDED DRAWER: Interview Transcript, Evaluation, Scores, and Audio Player */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/50 p-6 sm:p-8 space-y-6 animate-in slide-in-from-top-4 duration-300">
                                        {/* Tabs Switcher */}
                                        <div className="flex items-center gap-6 border-b border-slate-200 text-xs sm:text-sm font-semibold pb-1">
                                            {[
                                                { id: "transcript", label: "Interview Transcript" },
                                                { id: "evaluation", label: "AI Evaluation" },
                                                { id: "scores", label: "Scores" }
                                            ].map((tab) => {
                                                const isActive = drawerTab === tab.id;
                                                return (
                                                    <button
                                                        key={tab.id}
                                                        onClick={() => setDrawerTab(tab.id)}
                                                        className={`pb-2.5 whitespace-nowrap transition relative ${isActive
                                                                ? "text-violet-600 font-bold"
                                                                : "text-slate-500 hover:text-slate-800"
                                                            }`}
                                                    >
                                                        {tab.label}
                                                        {isActive && (
                                                            <span className="absolute bottom-0 left-0 w-full h-[2.5px] bg-violet-600 rounded-full" />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* TAB 1: Interview Transcript (2 Columns matching image) */}
                                        {drawerTab === "transcript" && (
                                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                                {/* LEFT COLUMN: Transcript Thread + Audio Player (8 Cols) */}
                                                <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-100 p-6 space-y-6 shadow-xs">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-sm font-bold text-slate-900">
                                                            Interview Transcript
                                                        </h4>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={(e) => handleDownloadTranscript(candidate, e)}
                                                                className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-xl transition cursor-pointer"
                                                                title="Download Word Document (.docx) transcript"
                                                            >
                                                                <FileText className="w-3.5 h-3.5" />
                                                                <span>Download Transcript (.docx)</span>
                                                            </button>
                                                            <button
                                                                onClick={(e) => handleDownloadRecording(candidate, e)}
                                                                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition cursor-pointer"
                                                                title="Download audio recording (.webm)"
                                                            >
                                                                <Volume2 className="w-3.5 h-3.5" />
                                                                <span>Download Audio</span>
                                                            </button>
                                                            <button
                                                                onClick={(e) => handleDeleteCandidate(candidate.id, candidate.name, e)}
                                                                className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition cursor-pointer"
                                                                title="Delete candidate"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                <span>Delete</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Transcript Dialogue Items */}
                                                    <div className="space-y-4 max-h-[480px] overflow-y-auto pr-2">
                                                        {parseSafeArray(candidate.transcript).map((msg, idx) => {
                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100/80 hover:bg-slate-50 transition"
                                                                >
                                                                    <img
                                                                        src={msg.isAI ? "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100" : candidate.avatar}
                                                                        alt={msg.speaker}
                                                                        className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0 mt-0.5"
                                                                    />
                                                                    <div className="flex-1 min-w-0 space-y-1">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-xs font-bold text-violet-700">
                                                                                {msg.speaker}
                                                                            </span>
                                                                            <span className="text-[11px] text-slate-400 font-mono">
                                                                                {msg.time}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                                                                            {msg.text}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Bottom Audio Player Bar */}
                                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4 text-xs">
                                                        <button
                                                            onClick={() => handleTogglePlayAudio(candidate)}
                                                            className="w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shrink-0 shadow-xs transition cursor-pointer"
                                                            title={playingAudioCandidateId === candidate.id && isAudioPlaying ? "Pause Audio" : "Play Recorded Interview Audio"}
                                                        >
                                                            {playingAudioCandidateId === candidate.id && isAudioPlaying ? (
                                                                <Pause className="w-3.5 h-3.5" />
                                                            ) : (
                                                                <Play className="w-3.5 h-3.5 ml-0.5" />
                                                            )}
                                                        </button>
                                                        <span className="text-slate-500 font-mono text-[11px] shrink-0">
                                                            {playingAudioCandidateId === candidate.id ? formatAudioTime(audioCurrentTime) : "00:00"} / {candidate.duration || (audioDuration ? formatAudioTime(audioDuration) : "16m 45s")}
                                                        </span>

                                                        {/* Progress Scrubber */}
                                                        <div
                                                            onClick={(e) => handleSeekAudio(e, candidate)}
                                                            className={`flex-1 relative flex items-center py-1 group ${playingAudioCandidateId === candidate.id ? "cursor-pointer" : "cursor-default opacity-60"}`}
                                                            title={playingAudioCandidateId === candidate.id ? "Click to seek audio" : "Play audio to seek"}
                                                        >
                                                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-violet-600 rounded-full transition-all"
                                                                    style={{
                                                                        width: `${playingAudioCandidateId === candidate.id && audioDuration > 0 ? Math.min(100, Math.max(0, (audioCurrentTime / audioDuration) * 100)) : 0}%`
                                                                    }}
                                                                />
                                                            </div>
                                                            <div
                                                                className="w-3 h-3 bg-violet-600 rounded-full absolute -top-0.5 shadow-xs transition-all opacity-0 group-hover:opacity-100"
                                                                style={{
                                                                    left: `${playingAudioCandidateId === candidate.id && audioDuration > 0 ? Math.min(100, Math.max(0, (audioCurrentTime / audioDuration) * 100)) : 0}%`
                                                                }}
                                                            />
                                                        </div>

                                                        <button
                                                            onClick={handleMuteToggle}
                                                            className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
                                                            title={isMuted ? "Unmute" : "Mute"}
                                                        >
                                                            {isMuted ? (
                                                                <VolumeX className="w-4 h-4 text-rose-500" />
                                                            ) : (
                                                                <Volume2 className="w-4 h-4" />
                                                            )}
                                                        </button>

                                                        <button
                                                            onClick={handleSpeedChange}
                                                            className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition text-[11px] cursor-pointer"
                                                            title="Playback speed"
                                                        >
                                                            {playbackSpeed}
                                                        </button>

                                                        <button
                                                            onClick={(e) => handleDownloadRecording(candidate, e)}
                                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold transition text-[11px] cursor-pointer shadow-2xs"
                                                            title="Save Interview Audio Recording to computer"
                                                        >
                                                            <Download className="w-3 h-3 text-slate-500" />
                                                            <span>Save Audio</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* RIGHT COLUMN: AI Summary, Recommendation, HR Decision, Notes (4 Cols) */}
                                                <div className="lg:col-span-4 space-y-4">
                                                    {/* AI Summary Card */}
                                                    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3 shadow-xs">
                                                        <h4 className="text-sm font-bold text-slate-900">AI Summary</h4>
                                                        <div className="space-y-2 text-xs">
                                                            {parseSafeArray(candidate.summaryPoints).map((pt, i) => (
                                                                <div key={i} className="flex items-start gap-2">
                                                                    {pt.type === "good" ? (
                                                                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                                                    ) : (
                                                                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                                                    )}
                                                                    <span className={pt.type === "good" ? "text-slate-700 font-medium" : "text-amber-800 font-medium"}>
                                                                        {pt.text}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Recommendation Card */}
                                                    <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 space-y-1.5">
                                                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                                                            <Star className="w-4 h-4 fill-emerald-600 text-emerald-600" />
                                                            <span>Recommendation</span>
                                                        </div>
                                                        <p className="text-xs text-emerald-900 font-medium leading-relaxed">
                                                            {candidate.recommendation}
                                                        </p>
                                                    </div>

                                                    {/* Candidate Portal Access Card */}
                                                    <div className="bg-violet-50/80 border border-violet-200/90 rounded-2xl p-4 space-y-2.5 shadow-2xs">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="font-bold text-violet-900 flex items-center gap-1.5">
                                                                <ExternalLink className="w-3.5 h-3.5 text-violet-600" />
                                                                <span>Candidate Portal Access</span>
                                                            </span>
                                                            <span className="font-mono text-[11px] bg-white text-violet-700 font-bold px-2 py-0.5 rounded-md border border-violet-200">
                                                                Code: {candidateInterview?.linkCode || candidate.linkCode || "ava318"}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="text"
                                                                readOnly
                                                                value={`${window.location.origin}/i/${candidateInterview?.linkCode || candidate.linkCode || "ava318"}`}
                                                                className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 select-all font-semibold"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyPortalLink(candidateInterview?.linkCode || candidate.linkCode || "ava318")}
                                                                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1 transition shadow-2xs cursor-pointer"
                                                                title="Copy Candidate Portal Link"
                                                            >
                                                                <Copy className="w-3.5 h-3.5" />
                                                                <span>Copy</span>
                                                            </button>
                                                        </div>

                                                        <div className="flex items-center gap-2 pt-1">
                                                            <a
                                                                href={`/i/${candidateInterview?.linkCode || candidate.linkCode || "ava318"}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-2xs"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                                <span>Open Portal</span>
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleGenerateLinkForCandidate(candidate)}
                                                                className="px-3 py-2 border border-violet-300 bg-white hover:bg-violet-50 text-violet-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                                                title="Generate or Refresh Candidate Link"
                                                            >
                                                                <Sparkles className="w-3.5 h-3.5" />
                                                                <span>New Link</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* HR Decision Card */}
                                                    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3 shadow-xs">
                                                        <h4 className="text-sm font-bold text-slate-900">HR Decision</h4>
                                                        <div className="space-y-2">
                                                            <button
                                                                onClick={(e) => handleSelectCandidate(candidate.id, candidate.name, e)}
                                                                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition border ${candidate.status === "Selected"
                                                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                                                        : "bg-white hover:bg-emerald-50 border-emerald-500 text-emerald-600"
                                                                    }`}
                                                            >
                                                                <Check className="w-4 h-4 stroke-[2.5]" />
                                                                <span>Select Candidate</span>
                                                            </button>

                                                            <button
                                                                onClick={(e) => handleRejectCandidate(candidate.id, candidate.name, e)}
                                                                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition border ${candidate.status === "Rejected"
                                                                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                                                                        : "bg-white hover:bg-rose-50 border-rose-400 text-rose-500"
                                                                    }`}
                                                            >
                                                                <X className="w-4 h-4 stroke-[2.5]" />
                                                                <span>Reject Candidate</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Add Notes Box */}
                                                    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3 shadow-xs">
                                                        <label className="text-xs font-bold text-slate-700 block">
                                                            Add Notes
                                                        </label>
                                                        <textarea
                                                            rows="3"
                                                            placeholder="Write your notes about this candidate..."
                                                            value={currentCandidateNotes[candidate.id] ?? candidate.notes}
                                                            onChange={(e) =>
                                                                setCurrentCandidateNotes({
                                                                    ...currentCandidateNotes,
                                                                    [candidate.id]: e.target.value
                                                                })
                                                            }
                                                            className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-violet-500 transition resize-none leading-relaxed"
                                                        />
                                                        <button
                                                            onClick={() => handleSaveNotes(candidate.id, candidate.name)}
                                                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-violet-500/20 transition active:scale-[0.98]"
                                                        >
                                                            <Save className="w-3.5 h-3.5" />
                                                            <span>Save Notes</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* TAB 2: AI Evaluation */}
                                        {drawerTab === "evaluation" && (
                                            <div className="space-y-6 animate-in fade-in">
                                                {/* Competency Overview based on 5-Parameter Rubric */}
                                                <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4 shadow-xs">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-sm font-bold text-slate-900">5-Parameter Competency Rubric</h4>
                                                        <span className="text-xs font-semibold px-2.5 py-1 bg-violet-50 text-violet-700 rounded-lg border border-violet-100">
                                                            Evaluated with Gemini AI
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                                        {(parseSafeArray(candidate.evaluationBreakdown).length > 0
                                                            ? parseSafeArray(candidate.evaluationBreakdown)
                                                            : [
                                                                { category: "Technical Correctness", score: candidate.accuracyScore || candidate.score || 85, weight: "40%" },
                                                                { category: "Completeness", score: Math.round((candidate.score || 80) * 0.95), weight: "25%" },
                                                                { category: "Relevance", score: Math.min(100, Math.round((candidate.score || 80) * 1.05)), weight: "15%" },
                                                                { category: "Problem-Solving & Reasoning", score: Math.round((candidate.score || 80) * 0.92), weight: "15%" },
                                                                { category: "Communication Clarity", score: candidate.confidenceScore || 80, weight: "5%" }
                                                            ]
                                                        ).map((item, idx) => (
                                                            <div key={idx} className="p-3.5 bg-slate-50 rounded-xl space-y-2 border border-slate-100/80">
                                                                <div className="flex justify-between items-center text-xs">
                                                                    <span className="font-bold text-slate-800">{item.category}</span>
                                                                    <span className="font-extrabold text-violet-600">{item.score}/100</span>
                                                                </div>
                                                                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-violet-600 rounded-full transition-all"
                                                                        style={{ width: `${item.score}%` }}
                                                                    />
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 font-medium">Weight: {item.weight}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Per-Question AI Evaluation Cards */}
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-sm font-bold text-slate-900">
                                                            Per-Question Answer Evaluation & Feedback
                                                        </h4>
                                                        <span className="text-xs text-slate-400">
                                                            Semantic meaning & correctness evaluation
                                                        </span>
                                                    </div>

                                                    {(() => {
                                                        const qas = parseSafeArray(candidate.questionEvaluations || candidate.qaEvaluations || candidate.question_evaluations);
                                                        if (qas.length === 0) {
                                                            return (
                                                                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-400">
                                                                    Per-question evaluations will be generated dynamically as candidates complete real-time interview questions.
                                                                </div>
                                                            );
                                                        }

                                                        return qas.map((qa, qIdx) => {
                                                            const indScores = qa.individual_scores || {
                                                                technical_correctness: qa.accuracyScore || 80,
                                                                completeness: 75,
                                                                relevance: 85,
                                                                problem_solving: 80,
                                                                communication_clarity: qa.confidenceScore || 85
                                                            };
                                                            const totalScore = qa.total_score !== undefined ? qa.total_score : (qa.accuracyScore || 80);

                                                            return (
                                                                <div key={qIdx} className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-xs">
                                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-6 h-6 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">
                                                                                {qa.questionIndex || qIdx + 1}
                                                                            </span>
                                                                            <h5 className="text-xs sm:text-sm font-bold text-slate-900">
                                                                                {qa.question}
                                                                            </h5>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${totalScore >= 75 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : (totalScore >= 50 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-rose-50 text-rose-700 border border-rose-200")}`}>
                                                                                Score: {totalScore}/100
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Candidate Answer Excerpt */}
                                                                    <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed">
                                                                        <span className="font-bold text-violet-700 mr-1.5">Candidate Response:</span>
                                                                        {qa.answer || "No response recorded."}
                                                                    </div>

                                                                    {/* 5-part Rubric Pills */}
                                                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                                                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                            <div className="text-slate-400 text-[10px]">Tech Correctness (40%)</div>
                                                                            <div className="font-bold text-slate-800">{indScores.technical_correctness ?? indScores.technicalCorrectness ?? 0}/100</div>
                                                                        </div>
                                                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                            <div className="text-slate-400 text-[10px]">Completeness (25%)</div>
                                                                            <div className="font-bold text-slate-800">{indScores.completeness ?? 0}/100</div>
                                                                        </div>
                                                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                            <div className="text-slate-400 text-[10px]">Relevance (15%)</div>
                                                                            <div className="font-bold text-slate-800">{indScores.relevance ?? 0}/100</div>
                                                                        </div>
                                                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                            <div className="text-slate-400 text-[10px]">Problem Solving (15%)</div>
                                                                            <div className="font-bold text-slate-800">{indScores.problem_solving ?? indScores.problemSolving ?? 0}/100</div>
                                                                        </div>
                                                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                            <div className="text-slate-400 text-[10px]">Clarity (5%)</div>
                                                                            <div className="font-bold text-slate-800">{indScores.communication_clarity ?? indScores.communicationClarity ?? 0}/100</div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Matched Points & Missing Points */}
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                                                        {/* Matched Points */}
                                                                        <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/80 space-y-1.5">
                                                                            <div className="flex items-center gap-1.5 font-bold text-emerald-800 text-[11px]">
                                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                                                <span>Matched Concepts & Strengths</span>
                                                                            </div>
                                                                            <ul className="space-y-1 pl-4 list-disc text-[11px] text-emerald-900">
                                                                                {parseSafeArray(qa.matched_points).length > 0 ? (
                                                                                    parseSafeArray(qa.matched_points).map((mp, mi) => (
                                                                                        <li key={mi}>{mp}</li>
                                                                                    ))
                                                                                ) : (
                                                                                    <li>Provided direct response to prompt.</li>
                                                                                )}
                                                                            </ul>
                                                                        </div>

                                                                        {/* Missing Points */}
                                                                        <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100/80 space-y-1.5">
                                                                            <div className="flex items-center gap-1.5 font-bold text-amber-800 text-[11px]">
                                                                                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                                                                <span>Missing Points & Areas to Deepen</span>
                                                                            </div>
                                                                            <ul className="space-y-1 pl-4 list-disc text-[11px] text-amber-900">
                                                                                {parseSafeArray(qa.missing_points).length > 0 ? (
                                                                                    parseSafeArray(qa.missing_points).map((mp, mi) => (
                                                                                        <li key={mi}>{mp}</li>
                                                                                    ))
                                                                                ) : (
                                                                                    <li>No major technical gaps detected.</li>
                                                                                )}
                                                                            </ul>
                                                                        </div>
                                                                    </div>

                                                                    {/* Feedback */}
                                                                    {qa.feedback && (
                                                                        <div className="p-3 bg-violet-50/40 rounded-xl border border-violet-100/60 text-xs text-violet-900">
                                                                            <span className="font-bold mr-1">Evaluator Feedback:</span>
                                                                            {qa.feedback}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </div>
                                        )}

                                        {/* TAB 3: Scores */}
                                        {drawerTab === "scores" && (
                                            <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-6 shadow-xs animate-in fade-in">
                                                <h4 className="text-sm font-bold text-slate-900">Assessment Breakdown & Summary</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div className="p-6 bg-violet-50/50 border border-violet-100 rounded-2xl text-center space-y-2 flex flex-col justify-center items-center">
                                                        <div className="text-xs text-slate-500 font-semibold">Cumulative Interview Score</div>
                                                        <div className={`text-4xl font-extrabold ${getScoreColor(candidate.score)}`}>
                                                            {candidate.score} <span className="text-base text-slate-400">/ 100</span>
                                                        </div>
                                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${getStatusBadge(candidate.status)}`}>
                                                            {candidate.status}
                                                        </span>
                                                    </div>

                                                    <div className="md:col-span-2 p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                                        <h5 className="text-xs font-bold text-slate-800">Scoring Methodology</h5>
                                                        <p className="text-xs text-slate-600 leading-relaxed">
                                                            Candidate responses are evaluated by Google AI Studio / Gemini using a 5-parameter rubric without requiring rigid keyword matching:
                                                        </p>
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div className="flex items-center gap-1.5 text-slate-700">
                                                                <span className="w-2 h-2 rounded-full bg-violet-600" />
                                                                <span>Technical Correctness: <strong>40%</strong></span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-slate-700">
                                                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                                                <span>Completeness: <strong>25%</strong></span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-slate-700">
                                                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                                                <span>Relevance: <strong>15%</strong></span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-slate-700">
                                                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                                                <span>Problem-Solving: <strong>15%</strong></span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-slate-700">
                                                                <span className="w-2 h-2 rounded-full bg-pink-500" />
                                                                <span>Communication Clarity: <strong>5%</strong></span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    }))}
            </div>

            {/* Pagination Footer */}
            <div className="flex flex-wrap items-center justify-center sm:justify-between gap-4 pt-4 pb-2 text-xs text-slate-500">
                <div className="flex items-center gap-1.5 mx-auto sm:mx-0">
                    <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-white text-slate-600 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        title="Previous Page"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                        .reduce((acc, p, idx, arr) => {
                            if (idx > 0 && p - arr[idx - 1] > 1) {
                                acc.push("...");
                            }
                            acc.push(p);
                            return acc;
                        }, [])
                        .map((p, idx) =>
                            p === "..." ? (
                                <span key={`dots-${idx}`} className="px-1 text-slate-400">...</span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => setCurrentPage(p)}
                                    className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center transition cursor-pointer ${
                                        currentPage === p
                                            ? "bg-violet-50 text-violet-700 border border-violet-200 shadow-xs"
                                            : "hover:bg-white text-slate-600 border border-transparent"
                                    }`}
                                >
                                    {p}
                                </button>
                            )
                        )}

                    <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-white text-slate-600 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        title="Next Page"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-slate-500">Show</span>
                    <div className="relative">
                        <select
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-7 font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer shadow-xs"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <span className="text-slate-500">per page</span>
                </div>
            </div>

            {/* Filter Modal */}
            {showFilterModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900 text-sm">Filter Candidates</h3>
                            <button
                                onClick={() => setShowFilterModal(false)}
                                className="p-1 text-slate-400 hover:text-slate-700"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">Status</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500"
                                >
                                    <option value="All">All Statuses</option>
                                    <option value="Under Review">Under Review</option>
                                    <option value="Selected">Selected</option>
                                    <option value="Rejected">Rejected</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <button
                                onClick={() => {
                                    setStatusFilter("All");
                                }}
                                className="text-xs text-violet-600 font-semibold hover:underline"
                            >
                                Reset Filter
                            </button>
                            <button
                                onClick={() => setShowFilterModal(false)}
                                className="px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Candidate Portal Modal */}
            {selectedPortalCandidate && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-base">Candidate Portal Access</h3>
                                    <p className="text-xs text-slate-500">Live AI Interview Session &amp; Assessment Link</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedPortalCandidate(null)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Candidate Summary */}
                        <div className="flex items-center gap-3.5 p-4 bg-slate-50 rounded-2xl">
                            <img
                                src={selectedPortalCandidate.candidate.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150"}
                                alt={selectedPortalCandidate.candidate.name}
                                className="w-12 h-12 rounded-full object-cover border border-slate-200"
                            />
                            <div className="space-y-0.5">
                                <h4 className="font-bold text-slate-900 text-sm">{selectedPortalCandidate.candidate.name}</h4>
                                <div className="text-xs text-slate-500 flex items-center gap-2">
                                    <span>{selectedPortalCandidate.candidate.role}</span>
                                    <span>•</span>
                                    <span className="font-mono text-slate-700">{selectedPortalCandidate.candidate.email}</span>
                                </div>
                                {selectedPortalCandidate.candidate.phone && (
                                    <p className="text-[11px] font-mono text-violet-700">Phone: {selectedPortalCandidate.candidate.phone}</p>
                                )}
                            </div>
                        </div>

                        {/* Candidate Portal URL Box */}
                        <div className="p-4 bg-violet-50/80 border border-violet-200 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-violet-900 flex items-center gap-1.5">
                                    <ExternalLink className="w-3.5 h-3.5 text-violet-600" />
                                    <span>Candidate Portal Access URL</span>
                                </span>
                                <span className="font-mono text-[11px] bg-white text-violet-700 font-bold px-2 py-0.5 rounded-md border border-violet-200">
                                    Code: {selectedPortalCandidate.linkCode}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={`${window.location.origin}/i/${selectedPortalCandidate.linkCode}`}
                                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 select-all font-semibold"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleCopyPortalLink(selectedPortalCandidate.linkCode)}
                                    className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition shadow-2xs cursor-pointer shrink-0"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>{copiedPortalId === selectedPortalCandidate.linkCode ? "Copied!" : "Copy"}</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] border-t border-violet-100">
                                <div>
                                    <span className="text-slate-400 block">Candidate Login Email:</span>
                                    <span className="font-semibold text-slate-800 truncate block">{selectedPortalCandidate.candidate.email}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block">Phone Verification:</span>
                                    <span className="font-semibold font-mono text-violet-700 block">{selectedPortalCandidate.candidate.phone || "Required at login"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-2 pt-1">
                            <a
                                href={`/i/${selectedPortalCandidate.linkCode}`}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-violet-500/25 transition active:scale-[0.98]"
                            >
                                <ExternalLink className="w-4 h-4" />
                                <span>Open Candidate Portal (Live AI Interview)</span>
                            </a>

                            <div className="grid grid-cols-2 gap-2.5">
                                <Link
                                    to={`/app/email?candidateEmail=${encodeURIComponent(selectedPortalCandidate.candidate.email || "")}&interviewCode=${selectedPortalCandidate.linkCode}&role=${encodeURIComponent(selectedPortalCandidate.candidate.role || "")}`}
                                    className="py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center gap-1.5 transition text-center"
                                >
                                    <Mail className="w-3.5 h-3.5" />
                                    <span>Email Candidate</span>
                                </Link>

                                <button
                                    type="button"
                                    onClick={() => handleGenerateLinkForCandidate(selectedPortalCandidate.candidate)}
                                    className="py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition text-center cursor-pointer"
                                >
                                    <RotateCw className="w-3.5 h-3.5" />
                                    <span>Regenerate Code</span>
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setSelectedPortalCandidate(null)}
                                className="w-full py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition cursor-pointer"
                            >
                                Done / Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Candidates;
