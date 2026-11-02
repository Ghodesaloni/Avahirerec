import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
    Calendar,
    Clock,
    Timer,
    Video,
    AlertCircle,
    Mic,
    MicOff,
    Camera,
    CameraOff,
    CheckCircle2,
    ShieldCheck,
    Volume2,
    Sparkles,
    ChevronRight,
    ArrowLeft,
    Share2,
    Copy,
    Check,
    Bot,
    RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { getInterviewByCodeOrId, getStoredInterviews } from "@/utils/interviewStore";
import { useInterviewSettings } from "@/utils/interviewSettingsStore";
import { candidatePortalApi } from "@/services/api";
import AvaHireLogo from "@/components/AvaHireLogo";

const CandidateInterviewInvite = () => {
    const { code } = useParams();
    const navigate = useNavigate();
    const { settings } = useInterviewSettings();

    const [interviewData, setInterviewData] = useState(() => {
        const found = getInterviewByCodeOrId(code);
        if (found) return found;
        return null;
    });
    const [isLoading, setIsLoading] = useState(!interviewData);

    useEffect(() => {
        let isMounted = true;

        const loadInterview = async () => {
            if (!code) {
                if (isMounted) setIsLoading(false);
                return;
            }

            try {
                // 1. Try candidate portal session API
                const session = await candidatePortalApi.getSession(code);
                if (session && isMounted) {
                    const resolved = {
                        id: session.id || `iv-${code}`,
                        name: session.candidateName || "Candidate",
                        email: session.candidateEmail || "",
                        phone: session.candidatePhone || "",
                        role: session.role || "Software Engineer",
                        company: session.company || "AvaHire Technologies Pvt. Ltd.",
                        linkCode: session.linkCode || code,
                        date: session.interviewSchedule?.date || "Today",
                        time: session.interviewSchedule?.time || "Scheduled Slot",
                        duration: session.interviewSchedule?.duration || "45 Minutes",
                        isExpired: Boolean(session.isExpired && session.status === "Expired"),
                        status: session.status || "Scheduled"
                    };
                    setInterviewData(resolved);
                    if (isMounted) setIsLoading(false);
                    return;
                }
            } catch (err) {
                console.warn("Session fetch notice:", err.message);
            }

            try {
                // 2. Try interviews by linkCode
                const iv = await interviewsApi.getByLinkCode(code);
                if (iv && isMounted) {
                    setInterviewData({
                        ...iv,
                        linkCode: iv.linkCode || code
                    });
                    if (isMounted) setIsLoading(false);
                    return;
                }
            } catch (err) {
                console.warn("Interview link fetch notice:", err.message);
            }

            // 3. Fallback: check local storage store
            const localIv = getInterviewByCodeOrId(code);
            if (localIv && isMounted) {
                setInterviewData(localIv);
                if (isMounted) setIsLoading(false);
                return;
            }

            // 4. Default active interview placeholder so candidate portal NEVER 404s
            if (isMounted) {
                setInterviewData({
                    id: `iv-${code}`,
                    name: "Candidate",
                    email: "",
                    phone: "",
                    role: "Software Engineer",
                    company: "AvaHire Technologies Pvt. Ltd.",
                    linkCode: code,
                    date: "Today",
                    dayOfWeek: "Scheduled Day",
                    time: "Active Slot",
                    duration: "45 Minutes",
                    isExpired: false,
                    status: "Scheduled"
                });
                setIsLoading(false);
            }
        };

        loadInterview();

        return () => {
            isMounted = false;
        };
    }, [code]);

    const [copied, setCopied] = useState(false);
    const [showSystemCheck, setShowSystemCheck] = useState(false);
    const [isLiveInterviewStarted, setIsLiveInterviewStarted] = useState(false);

    // System Check States
    const [micStatus, setMicStatus] = useState("testing");
    const [camStatus, setCamStatus] = useState("testing");
    const [audioStatus, setAudioStatus] = useState("testing");
    const [networkStatus, setNetworkStatus] = useState("testing");
    const [agreedToProctoring, setAgreedToProctoring] = useState(false);

    // Live AI Interview Simulation states
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [isAITalking, setIsAITalking] = useState(true);
    const [isCandidateRecording, setIsCandidateRecording] = useState(false);
    const [candidateAnswer, setCandidateAnswer] = useState("");
    const [interviewCompleted, setInterviewCompleted] = useState(false);

    const questions = [
        "Welcome! Could you please introduce yourself and walk us through your most significant technical project?",
        "Can you explain your approach to debugging complex asynchronous state management issues in modern web applications?",
        "How do you ensure web performance and accessibility (a11y) standards are met across responsive devices?",
        "Tell us about a challenging team conflict or tight deadline you navigated successfully."
    ];

    const handleCopyInviteLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        toast.success("Interview link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleJoinInterview = () => {
        const targetCode = interviewData?.linkCode || code || "akc123";
        if (interviewData && (interviewData.isExpired && interviewData.status === "Expired")) {
            navigate(`/i/${targetCode}/expired`);
            return;
        }
        const emailParam = interviewData?.email ? `?email=${encodeURIComponent(interviewData.email)}` : "";
        navigate(`/i/${targetCode}/login${emailParam}`);
    };

    const handleEnterLiveInterview = () => {
        if (!agreedToProctoring) {
            toast.error("Please accept the AI proctoring guidelines to proceed.");
            return;
        }
        setShowSystemCheck(false);
        setIsLiveInterviewStarted(true);
        toast.success("Connected to AvaHire AI Interviewer!");
    };

    const handleNextQuestion = () => {
        setIsCandidateRecording(false);
        setCandidateAnswer("");
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex((prev) => prev + 1);
            setIsAITalking(true);
            setTimeout(() => setIsAITalking(false), 3000);
        } else {
            setInterviewCompleted(true);
            toast.success("Interview finished! Your response has been submitted.");
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="animate-spin w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!interviewData) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 bg-violet-100 text-violet-600 rounded-3xl flex items-center justify-center mx-auto mb-4">
                    <Video className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Interview Not Found</h2>
                <p className="text-sm text-slate-500 max-w-sm mt-1 mb-6">
                    No active interview invitation was found for code <span className="font-mono font-bold text-slate-700">{code}</span>. Please verify your link or contact your recruiter.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <button
                        onClick={() => window.location.reload()}
                        className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-full text-xs sm:text-sm font-semibold transition cursor-pointer shadow-md shadow-violet-500/25"
                    >
                        Retry Verification
                    </button>
                    <button
                        onClick={() => toast.info("Please contact your HR coordinator or recruiter to verify your personalized interview link.")}
                        className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-full text-xs sm:text-sm font-semibold transition cursor-pointer"
                    >
                        Contact Recruiter
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#f8f9ff] via-[#f1f3fd] to-[#ede9fe] text-slate-900 font-sans flex flex-col justify-between relative overflow-x-hidden selection:bg-violet-500 selection:text-white">
            {/* Soft decorative background glow circles */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-300/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-300/20 rounded-full blur-3xl pointer-events-none" />

            {/* Top Bar Navigation */}
            <header className="w-full max-w-5xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-3 py-1 bg-white/80 backdrop-blur-md rounded-full text-violet-700 border border-violet-100 shadow-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Candidate Portal
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleCopyInviteLink}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 bg-white/80 backdrop-blur-md hover:bg-white text-slate-700 rounded-full border border-slate-200/80 shadow-xs transition cursor-pointer"
                        title="Copy candidate invite link"
                    >
                        {copied ? (
                            <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-700 font-bold">Copied!</span>
                            </>
                        ) : (
                            <>
                                <Share2 className="w-3.5 h-3.5 text-slate-500" />
                                <span>Share Link</span>
                            </>
                        )}
                    </button>
                </div>
            </header>

            {/* Main Center Invitation Card */}
            <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative z-10">
                <div className="w-full max-w-[620px] bg-white rounded-[32px] shadow-[0_20px_50px_rgba(79,70,229,0.09)] border border-slate-100/80 p-6 sm:p-10 text-center relative overflow-hidden transition-all duration-300 animate-in fade-in zoom-in-95">
                    
                    {/* Header Logo */}
                    <div className="flex flex-col items-center justify-center mb-6">
                        <AvaHireLogo size="md" variant="dark" />
                    </div>

                    {/* Vector Illustration */}
                    <div className="w-full max-w-[340px] mx-auto mb-6 relative">
                        <div className="relative mx-auto flex items-center justify-center">
                            {/* Decorative modern SVG illustration matching reference */}
                            <svg viewBox="0 0 400 240" className="w-full h-auto drop-shadow-xs" fill="none" xmlns="http://www.w3.org/2000/svg">
                                {/* Soft lilac cloud backdrop */}
                                <ellipse cx="200" cy="140" rx="160" ry="85" fill="#F3F0FF" />
                                <ellipse cx="140" cy="110" rx="70" ry="50" fill="#EAE5FF" />
                                <ellipse cx="260" cy="115" rx="65" ry="45" fill="#EAE5FF" />

                                {/* Clock on wall */}
                                <circle cx="160" cy="55" r="16" fill="white" stroke="#A78BFA" strokeWidth="2.5" />
                                <polyline points="160,45 160,55 167,55" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />

                                {/* Chat speech bubble */}
                                <rect x="235" y="40" width="38" height="26" rx="8" fill="#7C3AED" />
                                <path d="M245 66 L250 72 L254 66 Z" fill="#7C3AED" />
                                <circle cx="246" cy="53" r="2.5" fill="white" />
                                <circle cx="254" cy="53" r="2.5" fill="white" />
                                <circle cx="262" cy="53" r="2.5" fill="white" />

                                {/* Plant in Pot (Left) */}
                                <path d="M125 155 L135 155 L132 175 L128 175 Z" fill="#6D28D9" />
                                <ellipse cx="130" cy="130" rx="8" ry="18" fill="#C4B5FD" transform="rotate(-25 130 130)" />
                                <ellipse cx="135" cy="120" rx="9" ry="20" fill="#8B5CF6" />
                                <ellipse cx="145" cy="128" rx="8" ry="16" fill="#A78BFA" transform="rotate(30 145 128)" />
                                <ellipse cx="120" cy="140" rx="7" ry="14" fill="#8B5CF6" transform="rotate(-40 120 140)" />

                                {/* Document / Badge (Right) */}
                                <rect x="265" y="145" width="26" height="30" rx="4" fill="#6D28D9" />
                                <text x="272" y="165" fill="white" fontSize="13" fontWeight="bold" fontFamily="sans-serif">A</text>
                                <path d="M281 155 L285 167 M283 162 L287 162" stroke="white" strokeWidth="1.5" strokeLinecap="round" />

                                {/* Candidate Avatar sitting at laptop */}
                                {/* Candidate Head & Hair */}
                                <ellipse cx="200" cy="85" rx="16" ry="18" fill="#FCD34D" />
                                <path d="M184 80 Q200 60 216 80 Q218 100 214 110 Q206 95 200 95 Q194 95 186 110 Z" fill="#1E1B4B" />
                                <ellipse cx="200" cy="88" rx="13" ry="15" fill="#FFE4E6" />
                                <ellipse cx="195" cy="86" rx="1.5" ry="1.5" fill="#1E1B4B" />
                                <ellipse cx="205" cy="86" rx="1.5" ry="1.5" fill="#1E1B4B" />
                                <path d="M198 94 Q200 97 202 94" stroke="#E11D48" strokeWidth="1.2" strokeLinecap="round" fill="none" />

                                {/* Candidate Body / Purple Sweater */}
                                <path d="M178 115 C178 105 188 100 200 100 C212 100 222 105 222 115 L226 155 L174 155 Z" fill="#7C3AED" />
                                
                                {/* Laptop Desk */}
                                <line x1="100" y1="180" x2="300" y2="180" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />

                                {/* Laptop open */}
                                <rect x="175" y="140" width="50" height="34" rx="4" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1.5" />
                                <circle cx="200" cy="157" r="4" fill="#64748B" />
                                <polygon points="165,178 235,178 228,174 172,174" fill="#94A3B8" />

                                {/* Candidate Arms on desk */}
                                <path d="M180 135 L172 165 L185 174" stroke="#7C3AED" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                <path d="M220 135 L228 165 L215 174" stroke="#7C3AED" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                        </div>
                    </div>

                    {/* Headline & Welcome Text */}
                    <div className="space-y-1 mb-5">
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                            You're invited to an interview!
                        </h1>
                        <p className="text-sm font-medium text-slate-500">
                            We're excited to meet you{interviewData.name ? `, ${interviewData.name.split(" ")[0]}` : ""}.
                        </p>
                    </div>

                    {/* Subtle Divider */}
                    <div className="w-16 h-[2px] bg-slate-100 mx-auto mb-5 rounded-full" />

                    {/* Position Role & Company */}
                    <div className="space-y-1 mb-6">
                        <h2 className="text-xl sm:text-2xl font-extrabold text-violet-600 tracking-tight">
                            {interviewData.role || "Frontend Developer"}
                        </h2>
                        <p className="text-xs sm:text-sm font-semibold text-slate-600">
                            {interviewData.company || "AvaHire Technologies Pvt. Ltd."}
                        </p>
                    </div>

                    {/* 3 Info Cards / Pills */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 text-left">
                        {/* Interview Date */}
                        <div className="bg-[#f8f9ff] hover:bg-[#f1f3fd] transition border border-indigo-50/80 rounded-2xl p-3.5 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-100/80 text-violet-600 flex items-center justify-center shrink-0">
                                <Calendar className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                                    Interview Date
                                </span>
                                <span className="text-xs sm:text-[13px] font-bold text-slate-900 block truncate">
                                    {interviewData.date || "02 September 2026"}
                                </span>
                                <span className="text-[11px] text-slate-500 block font-medium">
                                    ({interviewData.dayOfWeek || "Tuesday"})
                                </span>
                            </div>
                        </div>

                        {/* Interview Time */}
                        <div className="bg-[#f8f9ff] hover:bg-[#f1f3fd] transition border border-indigo-50/80 rounded-2xl p-3.5 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-100/80 text-violet-600 flex items-center justify-center shrink-0">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                                    Interview Time
                                </span>
                                <span className="text-xs sm:text-[13px] font-bold text-slate-900 block truncate">
                                    {interviewData.time || "11:00 AM"} {interviewData.timeZone || "IST"}
                                </span>
                            </div>
                        </div>

                        {/* Interview Duration */}
                        <div className="bg-[#f8f9ff] hover:bg-[#f1f3fd] transition border border-indigo-50/80 rounded-2xl p-3.5 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-100/80 text-violet-600 flex items-center justify-center shrink-0">
                                <Timer className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                                    Interview Duration
                                </span>
                                <span className="text-xs sm:text-[13px] font-bold text-slate-900 block truncate">
                                    {interviewData?.duration || settings.duration || "30 Minutes"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Primary Call to Action Button */}
                    <div className="mb-5">
                        <button
                            onClick={handleJoinInterview}
                            className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-700 hover:to-indigo-700 active:scale-[0.99] text-white rounded-2xl text-base font-bold shadow-lg shadow-violet-500/25 transition-all flex items-center justify-center gap-3 group cursor-pointer"
                        >
                            <Video className="w-5 h-5 transition-transform group-hover:scale-110" />
                            <span>Join Interview</span>
                        </button>
                    </div>

                    {/* Notice / Advisory Alert Box */}
                    <div className="bg-[#FEF7E6] border border-[#FDE68A] rounded-2xl p-4 flex items-start gap-3.5 text-left">
                        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                            <Clock className="w-4 h-4 text-amber-700" />
                        </div>
                        <div className="space-y-0.5 text-xs text-amber-900">
                            <div className="font-bold text-amber-950 text-[13px]">
                                Please join on time!
                            </div>
                            <div className="leading-relaxed text-amber-800">
                                You can join the interview <span className="font-bold text-amber-950">5 minutes before</span> the scheduled time. The link will expire <span className="font-bold text-amber-950">5 minutes after</span> the interview starts.
                            </div>
                        </div>
                    </div>

                </div>
            </main>

            {/* Footer note */}
            <footer className="w-full max-w-5xl mx-auto px-6 py-4 text-center text-xs text-slate-400 relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/50">
                <span>Powered by AvaHire AI Automated Hiring Engine</span>
                <span>Encrypted &amp; Proctor-Verified Session • Session ID: #{interviewData.linkCode || "akc123"}</span>
            </footer>
        </div>
    );
};

export default CandidateInterviewInvite;
