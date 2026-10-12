import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
    Users,
    Clock,
    User,
    Briefcase,
    Calendar,
    Hourglass,
    Bot,
    Headphones,
    MessageSquare,
    LogOut,
    ArrowRight,
    Sparkles,
    CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { getInterviewByCodeOrId } from "@/utils/interviewStore";
import { useInterviewSettings } from "@/utils/interviewSettingsStore";
import AvaHireLogo from "@/components/AvaHireLogo";

const CandidateWaitingRoom = () => {
    const { code } = useParams();
    const navigate = useNavigate();
    const { settings } = useInterviewSettings();

    const [interviewData, setInterviewData] = useState(() => {
        const found = getInterviewByCodeOrId(code);
        if (found) return found;
        return {
            id: "iv-default",
            name: "Candidate",
            role: "Software Developer",
            company: "AvaHire Recruiter",
            date: "Today",
            time: "Scheduled Time",
            duration: "30 Minutes",
            linkCode: code || ""
        };
    });

    // Countdown Timer State (default 4 minutes 28 seconds = 268 seconds)
    const [timeLeft, setTimeLeft] = useState(268);
    const [isAutoEntering, setIsAutoEntering] = useState(false);

    useEffect(() => {
        const found = getInterviewByCodeOrId(code);
        if (found) {
            setInterviewData(found);
        }
    }, [code]);

    // Live Ticking Countdown
    useEffect(() => {
        if (timeLeft <= 0) {
            setIsAutoEntering(true);
            toast.success("Interview time reached! Launching AI interview room...");
            const timeout = setTimeout(() => {
                navigate(`/i/${interviewData.linkCode || code || "akc123"}/live`);
            }, 1200);
            return () => clearTimeout(timeout);
        }

        const timer = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft, navigate, interviewData.linkCode, code]);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const formattedMinutes = String(minutes).padStart(2, "0");
    const formattedSeconds = String(seconds).padStart(2, "0");

    const handleEnterNow = () => {
        try {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(() => {});
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen().catch(() => {});
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen().catch(() => {});
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen().catch(() => {});
            }
        } catch (e) {}
        toast.success("Connecting to AvaHire AI Interviewer...");
        navigate(`/i/${interviewData.linkCode || code || "akc123"}/live`);
    };

    return (
        <div className="min-h-screen bg-[#f8f9ff] text-slate-900 font-sans flex flex-col justify-between selection:bg-violet-500 selection:text-white">
            
            {/* Top Navigation Bar */}
            <header className="w-full bg-white border-b border-slate-200/80 px-6 sm:px-10 py-4 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
                {/* AvaHire Logo */}
                <AvaHireLogo size="sm" variant="dark" />

                {/* Leave Room Button */}
                <button
                    onClick={() => {
                        let confirmed = true;
                        try {
                            confirmed = window.confirm("Are you sure you want to leave the interview waiting room?");
                        } catch (e) {
                            confirmed = true;
                        }
                        if (confirmed) {
                            navigate(`/i/${interviewData.linkCode || code || "akc123"}`);
                        }
                    }}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition shadow-2xs cursor-pointer"
                >
                    <LogOut className="w-4 h-4 text-slate-500" />
                    <span>Leave Room</span>
                </button>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
                
                {/* Header Title Section with Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0 shadow-2xs">
                            <Users className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                                Interview Waiting Room
                            </h1>
                            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                                Please wait while we prepare your AI interview experience.
                            </p>
                        </div>
                    </div>

                    {/* Status Badge */}
                    <div className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-violet-50 border border-violet-200/60 text-violet-700 text-xs font-bold shadow-2xs">
                        <Clock className="w-4 h-4 text-violet-600" />
                        <span>{timeLeft > 0 ? "Interview Not Started" : "Interview Starting..."}</span>
                    </div>
                </div>

                {/* Two Column Waiting Room Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                    
                    {/* LEFT COLUMN: AI Interviewer (Ava) Card */}
                    <div className="lg:col-span-4 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs flex flex-col items-center text-center justify-between space-y-6">
                        <div className="w-full space-y-5">
                            <h3 className="text-base sm:text-lg font-black text-violet-700 tracking-tight text-center">
                                AI Interviewer
                            </h3>

                            {/* 3D Ava Avatar with Lilac Sparkle Backdrop */}
                            <div className="relative mx-auto w-48 h-48 sm:w-52 sm:h-52 rounded-full bg-gradient-to-tr from-purple-100 via-violet-100 to-indigo-100 p-2 shadow-inner border border-violet-100 flex items-center justify-center overflow-hidden group">
                                <img
                                    src="/images/ai_interviewer_ava.jpg"
                                    alt="Ava - AI Interviewer"
                                    className="w-full h-full object-cover object-top scale-105 group-hover:scale-110 transition-transform duration-500"
                                    onError={(e) => {
                                        e.target.style.display = "none";
                                    }}
                                />
                                {/* Sparkle stars */}
                                <div className="absolute top-4 left-6 text-violet-400 text-xs font-bold animate-pulse">✦</div>
                                <div className="absolute top-8 right-6 text-indigo-400 text-sm font-bold animate-pulse delay-150">✦</div>
                                <div className="absolute bottom-10 left-4 text-purple-400 text-xs font-bold animate-pulse delay-300">✦</div>
                            </div>

                            {/* Ava Name & AI Interviewer Pill Badge */}
                            <div className="space-y-1.5">
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                                    Ava
                                </h2>
                                <span className="inline-block px-3.5 py-1 rounded-full text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200/60">
                                    AI Interviewer
                                </span>
                            </div>

                            <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-xs mx-auto">
                                Your AI interviewer will guide you through the session and ask role-relevant questions.
                            </p>
                        </div>

                        {/* Bottom Mini Card: Powered by Advanced AI */}
                        <div className="w-full p-4 rounded-2xl bg-[#f8f9ff] border border-slate-100 flex items-center gap-3 text-left shadow-2xs">
                            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-slate-900">Powered by Advanced AI</h4>
                                <p className="text-[11px] text-slate-400 font-medium">Smart. Adaptive. Insightful.</p>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Interview Details & Live Countdown */}
                    <div className="lg:col-span-8 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-6">
                        <div className="space-y-6">
                            <h3 className="text-base sm:text-lg font-black text-violet-700 tracking-tight">
                                Interview Details
                            </h3>

                            {/* Details List */}
                            <div className="space-y-0 divide-y divide-slate-100">
                                {/* Row 1: Candidate Name */}
                                <div className="py-3.5 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-600">
                                        <User className="w-4 h-4 text-violet-600 shrink-0" />
                                        <span>Candidate Name</span>
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-slate-900 text-right">
                                        {interviewData.name || "Sneha Harde"}
                                    </span>
                                </div>

                                {/* Row 2: Job Title */}
                                <div className="py-3.5 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-600">
                                        <Briefcase className="w-4 h-4 text-violet-600 shrink-0" />
                                        <span>Job Title</span>
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-slate-900 text-right">
                                        {interviewData.role || "Software Developer"}
                                    </span>
                                </div>

                                {/* Row 3: Scheduled Time */}
                                <div className="py-3.5 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-600">
                                        <Calendar className="w-4 h-4 text-violet-600 shrink-0" />
                                        <span>Scheduled Time</span>
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-slate-900 text-right">
                                        {interviewData.time || "9:30 AM"} &nbsp;|&nbsp; {interviewData.date || "01 Sep 2026"}
                                    </span>
                                </div>

                                {/* Row 4: Interview Duration */}
                                <div className="py-3.5 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-600">
                                        <Hourglass className="w-4 h-4 text-violet-600 shrink-0" />
                                        <span>Interview Duration</span>
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-slate-900 text-right">
                                        {interviewData.duration || settings.duration || "30 Minutes"}
                                    </span>
                                </div>

                                {/* Row 5: Interview Starts In (Live Countdown) */}
                                <div className="py-4 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-600">
                                        <Clock className="w-4 h-4 text-violet-600 shrink-0" />
                                        <span>Interview Starts In</span>
                                    </div>

                                    {/* Timer Display */}
                                    <div className="flex items-center gap-2">
                                        {/* Minutes Box */}
                                        <div className="px-3.5 py-1.5 rounded-xl bg-violet-50 border border-violet-200/70 text-center min-w-[58px]">
                                            <div className="text-base sm:text-lg font-black text-violet-900 leading-none">
                                                {formattedMinutes}
                                            </div>
                                            <div className="text-[9px] font-bold uppercase tracking-wider text-violet-600 mt-0.5">
                                                Min
                                            </div>
                                        </div>

                                        <span className="text-violet-400 font-bold text-lg">:</span>

                                        {/* Seconds Box */}
                                        <div className="px-3.5 py-1.5 rounded-xl bg-violet-50 border border-violet-200/70 text-center min-w-[58px]">
                                            <div className="text-base sm:text-lg font-black text-violet-900 leading-none">
                                                {formattedSeconds}
                                            </div>
                                            <div className="text-[9px] font-bold uppercase tracking-wider text-violet-600 mt-0.5">
                                                Sec
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Get Ready Banner */}
                            <div className="p-4 rounded-2xl bg-violet-50/70 border border-violet-100 flex items-center gap-3.5">
                                <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <div className="space-y-0.5">
                                    <div className="text-xs sm:text-[13px] font-bold text-violet-950">
                                        Get Ready!
                                    </div>
                                    <p className="text-xs text-violet-700 leading-relaxed font-medium">
                                        The interview will begin automatically when the timer reaches 00:00.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Optional Fast-Forward / Direct Entry CTA */}
                        <div className="flex items-center justify-end pt-2">
                            <button
                                type="button"
                                onClick={handleEnterNow}
                                className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-violet-500/20 transition active:scale-95 flex items-center gap-2 cursor-pointer"
                            >
                                <span>Enter Room Early</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                </div>

                {/* Bottom Card: Need Help & Contact Support */}
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-violet-50 text-violet-600 border border-violet-100 flex items-center justify-center shrink-0">
                            <Headphones className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900">Need Help?</h4>
                            <p className="text-xs text-slate-500 font-medium">
                                If you face any issues, our support team is here to help you.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => toast.info("Support Desk: support@avahire.com • Live Hotline: +91 800-AVA-HIRE")}
                        className="px-5 py-2.5 border border-violet-200 hover:border-violet-300 hover:bg-violet-50 text-violet-700 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs"
                    >
                        <MessageSquare className="w-4 h-4 text-violet-600" />
                        <span>Contact Support</span>
                    </button>
                </div>

            </main>
        </div>
    );
};

export default CandidateWaitingRoom;
