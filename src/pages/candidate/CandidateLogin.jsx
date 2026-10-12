import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import {
    Mail,
    Phone,
    User,
    ArrowRight,
    ArrowLeft,
    Sparkles,
    ShieldCheck,
    AlertCircle,
    CheckCircle2,
    Calendar,
    Clock,
    FileText,
    ChevronDown,
    Lock,
    HelpCircle,
    UserCheck
} from "lucide-react";
import { toast } from "sonner";
import { getInterviewByCodeOrId } from "@/utils/interviewStore";
import { candidatePortalApi } from "@/services/api";
import AvaHireLogo from "@/components/AvaHireLogo";

const CandidateLogin = () => {
    const { code } = useParams();
    const [searchParams] = useSearchParams();
    const queryEmail = searchParams.get("email") || "";
    const navigate = useNavigate();

    const [interviewData, setInterviewData] = useState(() => {
        const found = getInterviewByCodeOrId(code);
        if (found) return found;
        return {
            id: "iv-default",
            name: "Candidate",
            email: queryEmail || "",
            phone: "",
            role: "Job Assessment",
            company: "AvaHire Recruiter",
            linkCode: code || ""
        };
    });

    const [resumesList, setResumesList] = useState([]);
    const [email, setEmail] = useState(queryEmail || "");
    const [phone, setPhone] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [loginError, setLoginError] = useState("");
    const [scheduleInfo, setScheduleInfo] = useState(null);

    // Fetch all submitted resumes and hydrate candidate credentials
    useEffect(() => {
        const loadResumesAndSession = async () => {
            try {
                const list = await candidatePortalApi.getResumes();
                if (Array.isArray(list) && list.length > 0) {
                    setResumesList(list);

                    // If code or email is provided, try to match to a submitted resume
                    if (queryEmail) {
                        const matched = list.find(r => r.email?.toLowerCase() === queryEmail.toLowerCase());
                        if (matched) {
                            setEmail(matched.email);
                            if (matched.phone) setPhone(matched.phone);
                            if (matched.interviewSchedule) setScheduleInfo(matched.interviewSchedule);
                        }
                    } else if (code) {
                        // Check if an interview matches this code
                        const matchedByCode = list.find(r => r.interviewSchedule?.linkCode === code);
                        if (matchedByCode) {
                            setEmail(matchedByCode.email);
                            if (matchedByCode.phone) setPhone(matchedByCode.phone);
                            setScheduleInfo(matchedByCode.interviewSchedule);
                        }
                    }
                }
            } catch (err) {
                console.warn("Failed to load resumes for candidate portal:", err.message);
            }

            // Also fetch session by code if available
            if (code) {
                try {
                    const session = await candidatePortalApi.getSession(code);
                    if (session) {
                        setInterviewData(prev => ({
                            ...prev,
                            name: session.candidateName || prev.name,
                            email: session.candidateEmail || prev.email,
                            phone: session.candidatePhone || prev.phone,
                            role: session.role || prev.role,
                            company: session.company || prev.company,
                            linkCode: session.linkCode || code
                        }));
                        if (session.interviewSchedule) {
                            setScheduleInfo(session.interviewSchedule);
                        }
                        if (session.candidateEmail && !email) {
                            setEmail(session.candidateEmail);
                        }
                    }
                } catch (e) {
                    console.warn("Session fetch warning:", e.message);
                }
            }
        };

        loadResumesAndSession();
    }, [code, queryEmail]);

    // Handle resume selection for quick testing / auto-fill
    const handleSelectResumeCandidate = (resume) => {
        if (!resume) return;
        setEmail(resume.email || "");
        setPhone(resume.phone || "");
        setLoginError("");
        if (resume.interviewSchedule) {
            setScheduleInfo(resume.interviewSchedule);
        } else {
            setScheduleInfo(null);
        }
        toast.info(`Loaded candidate credentials for ${resume.name}`);
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setLoginError("");

        const cleanEmail = email.trim();
        const cleanPhone = phone.trim();

        if (!cleanEmail) {
            toast.error("Please enter the Email ID mentioned on your submitted resume.");
            return;
        }
        if (!cleanPhone) {
            toast.error("Please enter the Phone Number mentioned on your submitted resume.");
            return;
        }

        setIsLoading(true);

        try {
            const effectiveCode = code || interviewData.linkCode || (scheduleInfo && scheduleInfo.linkCode) || "";
            const response = await candidatePortalApi.login({
                linkCode: effectiveCode,
                email: cleanEmail,
                phone: cleanPhone
            });

            if (response && response.success) {
                const sessionData = response.data;
                const candidateData = response.candidate || sessionData;

                // Store verified authentication state in localStorage for the interview session
                localStorage.setItem("avahire_candidate_session", JSON.stringify(sessionData));
                localStorage.setItem("avahire_candidate_interview", JSON.stringify(candidateData));
                localStorage.setItem("avahire_candidate_auth", "true");

                const targetCode = sessionData.linkCode || effectiveCode || "akc123";
                const scheduleDate = sessionData.interviewSchedule?.date || "today";
                const scheduleTime = sessionData.interviewSchedule?.time || "your scheduled slot";

                toast.success(`Identity Verified! Welcome ${candidateData.name}. Interview scheduled for ${scheduleDate} at ${scheduleTime}.`);
                navigate(`/i/${targetCode}/system-check`);
            } else {
                const errMsg = response?.error || "Authentication failed. Please verify your resume contact information.";
                setLoginError(errMsg);
                toast.error(errMsg);
            }
        } catch (err) {
            const serverError = err.response?.data?.error || err.message || "Failed to verify credentials against submitted resumes.";
            setLoginError(serverError);
            toast.error(serverError, { duration: 6000 });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#f8f9ff] via-[#f1f3fd] to-[#ede9fe] text-slate-900 font-sans flex flex-col justify-between relative overflow-x-hidden selection:bg-violet-500 selection:text-white p-4 sm:p-6 lg:p-10">
            {/* Background glowing effects */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-300/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-300/20 rounded-full blur-3xl pointer-events-none" />

            {/* Top Bar Header */}
            <header className="w-full max-w-6xl mx-auto flex items-center justify-between pb-4 relative z-10">
                <Link
                    to={code ? `/i/${interviewData.linkCode || code}` : "/"}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-violet-600 transition bg-white/70 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-200/60 shadow-2xs"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{code ? "Back to Invitation" : "Back to Home"}</span>
                </Link>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-3 py-1 bg-white/80 backdrop-blur-md rounded-full text-violet-700 border border-violet-100 shadow-2xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        AI Interview Portal · Connected to Resumes ({resumesList.length})
                    </span>
                </div>
            </header>

            {/* Main Center Two-Column Login Card */}
            <main className="flex-1 flex items-center justify-center relative z-10 my-auto">
                <div className="w-full max-w-[1020px] bg-white rounded-[32px] shadow-[0_25px_60px_rgba(79,70,229,0.12)] border border-slate-100/90 overflow-hidden grid grid-cols-1 lg:grid-cols-12 animate-in fade-in zoom-in-95">
                    
                    {/* LEFT COLUMN: Dark Navy Branding, Scheduled Interview Timing & Info */}
                    <div className="lg:col-span-5 bg-[#131b2e] text-white p-7 sm:p-9 lg:p-10 flex flex-col justify-between relative overflow-hidden">
                        {/* Background subtle light effects */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

                        {/* Top AvaHire Logo */}
                        <div className="relative z-10 mb-6">
                            <AvaHireLogo size="md" variant="darkBg" />
                        </div>

                        {/* Hero Headline & Instructions */}
                        <div className="space-y-3 relative z-10 mb-6">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-[11px] font-semibold">
                                <Lock className="w-3.5 h-3.5 text-violet-400" />
                                <span>Resume-Verified Authentication</span>
                            </div>
                            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug">
                                Candidate Interview Entry
                            </h1>
                            <p className="text-xs text-slate-300/90 leading-relaxed">
                                Enter the exact <strong>Email ID</strong> and <strong>Phone Number</strong> mentioned on your submitted resume to enter your scheduled interview.
                            </p>
                        </div>

                        {/* Scheduled Time Banner (If Known) */}
                        <div className="relative z-10 mb-6 bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center justify-between text-xs border-b border-slate-700/60 pb-2">
                                <span className="text-slate-400 font-medium">Interview Schedule</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    {scheduleInfo?.status || interviewData?.status || "Scheduled"}
                                </span>
                            </div>
                            <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2 text-slate-200 font-semibold">
                                    <Calendar className="w-4 h-4 text-violet-400 shrink-0" />
                                    <span>Date: {scheduleInfo?.date || interviewData?.date || "Check with Recruiter"}</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-200 font-semibold">
                                    <Clock className="w-4 h-4 text-violet-400 shrink-0" />
                                    <span>Time: {scheduleInfo?.time || interviewData?.time || "Assigned Slot"}</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-300 text-[11px]">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span>Proctored Session · Duration: {scheduleInfo?.duration || "45 Minutes"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Security Notice */}
                        <div className="relative z-10 mt-auto pt-3 border-t border-slate-800/60 text-[11px] text-slate-400 flex items-start gap-2">
                            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                            <span>
                                For candidate integrity, accounts with different contact information than what was submitted on the resume are strictly blocked.
                            </span>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Candidate Login Form & Resume Quick-Fill */}
                    <div className="lg:col-span-7 bg-white p-7 sm:p-9 lg:p-10 flex flex-col justify-center">
                        <div className="w-full max-w-md mx-auto space-y-5">
                            
                            {/* Header Icon + Title */}
                            <div className="space-y-2 text-left">
                                <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-100 shadow-2xs">
                                    <User className="w-6 h-6 stroke-[1.8]" />
                                </div>
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                                        Verify Resume Credentials
                                    </h2>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                        Login using your registered contact details as submitted in your resume.
                                    </p>
                                </div>
                            </div>


                            {/* Error Alert Box */}
                            {loginError && (
                                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-rose-800 text-xs text-left animate-in fade-in">
                                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <span className="font-bold block">Access Restricted</span>
                                        <p className="leading-relaxed text-rose-700">{loginError}</p>
                                    </div>
                                </div>
                            )}

                            {/* Form */}
                            <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
                                {/* Email Field */}
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-800">
                                        Email ID (as mentioned on Resume)
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                            <Mail className="w-4 h-4" />
                                        </div>
                                        <input
                                            type="email"
                                            required
                                            placeholder="e.g. ABC@example.com"
                                            value={email}
                                            onChange={(e) => {
                                                setEmail(e.target.value);
                                                setLoginError("");
                                            }}
                                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-3 focus:ring-violet-500/10 transition shadow-2xs"
                                        />
                                    </div>
                                </div>

                                {/* Phone Field */}
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-800">
                                        Phone Number (as mentioned on Resume)
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                            <Phone className="w-4 h-4" />
                                        </div>
                                        <input
                                            type="tel"
                                            required
                                            placeholder="e.g. +91-xxxxxxxxxx"
                                            value={phone}
                                            onChange={(e) => {
                                                setPhone(e.target.value);
                                                setLoginError("");
                                            }}
                                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-3 focus:ring-violet-500/10 transition shadow-2xs"
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                        Must strictly match the contact number registered on your resume.
                                    </p>
                                </div>

                                {/* Login CTA Button */}
                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full py-3 px-6 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-700 hover:to-indigo-700 active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-violet-500/25 transition-all flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-75"
                                    >
                                        {isLoading ? (
                                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <span>Verify &amp; Enter Interview Room</span>
                                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>

                            {/* Help & Support Footer */}
                            <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-100">
                                Not scheduled yet or need to reschedule?{" "}
                                <button
                                    type="button"
                                    onClick={() => toast.info("HR Support: support@avahire.ai • Please contact your assigned recruiter.")}
                                    className="font-bold text-violet-600 hover:text-violet-700 hover:underline transition cursor-pointer"
                                >
                                    Contact HR Team
                                </button>
                            </div>

                        </div>
                    </div>

                </div>
            </main>

            {/* Footer info */}
            <footer className="w-full max-w-5xl mx-auto py-3 text-center text-xs text-slate-400 relative z-10 flex flex-wrap items-center justify-between gap-2">
                <span>AvaHire AI Proctored Candidate Portal</span>
                <span>Protected by AI Proctoring &amp; Identity Verification</span>
            </footer>
        </div>
    );
};

export default CandidateLogin;
