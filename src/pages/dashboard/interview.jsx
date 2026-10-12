import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
    Calendar,
    Clock,
    Copy,
    Check,
    Eye,
    RotateCw,
    FileText,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    ShieldCheck,
    ExternalLink,
    Mail,
    Users,
    Phone,
    UserCheck,
    Video,
    CheckCircle2,
    X,
    Plus
} from "lucide-react";
import { getStoredInterviews, saveInterviews, addOrUpdateInterview, removeInterview } from "@/utils/interviewStore";
import { interviewsApi, candidatePortalApi, candidatesApi, resumesApi } from "@/services/api";

const isTestOrDemoInterview = (iv) => {
    if (!iv) return true;
    const cid = String(iv.candidateId || iv.resumeId || "").toLowerCase();
    const name = String(iv.name || "").toLowerCase().trim();
    const email = String(iv.email || "").toLowerCase().trim();
    if (cid.includes("cand-demo") || cid.includes("demo")) return true;
    if (name === "ananya sharma" || name === "rohan varma" || name === "priyanka patel") return true;
    if (name === "management tools" || name.includes("prachi jain") || name === "team members") return true;
    if (name === "srtyse" || name === "hjjiy" || name === "hello" || email === "hello@mail.com" || email === "awer@drtyg" || email === "sdfg@werr") return true;
    if (name === "candidate" && (!email || email.includes("example.com"))) return true;
    return false;
};

