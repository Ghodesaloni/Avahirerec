import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
    Users,
    Video,
    Sparkles,
    Copy,
    ExternalLink,
    Mail,
    Phone,
    Plus,
    X,
    ShieldCheck,
    ArrowRight,
    CheckCircle2,
    UserCheck,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { getStoredInterviews, saveInterviews, addOrUpdateInterview } from "@/utils/interviewStore";
import { interviewsApi, candidatesApi, resumesApi, jobsApi } from "@/services/api";

const Interviewee = () => {
    const navigate = useNavigate();

    // Core Data States
    const [candidates, setCandidates] = useState([]);
    const [resumes, setResumes] = useState([]);
    const [interviews, setInterviews] = useState(getStoredInterviews);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);

    // Pagination
    const [pageSize, setPageSize] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    // Copy Feedback State
    const [copiedId, setCopiedId] = useState(null);

    // Scheduling Modal State
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [selectedCandidateForSchedule, setSelectedCandidateForSchedule] = useState(null);
    const [generatedLinkData, setGeneratedLinkData] = useState(null);

    // Form inputs inside modal
    const [formCandidateName, setFormCandidateName] = useState("");
    const [formCandidateEmail, setFormCandidateEmail] = useState("");
    const [formCandidatePhone, setFormCandidatePhone] = useState("");
    const [formCandidateRole, setFormCandidateRole] = useState("Software Engineer");
    const [formCandidateId, setFormCandidateId] = useState("");
    const [formResumeId, setFormResumeId] = useState("");
    const [formInterviewDate, setFormInterviewDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split("T")[0];
    });
    const [formInterviewTime, setFormInterviewTime] = useState("11:00");
    const [formDuration, setFormDuration] = useState("45 Minutes");
    const [formLinkCode, setFormLinkCode] = useState(() => "ava" + Math.floor(100 + Math.random() * 900));

    // Fetch and sync data
    const loadAllData = async () => {
        setLoading(true);
        try {
            const [candList, resList, ivList, jobsList] = await Promise.all([
                candidatesApi.getAll().catch(() => []),
                resumesApi.getAll().catch(() => []),
                interviewsApi.getAll().catch(() => null),
                jobsApi.getAll().catch(() => [])
            ]);

            if (Array.isArray(candList)) {
                setCandidates(candList);
            }
            if (Array.isArray(resList)) {
                setResumes(resList);
            }
            if (Array.isArray(jobsList)) {
                setJobs(jobsList);
            }

            if (ivList && Array.isArray(ivList)) {
                setInterviews(ivList);
                saveInterviews(ivList);
            } else {
                setInterviews(getStoredInterviews());
            }
        } catch (err) {
            console.error("Failed to load data in Interviewee page:", err);
            setInterviews(getStoredInterviews());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAllData();

        const handleSync = () => {
            loadAllData();
        };
        window.addEventListener("avahire_interviews_updated", handleSync);
        window.addEventListener("avahire_candidates_updated", handleSync);
        window.addEventListener("avahire_resumes_updated", handleSync);
        return () => {
            window.removeEventListener("avahire_interviews_updated", handleSync);
            window.removeEventListener("avahire_candidates_updated", handleSync);
            window.removeEventListener("avahire_resumes_updated", handleSync);
        };
    }, []);

    // Helper to find interview session for a candidate
    const getCandidateInterview = (cand) => {
        if (!cand) return null;
        return interviews.find((iv) => {
            const sameEmail = iv.email && cand.email && iv.email.toLowerCase().trim() === cand.email.toLowerCase().trim();
            const sameId = (iv.candidateId && iv.candidateId === cand.id) || (iv.resumeId && iv.resumeId === cand.id) || iv.id === cand.interviewId;
            return sameEmail || sameId;
        });
    };

    // Combine & Normalize all Shortlisted Candidates from Candidates table + Resumes table
    const allShortlistedList = useMemo(() => {
        const map = new Map();

        // 1. Process Resumes FIRST to prioritize all Shortlisted Resumes from Resume screening
        resumes.forEach((r) => {
            const statusStr = (r.status || "").toLowerCase().trim();
            const isShortlisted =
                statusStr === "shortlisted" ||
                statusStr === "interview scheduled" ||
                r.isShortlisted === true ||
                (typeof r.matchScore === "number" && r.matchScore >= 80) ||
                (typeof r.score === "number" && r.score >= 80);

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
                    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(r.name || "Res")}`,
                    source: "Resume Screening",
                    isResumeShortlisted: true
                });
            }
        });

        // 2. From Candidates API: include candidates only if genuinely Shortlisted and not already present
        candidates.forEach((c) => {
            const statusStr = (c.status || "").toLowerCase().trim();
            const stageStr = (c.stage || "").toLowerCase().trim();
            const isShortlisted =
                statusStr === "shortlisted" ||
                stageStr === "shortlisted" ||
                statusStr === "interview scheduled" ||
                statusStr === "screened";

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
                        status: c.status || "Shortlisted",
                        appliedDate: c.appliedDate || c.date || "Recent",
                        avatar: c.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(c.name || "Cand")}`,
                        source: "Candidate Pipeline"
                    });
                }
            }
        });

        // Fallback demo candidates ONLY if database has completely 0 candidates and resumes
        if (map.size === 0) {
            const defaults = [
                {
                    id: "cand-demo-1",
                    name: "Ananya Sharma",
                    email: "ananya.sharma@example.com",
                    phone: "+91 98765 43210",
                    role: "Frontend Engineer",
                    department: "Engineering",
                    score: 95,
                    skills: ["React.js", "Next.js", "Tailwind CSS", "TypeScript"],
                    experience: "4 Years",
                    location: "Bengaluru, India",
                    status: "Shortlisted",
                    appliedDate: "Today",
                    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150",
                    source: "AI Resume Match"
                },
                {
                    id: "cand-demo-2",
                    name: "Rohan Varma",
                    email: "rohan.varma@example.com",
                    phone: "+91 91234 56789",
                    role: "Full Stack Developer",
                    department: "Engineering",
                    score: 92,
                    skills: ["Node.js", "React", "PostgreSQL", "AWS"],
                    experience: "5 Years",
                    location: "Pune, India",
                    status: "Shortlisted",
                    appliedDate: "Yesterday",
                    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150",
                    source: "AI Resume Match"
                },
                {
                    id: "cand-demo-3",
                    name: "Priyanka Patel",
                    email: "priyanka.patel@example.com",
                    phone: "+91 99887 76655",
                    role: "Python / AI Engineer",
                    department: "AI & ML",
                    score: 89,
                    skills: ["Python", "FastAPI", "OpenAI", "PyTorch"],
                    experience: "3.5 Years",
                    location: "Hyderabad, India",
                    status: "Shortlisted",
                    appliedDate: "2 days ago",
                    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150",
                    source: "AI Resume Match"
                }
            ];
            defaults.forEach((d) => map.set(d.id, d));
        }

        return Array.from(map.values());
    }, [candidates, resumes]);

    // Filter to candidates who should be shown in Shortlisted Interviewees.
    // All shortlisted resumes from the resume screening are always visible!
    const shortlistedCandidatesOnly = useMemo(() => {
        return allShortlistedList
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
            .filter((cand) => {
                // All shortlisted resumes from the resume page must be visible!
                if (cand.isResumeShortlisted || cand.source === "Resume Screening") {
                    return true;
                }
                return !cand.hasGeneratedLink;
            })
            .sort((a, b) => (b.score || 0) - (a.score || 0));
    }, [allShortlistedList, interviews]);

    const totalPages = Math.max(1, Math.ceil(shortlistedCandidatesOnly.length / pageSize));

    const paginatedCandidates = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return shortlistedCandidatesOnly.slice(startIndex, startIndex + pageSize);
    }, [shortlistedCandidatesOnly, currentPage, pageSize]);

    useEffect(() => {
        setCurrentPage(1);
    }, [pageSize]);

    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    // Open Schedule Modal for a candidate
    const handleOpenScheduleModal = (cand) => {
        setSelectedCandidateForSchedule(cand);
        setFormCandidateName(cand?.name || "");
        setFormCandidateEmail(cand?.email || "");
        setFormCandidatePhone(cand?.phone || "");
        setFormCandidateRole(cand?.role || "Software Engineer");
        setFormCandidateId(cand?.id || "");
        setFormResumeId(cand?.id || "");
        setFormLinkCode("ava" + Math.floor(100 + Math.random() * 900));
        setGeneratedLinkData(null);
        setIsScheduleModalOpen(true);
    };

    // Copy link helper
    const handleCopyLink = (code, id) => {
        const portalUrl = `${window.location.origin}/i/${code}`;
        navigator.clipboard?.writeText(portalUrl);
        setCopiedId(id || code);
        toast.success(`Candidate Portal link copied: ${portalUrl}`);
        setTimeout(() => setCopiedId(null), 2500);
    };

    // Handle Form Submission: Generate Link, Schedule & Transfer to AI Video Interviews
    const handleGenerateAndSchedule = (e) => {
        e.preventDefault();

        if (!formCandidateName.trim() || !formCandidateEmail.trim()) {
            toast.error("Please fill in candidate name and email address.");
            return;
        }

        const dateObj = new Date(formInterviewDate);
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

        const formattedTime = formInterviewTime
            ? (formInterviewTime.includes(":") ? (formInterviewTime.includes("M") ? formInterviewTime : `${formInterviewTime} AM`) : `${formInterviewTime}:00 AM`)
            : "11:00 AM";

        const newSession = {
            id: `iv-${Date.now()}`,
            candidateId: formCandidateId || `cand-${Date.now()}`,
            resumeId: formResumeId || formCandidateId || `res-${Date.now()}`,
            name: formCandidateName.trim(),
            email: formCandidateEmail.trim().toLowerCase(),
            phone: formCandidatePhone.trim() || "",
            avatar: selectedCandidateForSchedule?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(formCandidateName)}`,
            role: formCandidateRole || "Software Engineer",
            company: "AvaHire Technologies Pvt. Ltd.",
            date: formattedDate,
            dayOfWeek: dayName,
            time: formattedTime,
            timeZone: "IST",
            duration: formDuration || "45 Minutes",
            linkCode: formLinkCode || ("ava" + Math.floor(100 + Math.random() * 900)),
            status: "Scheduled",
            expiry: "Not started",
            expiryTime: `${formattedDate}, ${formattedTime}`,
            isExpired: false,
            score: selectedCandidateForSchedule?.score || 90,
            skills: selectedCandidateForSchedule?.skills || ["React", "Node.js"]
        };

        // 1. Add to Interview Store & Local Storage
        const updatedSession = addOrUpdateInterview(newSession);
        setInterviews((prev) => [updatedSession, ...prev.filter((x) => x.id !== updatedSession.id)]);

        // 2. Sync to Backend API
        interviewsApi.create(newSession).catch((err) => {
            console.warn("Interview create API fallback:", err);
        });

        // 3. Update candidate status to 'Interview Scheduled' in candidates API
        if (formCandidateId) {
            candidatesApi.update(formCandidateId, {
                status: "Interview Scheduled",
                interviewId: newSession.id,
                interviewDate: formattedDate,
                interviewTime: formattedTime,
                linkCode: newSession.linkCode
            }).catch(() => { });
        }

        // Set state for generated result modal
        setGeneratedLinkData(newSession);
        handleCopyLink(newSession.linkCode, newSession.id);

        toast.success(`Candidate interview scheduled! Transferred to AI Video Interviews.`);
    };

    // Navigate and transfer to AI Video Interviews page
    const handleTransferToAiInterviews = () => {
        setIsScheduleModalOpen(false);
        navigate("/app/interviews");
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto -mt-2" data-testid="interviewee-page">
            {/* Top Navigation Tabs Header: Switch between Shortlisted Interviewees & AI Video Interviews */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-violet-500/25">
                            <UserCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                <span>Shortlisted Interviewees</span>
                            </h1>
                        </div>
                    </div>
                </div>

                {/* Switcher Navigation Pill */}
                <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-2xl shadow-inner border border-slate-300/40">
                    <button
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-violet-700 shadow-xs border border-slate-200/80 transition cursor-default"
                    >
                        <Users className="w-3.5 h-3.5 text-violet-600" />
                        <span>1. Shortlisted Interviewees</span>
                    </button>
                    <Link
                        to="/app/interviews"
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/60 transition"
                    >
                        <Video className="w-3.5 h-3.5 text-slate-500" />
                        <span>2. AI Video Interviews</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                    </Link>
                </div>
            </div>

            {/* Shortlisted Candidates Table */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
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
                            {shortlistedCandidatesOnly.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="py-16 text-center text-slate-400">
                                        <div className="max-w-md mx-auto space-y-3">
                                            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                                                <CheckCircle2 className="w-6 h-6" />
                                            </div>
                                            <div className="font-bold text-slate-800 text-sm">All shortlisted candidates scheduled!</div>
                                            <p className="text-xs text-slate-500 leading-relaxed">
                                                All candidate interview links have been generated and transferred to the <strong>AI Video Interviews</strong> page.
                                            </p>
                                            <div className="pt-2">
                                                <Link
                                                    to="/app/interviews"
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
                                                >
                                                    <Video className="w-3.5 h-3.5" />
                                                    <span>Go to AI Video Interviews</span>
                                                </Link>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedCandidates.map((cand) => {
                                    return (
                                        <tr
                                            key={cand.id}
                                            className="hover:bg-slate-50/60 transition-colors group"
                                        >
                                            {/* Column 1: Candidate Info */}
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-3.5">
                                                    <img
                                                        src={cand.avatar}
                                                        alt={cand.name}
                                                        className="w-10 h-10 rounded-2xl object-cover border border-slate-200 shrink-0 shadow-2xs"
                                                    />
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

                                            {/* Column 5: Status */}
                                            <td className="py-4 px-6">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                    <span>Ready to Schedule</span>
                                                </span>
                                            </td>

                                            {/* Column 6: Action */}
                                            <td className="py-4 px-6 text-right">
                                                <button
                                                    onClick={() => handleOpenScheduleModal(cand)}
                                                    className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-violet-500/20 transition active:scale-95 flex items-center gap-1.5 cursor-pointer ml-auto"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    <span>Generate Link</span>
                                                </button>
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
                                                ? "bg-violet-600 text-white shadow-xs"
                                                : "border border-slate-200 hover:bg-white text-slate-600"
                                        }`}
                                    >
                                        {p}
                                    </button>
                                )
                            )}

                        <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage >= totalPages}
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

            {/* MODAL: Generate Link & Schedule Interview */}
            {isScheduleModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-violet-500/20">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-base">
                                        {generatedLinkData ? "Candidate Portal Link Generated!" : "Generate Link & Schedule Interview"}
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        {generatedLinkData
                                            ? "Candidate is now transferred to AI Video Interviews page."
                                            : "Configure assessment timing and generate candidate access credentials."}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setIsScheduleModalOpen(false);
                                    setGeneratedLinkData(null);
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {generatedLinkData ? (
                            /* Success / Transferred confirmation view */
                            <div className="space-y-4 text-xs sm:text-sm animate-in zoom-in-95">
                                <div className="p-4 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-start gap-3 text-emerald-900">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <div className="font-bold text-sm text-emerald-950">Interview Scheduled &amp; Candidate Transferred!</div>
                                        <p className="text-xs text-emerald-800">
                                            <strong>{generatedLinkData.name}</strong> has been transferred into the <strong>AI Video Interviews</strong> page. Candidate Portal link is active.
                                        </p>
                                    </div>
                                </div>

                                {/* Link Code Display Box */}
                                <div className="p-4 bg-violet-50/70 border border-violet-200 rounded-2xl space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-violet-950 flex items-center gap-1.5">
                                            <ExternalLink className="w-3.5 h-3.5 text-violet-600" />
                                            <span>Candidate Portal URL</span>
                                        </span>
                                        <span className="font-mono text-[11px] bg-white text-violet-700 font-bold px-2 py-0.5 rounded-md border border-violet-200">
                                            Code: {generatedLinkData.linkCode}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={`${window.location.origin}/i/${generatedLinkData.linkCode}`}
                                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 select-all font-semibold"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleCopyLink(generatedLinkData.linkCode, generatedLinkData.id)}
                                            className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition shadow-2xs cursor-pointer shrink-0"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy</span>
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] border-t border-violet-100">
                                        <div>
                                            <span className="text-slate-400 block">Candidate Email:</span>
                                            <span className="font-semibold text-slate-800 truncate block">{generatedLinkData.email}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 block">Interview Schedule:</span>
                                            <span className="font-semibold text-violet-800 block">{generatedLinkData.date} · {generatedLinkData.time}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="space-y-2 pt-2">
                                    <button
                                        onClick={handleTransferToAiInterviews}
                                        className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 transition active:scale-98 cursor-pointer"
                                    >
                                        <Video className="w-4 h-4" />
                                        <span>Go to AI Video Interviews (Current Page) &rarr;</span>
                                    </button>

                                    <div className="grid grid-cols-2 gap-2.5">
                                        <a
                                            href={`/i/${generatedLinkData.linkCode}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="py-2.5 px-3 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center gap-1.5 transition text-center"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>Test Live Portal</span>
                                        </a>

                                        <Link
                                            to={`/app/email?candidateEmail=${encodeURIComponent(generatedLinkData.email)}&interviewCode=${generatedLinkData.linkCode}&role=${encodeURIComponent(generatedLinkData.role)}`}
                                            className="py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center gap-1.5 transition text-center"
                                        >
                                            <Mail className="w-3.5 h-3.5" />
                                            <span>Email Invitation</span>
                                        </Link>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsScheduleModalOpen(false);
                                            setGeneratedLinkData(null);
                                        }}
                                        className="w-full py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition cursor-pointer"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Form to generate link */
                            <form onSubmit={handleGenerateAndSchedule} className="space-y-4 text-xs sm:text-sm">
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Candidate Full Name *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Snehal Harde"
                                        value={formCandidateName}
                                        onChange={(e) => setFormCandidateName(e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800 font-medium"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Candidate Email Address *</label>
                                        <input
                                            type="email"
                                            required
                                            placeholder="candidate@example.com"
                                            value={formCandidateEmail}
                                            onChange={(e) => setFormCandidateEmail(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800 font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Phone Number (Resume)</label>
                                        <input
                                            type="tel"
                                            placeholder="+91 98000 00000"
                                            value={formCandidatePhone}
                                            onChange={(e) => setFormCandidatePhone(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800 font-mono"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Target Job Role</label>
                                        <select
                                            value={formCandidateRole}
                                            onChange={(e) => setFormCandidateRole(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800 font-medium cursor-pointer"
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
                                        <label className="block font-bold text-slate-700 mb-1">Interview Duration</label>
                                        <select
                                            value={formDuration}
                                            onChange={(e) => setFormDuration(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800 font-medium cursor-pointer"
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
                                        <label className="block font-bold text-slate-700 mb-1">Interview Date</label>
                                        <input
                                            type="date"
                                            required
                                            value={formInterviewDate}
                                            onChange={(e) => setFormInterviewDate(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800 font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Interview Time</label>
                                        <input
                                            type="time"
                                            required
                                            value={formInterviewTime}
                                            onChange={(e) => setFormInterviewTime(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 text-slate-800 font-medium"
                                        />
                                    </div>
                                </div>

                                {/* Live preview code card */}
                                <div className="p-3.5 bg-violet-50/80 border border-violet-200 rounded-2xl space-y-1 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-violet-900 flex items-center gap-1.5">
                                            <ShieldCheck className="w-4 h-4 text-violet-600" />
                                            <span>Generated Candidate Portal URL Preview</span>
                                        </span>
                                        <span className="font-mono text-[10px] bg-white text-violet-700 font-bold px-2 py-0.5 rounded border border-violet-200">
                                            Code: {formLinkCode}
                                        </span>
                                    </div>
                                    <p className="font-mono text-slate-700 bg-white p-2 rounded-lg border border-slate-200 text-[11px] truncate">
                                        {window.location.origin}/i/{formLinkCode}
                                    </p>
                                    <p className="text-[10px] text-violet-700">
                                        Candidate will receive interactive video interview access with AI Avatar Ava.
                                    </p>
                                </div>

                                {/* Modal Actions */}
                                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsScheduleModalOpen(false)}
                                        className="px-5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-violet-500/20 transition active:scale-95 cursor-pointer flex items-center gap-2"
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
        </div>
    );
};

export default Interviewee;