const Interviews = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Active Tab State: "interviewee" (Shortlisted Interviewees) | "interviews" (AI Video Interviews)
    const initialTab = searchParams.get("tab") === "interviews" ? "interviews" : "interviewee";
    const [activeTab, setActiveTab] = useState(initialTab);

    // Core Data States
    const [interviews, setInterviews] = useState(() => (getStoredInterviews() || []).filter(iv => !isTestOrDemoInterview(iv)));
    const [candidatesList, setCandidatesList] = useState([]);
    const [resumesList, setResumesList] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal and Feedback States
    const [copiedId, setCopiedId] = useState(null);
    const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
    const [generatedPortalData, setGeneratedPortalData] = useState(null);
    const [selectedInterviewForView, setSelectedInterviewForView] = useState(null);
    const [selectedCandidateForSchedule, setSelectedCandidateForSchedule] = useState(null);

    // App Preferences & Interview Settings
    const [preferences, setPreferences] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("avahire_settings_preferences") || "{}");
        } catch {
            return {};
        }
    });

    // Pagination
    const [pageSize, setPageSize] = useState(() => {
        try {
            const prefs = JSON.parse(localStorage.getItem("avahire_settings_preferences") || "{}");
            return Number(prefs.candidatesPerPage) || 10;
        } catch {
            return 10;
        }
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [candidatePage, setCandidatePage] = useState(1);

    // Form state for scheduling / generating interview link
    const [previewLinkCode, setPreviewLinkCode] = useState(() => "ava" + Math.floor(100 + Math.random() * 900));
    const [newCandidateName, setNewCandidateName] = useState("");
    const [newCandidateEmail, setNewCandidateEmail] = useState("");
    const [newCandidatePhone, setNewCandidatePhone] = useState("");
    const [selectedCandidateId, setSelectedCandidateId] = useState("");
    const [newRole, setNewRole] = useState("Software Engineer");
    const [newDate, setNewDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split("T")[0];
    });
    const [newTime, setNewTime] = useState("11:00");
    const [newValidity, setNewValidity] = useState(() => {
        try {
            const ivSettings = JSON.parse(localStorage.getItem("avahire_interview_settings") || "{}");
            return ivSettings.duration || "30 Minutes";
        } catch {
            return "30 Minutes";
        }
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const [ivData, cList, rList] = await Promise.all([
                interviewsApi.getAll().catch(() => null),
                candidatesApi.getAll().catch(() => []),
                resumesApi.getAll().catch(() => [])
            ]);

            if (ivData && Array.isArray(ivData)) {
                const clean = ivData.filter((iv) => !isTestOrDemoInterview(iv));
                setInterviews(clean);
                saveInterviews(clean);
            } else {
                const clean = (getStoredInterviews() || []).filter((iv) => !isTestOrDemoInterview(iv));
                setInterviews(clean);
            }

            if (Array.isArray(cList)) {
                setCandidatesList(cList);
            }
            if (Array.isArray(rList)) {
                setResumesList(rList);
            }
        } catch (err) {
            console.error("Failed to load interview and candidate data:", err);
            const clean = (getStoredInterviews() || []).filter((iv) => !isTestOrDemoInterview(iv));
            setInterviews(clean);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();

        const handleSync = () => {
            loadData();
        };

        const handlePrefUpdate = (e) => {
            const prefs = e.detail || JSON.parse(localStorage.getItem("avahire_settings_preferences") || "{}");
            setPreferences(prefs);
            if (prefs.candidatesPerPage) {
                setPageSize(Number(prefs.candidatesPerPage) || 10);
            }
        };

        const handleIvSettingsUpdate = (e) => {
            const ivSettings = e.detail || JSON.parse(localStorage.getItem("avahire_interview_settings") || "{}");
            if (ivSettings.duration) {
                setNewValidity(ivSettings.duration);
            }
        };

        window.addEventListener("avahire_interviews_updated", handleSync);
        window.addEventListener("avahire_candidates_updated", handleSync);
        window.addEventListener("avahire_resumes_updated", handleSync);
        window.addEventListener("avahire_preferences_updated", handlePrefUpdate);
        window.addEventListener("avahire_interview_settings_updated", handleIvSettingsUpdate);

        // Auto Refresh
        let refreshTimer = null;
        const autoRefreshPref = preferences.autoRefresh || "Every 5 minutes";
        let intervalMs = 0;
        if (autoRefreshPref === "Every 1 minute") intervalMs = 60000;
        else if (autoRefreshPref === "Every 5 minutes") intervalMs = 300000;
        else if (autoRefreshPref === "Every 15 minutes") intervalMs = 900000;

        if (intervalMs > 0) {
            refreshTimer = setInterval(() => {
                loadData();
            }, intervalMs);
        }

        return () => {
            window.removeEventListener("avahire_interviews_updated", handleSync);
            window.removeEventListener("avahire_candidates_updated", handleSync);
            window.removeEventListener("avahire_resumes_updated", handleSync);
            window.removeEventListener("avahire_preferences_updated", handlePrefUpdate);
            window.removeEventListener("avahire_interview_settings_updated", handleIvSettingsUpdate);
            if (refreshTimer) clearInterval(refreshTimer);
        };
    }, [preferences.autoRefresh]);

    // Helper to find interview session for a candidate
    const getCandidateInterview = (cand) => {
        if (!cand) return null;
        return interviews.find((iv) => {
            const sameEmail = iv.email && cand.email && iv.email.toLowerCase().trim() === cand.email.toLowerCase().trim();
            const sameId = (iv.candidateId && iv.candidateId === cand.id) || (iv.resumeId && iv.resumeId === cand.id) || iv.id === cand.interviewId;
            return sameEmail || sameId;
        });
    };

    // Combine & Normalize all Shortlisted Candidates from the Resume page
    const allShortlistedCandidates = useMemo(() => {
        const map = new Map();

        // 1. Process Resumes FIRST to strictly include genuine Shortlisted Candidates from Resume screening
        resumesList.forEach((r) => {
            const statusStr = (r.status || "").toLowerCase().trim();
            const nameStr = (r.name || r.candidateName || "").toLowerCase().trim();
            const isTestEntity =
                !r.name ||
                nameStr === "management tools" ||
                nameStr.includes("prachi jain") ||
                nameStr === "team members" ||
                nameStr === "the new sdlc" ||
                nameStr === "job details" ||
                nameStr === "candidate";

            // Candidate must have genuine "shortlisted" status from the Resume page
            const isShortlisted = (statusStr === "shortlisted" || r.isShortlisted === true) && !isTestEntity;

            if (isShortlisted) {
                const key = r.id || (r.email ? `res-${r.email.toLowerCase().trim()}` : `res-${Math.random()}`);
                const skillsArr = Array.isArray(r.skills)
                    ? r.skills
                    : (r.allSkills || r.matchedSkills || ["Full Stack", "Problem Solving"]);

                map.set(key, {
                    id: r.id || `res-${Date.now()}`,
                    name: r.name || r.candidateName || "Candidate",
                    email: r.email || "",
                    phone: r.phone || "",
                    role: r.role || r.targetRole || r.targetJobTitle || "Software Developer",
                    department: r.department || "Engineering",
                    score: r.matchScore || r.atsScore || r.score || 85,
                    skills: skillsArr,
                    experience: r.experience || (r.expYears !== undefined ? `${r.expYears} Years` : "2+ years"),
                    location: r.location || "India",
                    status: "Shortlisted",
                    appliedDate: r.uploadedAt || r.uploadedDate || "Recent",
                    avatar: r.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(r.name || "Res")}`,
                    source: "Resume Screening",
                    isResumeShortlisted: true
                });
            }
        });

        // 2. From Candidates API: include candidates only if genuinely Shortlisted and not a test entity
        candidatesList.forEach((c) => {
            const statusStr = (c.status || "").toLowerCase().trim();
            const stageStr = (c.stage || "").toLowerCase().trim();
            const nameStr = (c.name || "").toLowerCase().trim();
            const isTestEntity =
                !c.name ||
                nameStr === "foreign candidate" ||
                nameStr === "candidate" ||
                nameStr === "srtyse" ||
                nameStr === "hjjiy" ||
                nameStr === "hello";

            const isShortlisted = (statusStr === "shortlisted" || stageStr === "shortlisted") && !isTestEntity;

            if (isShortlisted) {
                const alreadyExists = Array.from(map.values()).some(
                    (existing) =>
                        existing.id === c.id ||
                        (existing.email && c.email && existing.email.toLowerCase().trim() === c.email.toLowerCase().trim())
                );
                if (!alreadyExists) {
                    const key = c.id || (c.email ? `cand-${c.email.toLowerCase().trim()}` : `cand-${Math.random()}`);
                    map.set(key, {
                        id: c.id || `cand-${Date.now()}`,
                        name: c.name || "Candidate",
                        email: c.email || "",
                        phone: c.phone || "",
                        role: c.role || c.jobTitle || "Software Engineer",
                        department: c.department || "Engineering",
                        score: typeof c.score === "number" ? c.score : 88,
                        skills: Array.isArray(c.skills) ? c.skills : (c.skills ? String(c.skills).split(",") : ["React", "TypeScript", "Node.js"]),
                        experience: c.experience || "3+ years",
                        location: c.location || "Remote / India",
                        status: "Shortlisted",
                        appliedDate: c.appliedDate || c.date || "Recent",
                        avatar: c.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(c.name || "Cand")}`,
                        source: "Candidate Pipeline"
                    });
                }
            }
        });

        return Array.from(map.values());
    }, [candidatesList, resumesList]);

    // Candidates who should be shown in Shortlisted Interviewees.
    // Transferred out once an interview link has been generated.
    const shortlistedPendingList = useMemo(() => {
        return allShortlistedCandidates
            .map((cand) => {
                const iv = getCandidateInterview(cand);
                const hasGeneratedLink =
                    !!iv &&
                    !!iv.linkCode &&
                    (iv.status === "Scheduled" || iv.status === "Active") &&
                    !iv.isExpired;

                return {
                    ...cand,
                    interviewSession: iv || null,
                    hasGeneratedLink,
                    linkCode: iv ? iv.linkCode : null,
                    interviewStatus: iv ? iv.status : "Pending Schedule",
                    interviewDate: iv ? iv.date : null,
                    interviewTime: iv ? iv.time : null
                };
            })
            .filter((cand) => !cand.hasGeneratedLink)
            .sort((a, b) => (b.score || 0) - (a.score || 0));
    }, [allShortlistedCandidates, interviews]);

    const totalCandidatePages = Math.max(1, Math.ceil(shortlistedPendingList.length / pageSize));
    const paginatedPendingList = useMemo(() => {
        const start = (candidatePage - 1) * pageSize;
        return shortlistedPendingList.slice(start, start + pageSize);
    }, [shortlistedPendingList, candidatePage, pageSize]);

    const cleanInterviewsList = useMemo(() => {
        // Collect IDs and emails of shortlisted candidates whose links have not been generated yet
        const pendingIds = new Set(
            shortlistedPendingList.map((c) => c.id).filter(Boolean)
        );
        const pendingEmails = new Set(
            shortlistedPendingList.map((c) => (c.email || "").toLowerCase().trim()).filter(Boolean)
        );

        return interviews.filter((iv) => {
            if (isTestOrDemoInterview(iv)) return false;
            // Only include candidates whose link has actually been generated
            if (!iv.linkCode || !String(iv.linkCode).trim()) return false;

            // Exclude candidate if they are still pending link generation in Shortlisted Interviewees
            const cid = iv.candidateId || iv.resumeId;
            const em = (iv.email || "").toLowerCase().trim();
            if (cid && pendingIds.has(cid)) return false;
            if (em && pendingEmails.has(em)) return false;

            return true;
        });
    }, [interviews, shortlistedPendingList]);

    const totalInterviewPages = Math.max(1, Math.ceil(cleanInterviewsList.length / pageSize));
    const paginatedInterviews = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return cleanInterviewsList.slice(start, start + pageSize);
    }, [cleanInterviewsList, currentPage, pageSize]);

    useEffect(() => {
        setCandidatePage(1);
        setCurrentPage(1);
    }, [pageSize]);

    useEffect(() => {
        if (candidatePage > totalCandidatePages && totalCandidatePages > 0) {
            setCandidatePage(totalCandidatePages);
        }
    }, [candidatePage, totalCandidatePages]);

    useEffect(() => {
        if (currentPage > totalInterviewPages && totalInterviewPages > 0) {
            setCurrentPage(totalInterviewPages);
        }
    }, [currentPage, totalInterviewPages]);

    const handleCopyLink = (linkCode, id) => {
        const portalUrl = `${window.location.origin}/i/${linkCode}`;
        navigator.clipboard?.writeText(portalUrl);
        setCopiedId(id || linkCode);
        toast.success(`Candidate Portal link copied: ${portalUrl}`);
        setTimeout(() => setCopiedId(null), 2500);
    };

    // Open Schedule Modal for a shortlisted candidate
    const handleOpenScheduleForCandidate = (cand) => {
        setSelectedCandidateForSchedule(cand);
        setNewCandidateName(cand?.name || "");
        setNewCandidateEmail(cand?.email || "");
        setNewCandidatePhone(cand?.phone || "");
        setNewRole(cand?.role || "Software Engineer");
        setSelectedCandidateId(cand?.id || "");
        setPreviewLinkCode("ava" + Math.floor(100 + Math.random() * 900));
        setGeneratedPortalData(null);
        setIsGenerateModalOpen(true);
    };

    // Reschedule Candidate: Removes from AI Video Interviews & transfers back to Shortlisted Interviewees
    const handleRescheduleAndTransferBack = async (iv) => {
        if (!iv) return;

        // 1. Remove from stored interviews & local state
        const updated = removeInterview(iv.id || iv.linkCode);
        setInterviews(updated);

        // 2. Delete from backend API
        try {
            await interviewsApi.delete(iv.id || iv.linkCode);
        } catch (e) {
            console.warn("Interviews delete API fallback:", e);
        }

        // 3. Update candidate status back to "Shortlisted" in candidates API
        if (iv.candidateId) {
            try {
                await candidatesApi.update(iv.candidateId, {
                    status: "Shortlisted",
                    interviewId: null,
                    linkCode: null,
                    interviewDate: null,
                    interviewTime: null
                });
            } catch (e) {
                console.warn("Candidates status reset API fallback:", e);
            }
        }

        // 4. Fire storage events so both tabs refresh immediately
        if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("avahire_interviews_updated"));
            window.dispatchEvent(new Event("avahire_candidates_updated"));
        }

        toast.success(`${iv.name} removed from AI Interviews and transferred back to Shortlisted Interviewees.`, {
            action: {
                label: "View Shortlisted",
                onClick: () => handleTabChange("interviewee")
            }
        });
    };

    // Generate Interview Link & Schedule Candidate
    const handleCreateInterviewLink = (e) => {
        e.preventDefault();
        if (!newCandidateName || !newCandidateEmail) {
            toast.error("Please provide candidate name and email.");
            return;
        }

        const randomCode = previewLinkCode || ("ava" + Math.floor(100 + Math.random() * 900));
        const dateObj = new Date(newDate);
        const formattedDate = !isNaN(dateObj)
            ? dateObj.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            })
            : "05 October 2026";

        const dayName = !isNaN(dateObj)
            ? dateObj.toLocaleDateString("en-US", { weekday: "long" })
            : "Monday";

        const formattedTime = newTime
            ? (newTime.includes(":") ? (newTime.includes("M") ? newTime : `${newTime} AM`) : `${newTime}:00 AM`)
            : "11:00 AM";

        const candId = selectedCandidateId || `cand-${Date.now()}`;
        const newEntry = {
            id: `iv-${Date.now()}`,
            candidateId: candId,
            resumeId: candId,
            name: newCandidateName.trim(),
            email: newCandidateEmail.trim().toLowerCase(),
            phone: newCandidatePhone.trim() || "",
            avatar: selectedCandidateForSchedule?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(newCandidateName)}`,
            role: newRole,
            company: "AvaHire Technologies Pvt. Ltd.",
            date: formattedDate,
            dayOfWeek: dayName,
            time: formattedTime,
            timeZone: "IST",
            duration: newValidity || "45 Minutes",
            linkCode: randomCode,
            status: "Scheduled",
            expiry: "Not started",
            expiryTime: `${formattedDate}, ${formattedTime}`,
            isExpired: false
        };

        const updated = addOrUpdateInterview(newEntry);
        setInterviews((prev) => [updated, ...prev.filter((x) => x.id !== updated.id)]);

        interviewsApi.create(newEntry).catch((err) => console.warn("Interviews create API fallback:", err));

        if (candId) {
            candidatesApi.update(candId, {
                status: "Interview Scheduled",
                interviewId: newEntry.id,
                interviewDate: formattedDate,
                interviewTime: formattedTime,
                linkCode: newEntry.linkCode
            }).catch(() => { });
        }

        setGeneratedPortalData(newEntry);
        handleCopyLink(randomCode, newEntry.id);
        toast.success(`Candidate interview scheduled! Transferred to AI Video Interviews.`);
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    const getStatusPill = (status) => {
        switch (status) {
            case "Active":
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Active
                    </span>
                );
            case "Scheduled":
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Scheduled
                    </span>
                );
            case "Completed":
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        Completed
                    </span>
                );
            case "Expired":
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        Expired
                    </span>
                );
        }
    };

    return (
        <div className="space-y-5 max-w-7xl mx-auto -mt-2" data-testid="interviews-page">
            {/* Top Navigation Tabs Header: Unified Switcher inside Interviews Page */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/25">
                            {activeTab === "interviewee" ? <UserCheck className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                <span>{activeTab === "interviewee" ? "Shortlisted Interviewees" : "AI Video Interviews"}</span>
                            </h1>
                            {activeTab !== "interviewee" && (
                                <p className="text-xs sm:text-sm text-slate-500">
                                    Active, scheduled & completed AI assessment sessions with live Avatar proctoring.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Switcher Navigation Pill */}
                <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-2xl shadow-inner border border-slate-300/40">
                    <button
                        onClick={() => handleTabChange("interviewee")}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                            activeTab === "interviewee"
                                ? "bg-white text-violet-700 shadow-xs border border-slate-200/80"
                                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                        }`}
                    >
                        <Users className="w-3.5 h-3.5 text-violet-600" />
                        <span>Shortlisted Interviewees</span>
                    </button>
                    <button
                        onClick={() => handleTabChange("interviews")}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                            activeTab === "interviews"
                                ? "bg-white text-violet-700 shadow-xs border border-slate-200/80"
                                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                        }`}
                    >
                        <Video className="w-3.5 h-3.5 text-violet-600" />
                        <span>AI Video Interviews</span>
                    </button>
                </div>
            </div>

            {/* TAB 1 CONTENT: Shortlisted Interviewees (Waiting for link generation & schedule) */}
            {activeTab === "interviewee" && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden animate-in fade-in duration-200">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/75 border-b border-slate-100 text-xs font-bold text-slate-600 tracking-wider">
                                    <th className="py-4 px-6">Candidate Details</th>
                                    <th className="py-4 px-6">Target Role</th>
                                    <th className="py-4 px-6">Key Skills</th>
                                    <th className="py-4 px-6">Status</th>
                                    <th className="py-4 px-6 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs font-medium">
                                {shortlistedPendingList.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="py-16 text-center text-slate-400">
                                            <div className="max-w-md mx-auto space-y-3">
                                                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                                                    <CheckCircle2 className="w-6 h-6" />
                                                </div>
                                                <div className="font-bold text-slate-800 text-sm">All shortlisted candidates scheduled!</div>
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    All candidate interview links have been generated and transferred to <strong>AI Video Interviews</strong>.
                                                </p>
                                                <div className="pt-2">
                                                    <button
                                                        onClick={() => handleTabChange("interviews")}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                                                    >
                                                        <Video className="w-3.5 h-3.5" />
                                                        <span>View AI Video Interviews</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedPendingList.map((cand) => (
                                        <tr
                                            key={cand.id}
                                            className="hover:bg-slate-50/60 transition-colors group"
                                        >
                                            {/* Column 1: Candidate Info */}
                                            <td className={`${preferences.compactView ? "py-2.5" : "py-4"} px-6`}>
                                                <div className="flex items-center gap-3.5">
                                                    {preferences.showAvatars !== false ? (
                                                        <img
                                                            src={cand.avatar}
                                                            alt={cand.name}
                                                            className="w-10 h-10 rounded-2xl object-cover border border-slate-200 shrink-0 shadow-2xs"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs">
                                                            {cand.name?.slice(0, 2)?.toUpperCase() || "CA"}
                                                        </div>
                                                    )}
                                                    <div className="space-y-0.5">
                                                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                                            <span>{cand.name}</span>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                                                                {cand.experience}
                                                            </span>
                                                        </div>
                                                        <div className="text-slate-500 text-xs flex items-center gap-1.5">
                                                            <span>{cand.email}</span>
                                                        </div>
                                                        {cand.phone && (
                                                            <div className="text-[11px] font-mono text-violet-700 flex items-center gap-1">
                                                                <Phone className="w-3 h-3 text-violet-400 shrink-0" />
                                                                <span>{cand.phone}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Column 2: Role & Department */}
                                            <td className="py-4 px-6">
                                                <div className="space-y-0.5">
                                                    <div className="font-bold text-slate-800 text-xs sm:text-sm">
                                                        {cand.role}
                                                    </div>
                                                    <div className="text-[11px] text-slate-400">
                                                        {cand.department || "Engineering"} · {cand.location}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Column 3: Skills */}
                                            <td className="py-4 px-6">
                                                <div className="flex flex-wrap gap-1 max-w-xs">
                                                    {Array.isArray(cand.skills) && cand.skills.slice(0, 3).map((skill, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-medium"
                                                        >
                                                            {typeof skill === "string" ? skill.trim() : skill}
                                                        </span>
                                                    ))}
                                                    {Array.isArray(cand.skills) && cand.skills.length > 3 && (
                                                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-md text-[10px] font-bold">
                                                            +{cand.skills.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Column 4: Status */}
                                            <td className="py-4 px-6">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                    <span>Ready to Schedule</span>
                                                </span>
                                            </td>

                                            {/* Column 5: Action */}
                                            <td className="py-4 px-6 text-right">
                                                <button
                                                    onClick={() => handleOpenScheduleForCandidate(cand)}
                                                    className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-violet-500/20 transition active:scale-95 flex items-center gap-1.5 cursor-pointer ml-auto"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    <span>Generate Link</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer Controls */}
                    <div className="p-4 sm:px-6 border-t border-slate-100 flex flex-wrap items-center justify-end gap-4 text-xs text-slate-500">

                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCandidatePage((p) => Math.max(1, p - 1))}
                                disabled={candidatePage <= 1}
                                className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                title="Previous Page"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>

                            {Array.from({ length: totalCandidatePages }, (_, i) => i + 1)
                                .filter((p) => p === 1 || p === totalCandidatePages || Math.abs(p - candidatePage) <= 1)
                                .reduce((acc, p, idx, arr) => {
                                    if (idx > 0 && p - arr[idx - 1] > 1) {
                                        acc.push("...");
                                    }
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, idx) =>
                                    p === "..." ? (
                                        <span key={`dots-cp-${idx}`} className="px-1 text-slate-400">...</span>
                                    ) : (
                                        <button
                                            key={p}
                                            onClick={() => setCandidatePage(p)}
                                            className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center transition cursor-pointer ${
                                                candidatePage === p
                                                    ? "bg-violet-600 text-white shadow-xs"
                                                    : "border border-slate-200 hover:bg-white text-slate-600"
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    )
                                )}

                            <button
                                onClick={() => setCandidatePage((p) => Math.min(totalCandidatePages, p + 1))}
                                disabled={candidatePage >= totalCandidatePages}
                                className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                title="Next Page"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <span>Show</span>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-800"
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                            </select>
                            <span>candidates</span>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2 CONTENT: AI Video Interviews (Scheduled & Active Sessions) */}
            {activeTab === "interviews" && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden animate-in fade-in duration-200">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100 text-xs font-bold text-slate-700 tracking-wider">
                                    <th className="py-4 px-6">Candidate (Resume Verified)</th>
                                    <th className="py-4 px-6">Job Role</th>
                                    <th className="py-4 px-6">Date &amp; Time</th>
                                    <th className="py-4 px-6">Candidate Portal Link</th>
                                    <th className="py-4 px-6">Status</th>
                                    <th className="py-4 px-6">Expiry</th>
                                    <th className="py-4 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs font-medium">
                                {cleanInterviewsList.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="py-16 text-center text-slate-400">
                                            <div className="max-w-md mx-auto space-y-3">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                                                    <Video className="w-6 h-6" />
                                                </div>
                                                <div className="font-bold text-slate-800 text-sm">No active interview sessions yet</div>
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    Go to <strong>Shortlisted Interviewees</strong> tab to generate candidate portal links and schedule interviews.
                                                </p>
                                                <div className="pt-2">
                                                    <button
                                                        onClick={() => handleTabChange("interviewee")}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                                                    >
                                                        <Users className="w-3.5 h-3.5" />
                                                        <span>Pick Shortlisted Candidate</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedInterviews.map((iv) => {
                                        const isCopied = copiedId === iv.id || copiedId === iv.linkCode;

                                        return (
                                            <tr
                                                key={iv.id}
                                                className="hover:bg-slate-50/60 transition-colors group"
                                            >
                                                {/* Column 1: Candidate */}
                                                <td className={`${preferences.compactView ? "py-2.5" : "py-4"} px-6`}>
                                                    <div className="flex items-center gap-3">
                                                        {preferences.showAvatars !== false ? (
                                                            <img
                                                                src={iv.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150"}
                                                                alt={iv.name}
                                                                className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                                                                {iv.name?.slice(0, 2)?.toUpperCase() || "IV"}
                                                            </div>
                                                        )}
                                                        <div className="space-y-0.5">
                                                            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                                                <span>{iv.name}</span>
                                                            </div>
                                                            <div className="text-slate-500 text-xs">
                                                                {iv.email}
                                                            </div>
                                                            {iv.phone && (
                                                                <div className="text-[11px] font-mono text-violet-700 flex items-center gap-1">
                                                                    <Phone className="w-3 h-3 text-violet-500 shrink-0" />
                                                                    <span>{iv.phone}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Column 2: Job Role */}
                                                <td className={`${preferences.compactView ? "py-2.5" : "py-4"} px-6 text-slate-700 font-semibold`}>
                                                    {iv.role}
                                                </td>

                                                {/* Column 3: Date & Time */}
                                                <td className={`${preferences.compactView ? "py-2.5" : "py-4"} px-6 text-slate-600`}>
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                                                            <Calendar className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                                                            <span>{iv.date}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-slate-500">
                                                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                            <span>{iv.time}</span>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Column 4: Candidate Portal Link */}
                                                <td className={`${preferences.compactView ? "py-2.5" : "py-4"} px-6`}>
                                                    <div className="flex items-center gap-2">
                                                        <a
                                                            href={`/i/${iv.linkCode}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 font-mono text-xs font-bold border border-violet-200/80 transition group/portal shadow-2xs"
                                                            title="Open Candidate Portal in New Tab"
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5 text-violet-600 group-hover/portal:scale-110 transition-transform" />
                                                            <span>/i/{iv.linkCode}</span>
                                                        </a>
                                                        <button
                                                            onClick={() => handleCopyLink(iv.linkCode, iv.id)}
                                                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-violet-700 transition cursor-pointer"
                                                            title="Copy Candidate Portal Link"
                                                        >
                                                            {isCopied ? (
                                                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                            ) : (
                                                                <Copy className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* Column 5: Status */}
                                                <td className="py-4 px-6">
                                                    {getStatusPill(iv.status)}
                                                </td>

                                                {/* Column 6: Expiry */}
                                                <td className="py-4 px-6">
                                                    {iv.status === "Active" && (
                                                        <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                                                            <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                            <div>
                                                                <span className="font-mono">{iv.expiry.split(" ")[0]}</span>{" "}
                                                                <span className="text-[11px] block sm:inline">Remaining</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {iv.status === "Scheduled" && (
                                                        <div className="text-slate-400">
                                                            - Not started
                                                        </div>
                                                    )}

                                                    {iv.status === "Completed" && (
                                                        <div className="text-slate-400">
                                                            - Completed
                                                        </div>
                                                    )}

                                                    {iv.status === "Expired" && (
                                                        <div className="space-y-0.5 text-rose-500">
                                                            <div className="flex items-center gap-1.5 font-bold">
                                                                <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                                                <span>Expired</span>
                                                            </div>
                                                            <div className="text-[11px] text-slate-400">
                                                                {iv.expiry}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Column 7: Actions */}
                                                <td className="py-4 px-6 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {/* Open Candidate Portal Button */}
                                                        <a
                                                            href={`/i/${iv.linkCode}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="w-8 h-8 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 flex items-center justify-center transition shadow-2xs"
                                                            title="Open Candidate Portal (Live AI Room)"
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>

                                                        {/* Email Candidate Link */}
                                                        <Link
                                                            to={`/app/email?candidateEmail=${encodeURIComponent(iv.email)}&interviewCode=${iv.linkCode}`}
                                                            className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center text-slate-500 transition"
                                                            title="Send Email Invitation to Candidate"
                                                        >
                                                            <Mail className="w-3.5 h-3.5" />
                                                        </Link>

                                                        {/* View Details button */}
                                                        <button
                                                            onClick={() => setSelectedInterviewForView(iv)}
                                                            className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition cursor-pointer"
                                                            title="View Details"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </button>

                                                        {/* Scorecard action if completed */}
                                                        {iv.status === "Completed" && (
                                                            <button
                                                                onClick={() => toast.info(`Viewing assessment scorecard for ${iv.name}`)}
                                                                className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition cursor-pointer"
                                                                title="View Scorecard"
                                                            >
                                                                <FileText className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}

                                                        {/* Reschedule Action Button: Removes candidate from AI Interviews and transfers back to Shortlisted Interviewees */}
                                                        <button
                                                            onClick={() => handleRescheduleAndTransferBack(iv)}
                                                            className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 flex items-center justify-center text-slate-500 transition cursor-pointer"
                                                            title="Reschedule Candidate (Transfer back to Shortlisted Interviewees)"
                                                        >
                                                            <RotateCw className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer Controls */}
                    <div className="p-4 sm:px-6 border-t border-slate-100 flex flex-wrap items-center justify-end gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                                className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                title="Previous Page"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>

                            {Array.from({ length: totalInterviewPages }, (_, i) => i + 1)
                                .filter((p) => p === 1 || p === totalInterviewPages || Math.abs(p - currentPage) <= 1)
                                .reduce((acc, p, idx, arr) => {
                                    if (idx > 0 && p - arr[idx - 1] > 1) {
                                        acc.push("...");
                                    }
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, idx) =>
                                    p === "..." ? (
                                        <span key={`dots-iv-${idx}`} className="px-1 text-slate-400">...</span>
                                    ) : (
                                        <button
                                            key={p}
                                            onClick={() => setCurrentPage(p)}
                                            className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center transition cursor-pointer ${
                                                currentPage === p
                                                    ? "bg-violet-600 text-white shadow-xs"
                                                    : "border border-slate-200 hover:bg-white text-slate-600"
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    )
                                )}

                            <button
                                onClick={() => setCurrentPage((p) => Math.min(totalInterviewPages, p + 1))}
                                disabled={currentPage >= totalInterviewPages}
                                className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                title="Next Page"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <span>Show</span>
                            <div className="relative">
                                <select
                                    value={pageSize}
                                    onChange={(e) => setPageSize(Number(e.target.value))}
                                    className="appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-7 font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer shadow-xs"
                                >
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                </select>
                            </div>
                            <span>per page</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Generate Interview Link & Schedule Candidate */}
            {isGenerateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-base">
                                        {generatedPortalData ? "Candidate Portal Link Ready!" : "Generate AI Interview Link"}
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        {generatedPortalData
                                            ? "Candidate transferred to AI Video Interviews. Share live link with candidate."
                                            : "Schedule assessment date & generate personalized candidate portal link."}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setIsGenerateModalOpen(false);
                                    setGeneratedPortalData(null);
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {generatedPortalData ? (
                            <div className="space-y-4 text-xs sm:text-sm animate-in zoom-in-95">
                                <div className="p-4 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center gap-3 text-emerald-800 font-medium">
                                    <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                                    <span>Interview scheduled &amp; candidate transferred to AI Video Interviews!</span>
                                </div>

                                {/* Candidate Portal Link Box */}
                                <div className="p-4 bg-violet-50/70 border border-violet-200 rounded-2xl space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-violet-900 flex items-center gap-1.5">
                                            <ExternalLink className="w-3.5 h-3.5 text-violet-600" />
                                            <span>Candidate Portal Access URL</span>
                                        </span>
                                        <span className="font-mono text-[11px] bg-white text-violet-700 font-bold px-2 py-0.5 rounded-md border border-violet-200">
                                            Code: {generatedPortalData.linkCode}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={`${window.location.origin}/i/${generatedPortalData.linkCode}`}
                                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 select-all font-semibold"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleCopyLink(generatedPortalData.linkCode, generatedPortalData.id)}
                                            className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition shadow-2xs cursor-pointer shrink-0"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy Link</span>
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] border-t border-violet-100">
                                        <div>
                                            <span className="text-slate-400 block">Candidate Email:</span>
                                            <span className="font-semibold text-slate-800 truncate block">{generatedPortalData.email}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 block">Schedule:</span>
                                            <span className="font-semibold text-violet-700 block">{generatedPortalData.date} · {generatedPortalData.time}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="space-y-2 pt-1">
                                    <button
                                        onClick={() => {
                                            setIsGenerateModalOpen(false);
                                            setGeneratedPortalData(null);
                                            handleTabChange("interviews");
                                        }}
                                        className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-violet-500/25 transition active:scale-[0.98] cursor-pointer"
                                    >
                                        <Video className="w-4 h-4" />
                                        <span>View in AI Video Interviews (Tab 2) &rarr;</span>
                                    </button>

                                    <div className="grid grid-cols-2 gap-2.5">
                                        <a
                                            href={`/i/${generatedPortalData.linkCode}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="py-2.5 px-3 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center gap-1.5 transition text-center"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>Test Live Portal</span>
                                        </a>

                                        <Link
                                            to={`/app/email?candidateEmail=${encodeURIComponent(generatedPortalData.email || "")}&interviewCode=${generatedPortalData.linkCode}&role=${encodeURIComponent(generatedPortalData.role || "")}`}
                                            className="py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center gap-1.5 transition text-center"
                                        >
                                            <Mail className="w-3.5 h-3.5" />
                                            <span>Email Candidate</span>
                                        </Link>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsGenerateModalOpen(false);
                                            setGeneratedPortalData(null);
                                        }}
                                        className="w-full py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition cursor-pointer"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleCreateInterviewLink} className="space-y-4 text-xs sm:text-sm">
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Candidate Full Name *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Ananya Rao"
                                        value={newCandidateName}
                                        onChange={(e) => setNewCandidateName(e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Candidate Email Address *</label>
                                        <input
                                            type="email"
                                            required
                                            placeholder="e.g. ananya.rao@example.com"
                                            value={newCandidateEmail}
                                            onChange={(e) => setNewCandidateEmail(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Phone Number (Resume)</label>
                                        <input
                                            type="tel"
                                            placeholder="e.g. +91-xxxxxxxxxx"
                                            value={newCandidatePhone}
                                            onChange={(e) => setNewCandidatePhone(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800 font-mono"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Target Job Role</label>
                                        <select
                                            value={newRole}
                                            onChange={(e) => setNewRole(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800 cursor-pointer"
                                        >
                                            <option>Software Engineer</option>
                                            <option>Frontend Developer</option>
                                            <option>Backend Developer</option>
                                            <option>Full Stack Developer</option>
                                            <option>Python / AI Engineer</option>
                                            <option>UI/UX Designer</option>
                                            <option>DevOps Engineer</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Link Duration</label>
                                        <select
                                            value={newValidity}
                                            onChange={(e) => setNewValidity(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800 cursor-pointer"
                                        >
                                            <option>15 Minutes</option>
                                            <option>30 Minutes</option>
                                            <option>45 Minutes</option>
                                            <option>60 Minutes</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Interview Date *</label>
                                        <input
                                            type="date"
                                            required
                                            value={newDate}
                                            onChange={(e) => setNewDate(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Interview Time *</label>
                                        <input
                                            type="time"
                                            required
                                            value={newTime}
                                            onChange={(e) => setNewTime(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800"
                                        />
                                    </div>
                                </div>

                                {/* Preview Card */}
                                <div className="p-4 bg-violet-50/80 border border-violet-200 rounded-2xl space-y-2 shadow-2xs">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-violet-900 flex items-center gap-1.5">
                                            <ExternalLink className="w-3.5 h-3.5 text-violet-600" />
                                            <span>Candidate Portal Preview</span>
                                        </span>
                                        <span className="font-mono text-[11px] bg-white text-violet-700 font-bold px-2 py-0.5 rounded-md border border-violet-200">
                                            Code: {previewLinkCode}
                                        </span>
                                    </div>
                                    <p className="font-mono text-slate-700 bg-white p-2 rounded-lg border border-slate-200 text-xs truncate">
                                        {window.location.origin}/i/{previewLinkCode}
                                    </p>
                                </div>

                                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsGenerateModalOpen(false)}
                                        className="px-5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-violet-500/20 transition active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        <span>Generate Link &amp; Schedule</span>
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Modal: View Interview Details */}
            {selectedInterviewForView && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900 text-base">Interview Session Details</h3>
                            <button
                                onClick={() => setSelectedInterviewForView(null)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs sm:text-sm">
                            <div className="flex items-center gap-3.5 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <img
                                    src={selectedInterviewForView.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150"}
                                    alt={selectedInterviewForView.name}
                                    className="w-12 h-12 rounded-full object-cover border border-slate-200"
                                />
                                <div>
                                    <div className="font-bold text-slate-900 text-sm">{selectedInterviewForView.name}</div>
                                    <div className="text-slate-500 text-xs">{selectedInterviewForView.email}</div>
                                    <div className="text-violet-600 font-semibold text-xs mt-0.5">{selectedInterviewForView.role}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-3 bg-slate-50 rounded-xl">
                                    <span className="text-slate-400 block text-[11px]">Schedule Date</span>
                                    <span className="font-bold text-slate-800">{selectedInterviewForView.date}</span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl">
                                    <span className="text-slate-400 block text-[11px]">Time &amp; Zone</span>
                                    <span className="font-bold text-slate-800">{selectedInterviewForView.time} (IST)</span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl">
                                    <span className="text-slate-400 block text-[11px]">Link Code</span>
                                    <span className="font-mono font-bold text-violet-700">{selectedInterviewForView.linkCode}</span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl">
                                    <span className="text-slate-400 block text-[11px]">Status</span>
                                    <div className="mt-0.5">{getStatusPill(selectedInterviewForView.status)}</div>
                                </div>
                            </div>

                            <div className="pt-2 flex gap-2">
                                <a
                                    href={`/i/${selectedInterviewForView.linkCode}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Open Live Portal</span>
                                </a>
                                <button
                                    onClick={() => handleCopyLink(selectedInterviewForView.linkCode, selectedInterviewForView.id)}
                                    className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Interviews;
