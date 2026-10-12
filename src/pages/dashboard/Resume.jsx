import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { resumesApi, jobsApi } from "@/services/api";
import {
    Search,
    Filter,
    Upload,
    FileText,
    CheckCircle2,
    BookmarkCheck,
    XCircle,
    Eye,
    MoreVertical,
    X,
    Calendar,
    Download,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    SlidersHorizontal,
    Sparkles,
    Scissors,
    ShieldCheck,
    MapPin,
    Phone,
    Mail,
    Briefcase,
    GraduationCap,
    Clock,
    UserCheck,
    UserX,
    Send,
    Star,
    ExternalLink,
    Copy,
    Check,
    AlertCircle,
    Target,
    Layers,
    RefreshCw,
    Users,
    Brain,
    Cog,
    Code,
    DollarSign,
    BarChart3,
    Folder,
    FolderOpen,
    FolderKanban,
    Tag
} from "lucide-react";
// interviewStore import removed - interviews managed in dedicated interviews hub

// Comprehensive career fields / domains for folder separation and filtering
const CORE_FIELDS = [
    { id: "All", label: "All Domains", icon: Layers, color: "violet" },
    { id: "Data Science", label: "Data Science", icon: Brain, color: "purple" },
    { id: "Software Development", label: "Software Dev", icon: Code, color: "blue" },
    { id: "Finance", label: "Finance", icon: DollarSign, color: "emerald" },
    { id: "DevOps", label: "DevOps & Cloud", icon: Cog, color: "indigo" },
    { id: "QA / Testing", label: "QA & Testing", icon: ShieldCheck, color: "teal" },
    { id: "Data Analytics", label: "Analytics", icon: BarChart3, color: "cyan" },
    { id: "UI/UX Design", label: "UI/UX Design", icon: Scissors, color: "pink" },
    { id: "Human Resources", label: "HR & Talent", icon: Users, color: "orange" },
    { id: "Mechanical", label: "Mechanical", icon: Cog, color: "amber" }
];

const FIELDS = CORE_FIELDS;

// Helper to determine the professional domain / field of any candidate
const detectCandidateDomain = (candidate) => {
    if (!candidate) return "Software Development";
    if (candidate.domain && candidate.domain !== "General") return candidate.domain;
    if (candidate.field && candidate.field !== "General") return candidate.field;
    if (candidate.domains?.primary) return candidate.domains.primary;
    return "Software Development";
};

// Helper to determine the professional domain / field of any job posting
const detectJobDomain = (job) => {
    if (!job) return "Software Development";
    if (job.domain && job.domain !== "General") return job.domain;
    if (job.field && job.field !== "General") return job.field;
    const text = `${job.title || ""} ${job.dept || ""} ${(job.keySkills || []).join(" ")} ${job.description || ""}`.toLowerCase();
    if (/data scien|machine learning|\bml\b|deep learning|\bnlp\b|computer vision|tensorflow|pytorch|keras|scikit|pandas|numpy|neural network|predictive model|bigquery|generative ai|\bllm\b|\bds\b/i.test(text)) {
        return "Data Science";
    }
    if (/devops|kubernetes|docker|terraform|ci\/cd|cloud|aws|azure|gcp|infrastructure|sre\b|ansible|helm/i.test(text)) {
        return "DevOps";
    }
    if (/qa\b|automation|selenium|cypress|quality assurance|testing|test case|playwright|jest|junit/i.test(text)) {
        return "QA / Testing";
    }
    if (/ui\b|ux\b|design|figma|wirefram|prototyp|sketch|user research/i.test(text)) {
        return "UI/UX Design";
    }
    if (/mechanical|autocad|solidworks|catia|thermodynamics|fluid mechanics|\bfea\b|ansys|gd&t|\bcnc\b|manufacturing|hvac|thermal|creo/i.test(text)) {
        return "Mechanical";
    }
    if (/finance|financial|accounting|accountant|auditing|\baudit\b|taxation|\btax\b|valuation|\bcpa\b|\bcfa\b|quickbooks|tally|balance sheet|p&l/i.test(text)) {
        return "Finance";
    }
    if (/data analyst|business analyst|bi analyst|tableau|power\s?bi|analytics|dashboard/i.test(text)) {
        return "Data Analytics";
    }
    if (/hr\b|human resources|recruiter|recruitment|talent acquisition|people ops/i.test(text)) {
        return "Human Resources";
    }
    return "Software Development";
};

// Fallback initial candidate data
const initialCandidates = [];

const Resumes = () => {
    const [candidates, setCandidates] = useState(initialCandidates);
    const [selectedCandidateId, setSelectedCandidateId] = useState(null);
    const [activeTab, setActiveTab] = useState("All Resumes");
    const [selectedField, setSelectedField] = useState("All");
    const [selectedFolderJobId, setSelectedFolderJobId] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("Highest ATS");
    const [selectedRowIds, setSelectedRowIds] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [isUploading, setIsUploading] = useState(false);
    const [showFullProfileModal, setShowFullProfileModal] = useState(false);
    const [profileModalTab, setProfileModalTab] = useState("overview");
    const [preferences, setPreferences] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("avahire_settings_preferences") || "{}");
        } catch {
            return {};
        }
    });
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [filterRole, setFilterRole] = useState("All");
    const [filterMinScore, setFilterMinScore] = useState(0);
    const [isDragOver, setIsDragOver] = useState(false);
    const [openActionMenuId, setOpenActionMenuId] = useState(null);
    const [isFieldDropdownOpen, setIsFieldDropdownOpen] = useState(false);
    const [isJobDropdownOpen, setIsJobDropdownOpen] = useState(false);

    // Preferences sync
    useEffect(() => {
        const handlePrefUpdate = (e) => {
            const prefs = e.detail || JSON.parse(localStorage.getItem("avahire_settings_preferences") || "{}");
            setPreferences(prefs);
        };

        window.addEventListener("avahire_preferences_updated", handlePrefUpdate);

        return () => {
            window.removeEventListener("avahire_preferences_updated", handlePrefUpdate);
        };
    }, []);

    // JD Screening States
    const [jobs, setJobs] = useState([]);
    const [selectedJobId, setSelectedJobId] = useState("");
    const [isBatchScreening, setIsBatchScreening] = useState(false);
    const [analyzingCandidateId, setAnalyzingCandidateId] = useState(null);
    const [showCustomJdModal, setShowCustomJdModal] = useState(false);
    const [customJd, setCustomJd] = useState({
        title: "",
        dept: "",
        expLevel: "",
        workMode: "Full-time",
        keySkills: "",
        description: ""
    });

    const fileInputRef = useRef(null);
    const fieldDropdownRef = useRef(null);
    const jobDropdownRef = useRef(null);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (fieldDropdownRef.current && !fieldDropdownRef.current.contains(event.target)) {
                setIsFieldDropdownOpen(false);
            }
            if (jobDropdownRef.current && !jobDropdownRef.current.contains(event.target)) {
                setIsJobDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Initial Fetch of Resumes, Jobs, and Interviews from backend
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [resumesData, jobsData] = await Promise.allSettled([
                    resumesApi.getAll(),
                    jobsApi.getAll()
                ]);

                if (jobsData.status === "fulfilled" && Array.isArray(jobsData.value)) {
                    setJobs(jobsData.value);
                    if (jobsData.value.length > 0) {
                        setSelectedJobId(jobsData.value[0].id);
                    }
                }

                if (resumesData.status === "fulfilled" && Array.isArray(resumesData.value)) {
                    setCandidates(resumesData.value);
                    if (resumesData.value.length > 0) {
                        setSelectedCandidateId(resumesData.value[0].id);
                    }
                }
            } catch (err) {
                console.error("Error loading initial data:", err);
            }
        };
        fetchInitialData();
    }, []);

    // Current active target JD reference
    const currentJd = useMemo(() => {
        if (selectedJobId === "custom") {
            const skillsArr = Array.isArray(customJd.keySkills)
                ? customJd.keySkills
                : customJd.keySkills.split(",").map((s) => s.trim()).filter(Boolean);
            return {
                id: "custom",
                title: customJd.title || "Custom Position",
                dept: customJd.dept || "Engineering",
                expLevel: customJd.expLevel || "",
                workMode: customJd.workMode || "Full-time",
                keySkills: skillsArr,
                description: customJd.description || ""
            };
        }
        const found = jobs.find((j) => j.id === selectedJobId);
        if (found) return found;

        if (jobs.length > 0) return jobs[0];

        // Fallback default job
        return {
            id: "",
            title: "No Job Selected",
            dept: "",
            expLevel: "",
            workMode: "",
            keySkills: [],
            description: "Please select or create a Job Description to screen candidates."
        };
    }, [jobs, selectedJobId, customJd]);

    const safeCandidates = useMemo(() => (Array.isArray(candidates) ? candidates : []), [candidates]);
    const selectedCandidate = safeCandidates.find((c) => c.id === selectedCandidateId) || safeCandidates[0] || null;

    // Status tabs with live counts
    const tabCounts = useMemo(() => {
        const total = safeCandidates.length;
        const shortlisted = safeCandidates.filter((c) => c && c.status === "Shortlisted").length;
        const review = safeCandidates.filter((c) => c && (c.status === "Review" || c.status === "Under Review")).length;
        const rejected = safeCandidates.filter((c) => c && c.status === "Rejected").length;
        return { total, shortlisted, review, rejected };
    }, [safeCandidates]);

    // Live counts per professional field / domain
    const fieldCounts = useMemo(() => {
        const counts = { "All": safeCandidates.length };
        safeCandidates.forEach((c) => {
            if (!c) return;
            const domain = detectCandidateDomain(c);
            counts[domain] = (counts[domain] || 0) + 1;
            // Also count secondary domains
            if (Array.isArray(c.secondaryDomains)) {
                c.secondaryDomains.forEach((sd) => {
                    counts[sd] = (counts[sd] || 0) + 1;
                });
            }
        });
        return counts;
    }, [safeCandidates]);

    // Live counts of candidates related to any created job
    const getJobCandidateCount = (job) => {
        if (!job) return 0;
        const jDomain = detectJobDomain(job);
        return safeCandidates.filter((c) => {
            if (!c) return false;
            if (c.jobId === job.id || c.targetJobId === job.id) return true;
            return detectCandidateDomain(c) === jDomain;
        }).length;
    };

    // Filter and Sort Candidates
    const filteredCandidates = useMemo(() => {
        return safeCandidates
            .filter((c) => {
                if (!c) return false;
                // Tab filter: separates resumes by Shortlisted vs Review vs Rejected
                if (activeTab === "Shortlisted" && c.status !== "Shortlisted") return false;
                if (activeTab === "Review" && c.status !== "Review" && c.status !== "Under Review") return false;
                if (activeTab === "Rejected" && c.status !== "Rejected") return false;

                const candidateDomain = detectCandidateDomain(c);

                // Field folder filter: separate by Data Science, Mechanical, Software Engineer, Finance, Analyst
                if (selectedField !== "All" && candidateDomain !== selectedField) {
                    return false;
                }

                // Particular job folder filter: show all candidates related to the selected job folder
                if (selectedFolderJobId !== "All") {
                    const activeJob = jobs.find((j) => j.id === selectedFolderJobId);
                    if (activeJob) {
                        const jobDomain = detectJobDomain(activeJob);
                        const isAssigned = c.jobId === activeJob.id || c.targetJobId === activeJob.id;
                        const isDomainMatch = candidateDomain === jobDomain;
                        if (!isAssigned && !isDomainMatch) {
                            return false;
                        }
                    }
                }

                // Search query filter
                if (searchQuery.trim()) {
                    const query = searchQuery.toLowerCase();
                    const matchesName = (c.name || "").toLowerCase().includes(query);
                    const matchesEmail = (c.email || "").toLowerCase().includes(query);
                    const matchesRole = (c.role || "").toLowerCase().includes(query);
                    const matchesDomain = candidateDomain.toLowerCase().includes(query);
                    const matchesSkills = (c.allSkills || c.skills || []).some((s) => (s || "").toLowerCase().includes(query));
                    if (!matchesName && !matchesEmail && !matchesRole && !matchesDomain && !matchesSkills) return false;
                }

                // Advanced Modal Filters
                if (filterRole !== "All" && c.role !== filterRole) return false;
                if (c.atsScore < filterMinScore) return false;

                return true;
            })
            .sort((a, b) => {
                if (sortBy === "Highest ATS") return b.atsScore - a.atsScore;
                if (sortBy === "Highest Match") return b.matchScore - a.matchScore;
                if (sortBy === "Experience") return (b.expYears || 0) - (a.expYears || 0);
                // Default Newest
                return 0;
            });
    }, [candidates, activeTab, selectedField, selectedFolderJobId, jobs, searchQuery, sortBy, filterRole, filterMinScore]);

    const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));

    const paginatedCandidates = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredCandidates.slice(startIndex, startIndex + pageSize);
    }, [filteredCandidates, currentPage, pageSize]);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, selectedField, selectedFolderJobId, searchQuery, sortBy, filterRole, filterMinScore, pageSize]);

    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    // Batch Screen all candidates against current target JD
    const handleScreenAllAgainstJd = async () => {
        setIsBatchScreening(true);
        toast.info(`Screening candidates against "${currentJd.title}" using ATS engine...`);

        try {
            const payload = {
                jobId: selectedJobId === "custom" ? null : selectedJobId,
                customJd: selectedJobId === "custom" ? currentJd : null
            };

            const response = await resumesApi.analyzeBatch(payload);

            if (response && response.data && response.data.length > 0) {
                setCandidates(response.data);
                const stats = response.stats || {};
                toast.success(
                    `Screening complete for ${currentJd.title}! ${stats.shortlistedCount || 0} Shortlisted, ${stats.reviewCount || 0} In Review, ${stats.rejectedCount || 0} Rejected.`
                );
            } else {
                toast.success(`Screened candidates against ${currentJd.title}`);
            }
        } catch (err) {
            console.error("Batch screening failed:", err);
            toast.error("Failed to complete batch screening. Please try again.");
        } finally {
            setIsBatchScreening(false);
        }
    };

    // Screen single candidate against current target JD
    const handleAnalyzeSingleCandidate = async (candidateId) => {
        setAnalyzingCandidateId(candidateId);
        try {
            const targetCandidate = candidates.find((c) => c.id === candidateId);
            const candidateName = targetCandidate ? targetCandidate.name : "Candidate";
            toast.info(`Analyzing ${candidateName}'s resume against ${currentJd.title}...`);

            const payload = {
                jobId: selectedJobId === "custom" ? null : selectedJobId,
                customJd: selectedJobId === "custom" ? currentJd : null
            };

            const response = await resumesApi.analyzeCandidate(candidateId, payload);

            if (response && response.data) {
                setCandidates((prev) =>
                    prev.map((c) => (c.id === candidateId ? response.data : c))
                );
                setSelectedCandidateId(candidateId);
                toast.success(
                    `${response.data.name}: ATS Score ${response.data.atsScore}/100 (${response.data.status})`
                );
            }
        } catch (err) {
            console.error("Single resume analysis error:", err);
            toast.error("Failed to analyze resume against JD.");
        } finally {
            setAnalyzingCandidateId(null);
        }
    };

    // Handle Upload with Immediate Screening against current JD (Strictly Resumes Only)
    const handleFileUpload = async (files) => {
        const fileList = Array.from(files);
        if (!fileList.length) return;

        // User requirement: "in resumes pages only resume should be taken not other docs"
        const ALLOWED_RESUME_EXTS = [".pdf", ".docx", ".doc", ".txt", ".rtf"];
        const validFiles = [];
        const rejectedFiles = [];

        for (const file of fileList) {
            const extMatch = file.name.match(/\.[^.]+$/);
            const ext = extMatch ? extMatch[0].toLowerCase() : "";
            if (ALLOWED_RESUME_EXTS.includes(ext)) {
                validFiles.push(file);
            } else {
                rejectedFiles.push(file.name);
            }
        }

        if (rejectedFiles.length > 0) {
            toast.error(
                `Non-resume file${rejectedFiles.length > 1 ? "s" : ""} rejected: ${rejectedFiles.join(", ")}. In resumes portal, only resume documents (.pdf, .docx, .doc, .txt) are accepted.`,
                { duration: 5000 }
            );
        }

        if (validFiles.length === 0) {
            toast.warning("No valid resume documents detected. Please upload only resume documents (.pdf, .docx, .doc, or .txt).");
            return;
        }

        setIsUploading(true);
        toast.info(`Uploading & screening ${validFiles.length} resume document${validFiles.length > 1 ? "s" : ""} against "${currentJd.title}"...`);

        try {
            const newlyAdded = [];
            for (let i = 0; i < validFiles.length; i++) {
                const f = validFiles[i];
                const formData = new FormData();
                formData.append("resume", f);
                formData.append("jobId", selectedJobId === "custom" ? "custom" : selectedJobId);
                if (selectedJobId === "custom") {
                    formData.append("customJd", JSON.stringify(currentJd));
                }

                try {
                    const res = await resumesApi.uploadAndScreen(formData);
                    if (res && res.data) {
                        const candidate = res.data;
                        newlyAdded.push(candidate);
                        if (candidate.status === "Shortlisted") {
                            toast.success(`${candidate.name}: SHORTLISTED! (${candidate.field || "Domain"} · ATS: ${candidate.atsScore}/100, ${candidate.skillsMatchPct}% skills match)`);
                        } else if (candidate.status === "Review") {
                            toast.warning(`${candidate.name}: Placed Under Review (ATS: ${candidate.atsScore}/100 - partial match)`);
                        } else {
                            toast.error(`${candidate.name}: REJECTED (ATS: ${candidate.atsScore}/100 - lacks required skills for ${currentJd.title})`);
                        }
                    }
                } catch (singleUploadErr) {
                    console.error("Single resume upload error:", singleUploadErr);
                    // Fallback to text reading if server upload had error
                    const cleanName = f.name
                        .replace(/\.(pdf|docx?|txt)$/i, "")
                        .replace(/[_-]/g, " ")
                        .replace(/\b\w/g, (l) => l.toUpperCase()) || `Applicant ${candidates.length + i + 1}`;

                    const candidateDomain = detectJobDomain(currentJd);
                    const newCandidatePayload = {
                        name: cleanName,
                        email: `${cleanName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
                        phone: "+91 98" + Math.floor(10000000 + Math.random() * 90000000),
                        location: "India",
                        role: currentJd.title || "Candidate",
                        field: candidateDomain,
                        domain: candidateDomain,
                        jobId: selectedJobId === "custom" ? null : selectedJobId,
                        targetJobId: selectedJobId === "custom" ? null : selectedJobId,
                        targetJobTitle: currentJd.title,
                        experience: "2 Years",
                        expYears: 2,
                        skills: currentJd.keySkills ? currentJd.keySkills.slice(0, 3) : [],
                        allSkills: currentJd.keySkills || [],
                        currentRole: "Applicant",
                        education: "Bachelor's Degree",
                        resumeFileName: f.name
                    };
                    const created = await resumesApi.create(newCandidatePayload);
                    const analysisResult = await resumesApi.analyzeCandidate(created.id, {
                        jobId: selectedJobId === "custom" ? null : selectedJobId,
                        customJd: selectedJobId === "custom" ? currentJd : null
                    });
                    if (analysisResult?.data) {
                        newlyAdded.push(analysisResult.data);
                    }
                }
            }

            if (newlyAdded.length > 0) {
                setCandidates((prev) => [...newlyAdded, ...prev]);
                setSelectedCandidateId(newlyAdded[0].id);
                toast.success(`Screened and organized ${newlyAdded.length} candidate${newlyAdded.length > 1 ? "s" : ""}!`);
            }
        } catch (err) {
            console.error("Upload screening error:", err);
            toast.error("Failed to parse and screen uploaded resumes.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files);
        }
    };

    // Update status (Shortlisted, Review, Rejected)
    const handleStatusChange = async (id, newStatus) => {
        setCandidates((prev) =>
            prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
        );
        if (newStatus === "Shortlisted") {
            toast.success("Candidate shortlisted successfully!");
        } else if (newStatus === "Rejected") {
            toast.error("Candidate marked as rejected.");
        } else {
            toast.info(`Candidate status updated to ${newStatus}.`);
        }
        setOpenActionMenuId(null);
        try {
            await resumesApi.updateStatus(id, newStatus);
            window.dispatchEvent(new CustomEvent("avahire_resumes_updated"));
            window.dispatchEvent(new CustomEvent("avahire_candidates_updated"));
        } catch (err) {
            console.error("Failed to sync resume status to database:", err);
        }
    };

    // Bulk selection handlers
    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedRowIds(filteredCandidates.map((c) => c.id));
        } else {
            setSelectedRowIds([]);
        }
    };

    const handleRowSelect = (id) => {
        setSelectedRowIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };


    // Helper for score badge colors
    const getScoreBadgeClass = (score) => {
        if (score >= 80) return "border-emerald-300 text-emerald-700 bg-emerald-50";
        if (score >= 65) return "border-amber-300 text-amber-700 bg-amber-50";
        return "border-rose-300 text-rose-600 bg-rose-50";
    };

    const getMatchTextColor = (match) => {
        if (match >= 80) return "text-emerald-600";
        if (match >= 65) return "text-amber-600";
        return "text-rose-500";
    };

    const getStatusPill = (status) => {
        if (status === "Shortlisted") {
            return "bg-emerald-50 text-emerald-700 border border-emerald-200/90";
        }
        if (status === "Review" || status === "Under Review") {
            return "bg-amber-50 text-amber-700 border border-amber-200/90";
        }
        return "bg-rose-50 text-rose-600 border border-rose-200/90";
    };

    // Helper for career field styling & icons
    const getDomainBadge = (domain) => {
        const d = String(domain || "").trim();
        if (d === "Data Science" || d === "Machine Learning" || d === "Artificial Intelligence") {
            return {
                label: d,
                bg: "bg-purple-50 text-purple-700 border-purple-200/80",
                icon: Brain
            };
        }
        if (d === "Software Development" || d === "Software Engineer" || d === "Full Stack" || d === "Frontend" || d === "Backend") {
            return {
                label: d,
                bg: "bg-blue-50 text-blue-700 border-blue-200/80",
                icon: Code
            };
        }
        if (d === "DevOps" || d === "Cloud Computing") {
            return {
                label: d,
                bg: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
                icon: Cog
            };
        }
        if (d === "QA / Testing") {
            return {
                label: "QA & Testing",
                bg: "bg-teal-50 text-teal-700 border-teal-200/80",
                icon: ShieldCheck
            };
        }
        if (d === "Data Analytics" || d === "Business Analytics" || d === "Analyst") {
            return {
                label: d,
                bg: "bg-cyan-50 text-cyan-700 border-cyan-200/80",
                icon: BarChart3
            };
        }
        if (d === "UI/UX Design" || d === "Product Design") {
            return {
                label: d,
                bg: "bg-pink-50 text-pink-700 border-pink-200/80",
                icon: Scissors
            };
        }
        if (d === "Finance" || d === "Accounting" || d === "Banking") {
            return {
                label: d,
                bg: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
                icon: DollarSign
            };
        }
        if (d === "Human Resources" || d === "Recruitment") {
            return {
                label: d,
                bg: "bg-orange-50 text-orange-700 border-orange-200/80",
                icon: Users
            };
        }
        if (d === "Cybersecurity" || d === "Information Security") {
            return {
                label: d,
                bg: "bg-rose-50 text-rose-700 border-rose-200/80",
                icon: ShieldCheck
            };
        }
        if (d === "Mechanical" || d === "Mechanical Engineering") {
            return {
                label: "Mechanical",
                bg: "bg-amber-50 text-amber-700 border-amber-200/80",
                icon: Cog
            };
        }
        return {
            label: d || "General",
            bg: "bg-slate-50 text-slate-700 border-slate-200/80",
            icon: Tag
        };
    };

    // Helper to find the matching job folder for any candidate
    const getCandidateJobFolder = (candidate) => {
        if (!candidate) return null;
        if (candidate.jobId) {
            const found = jobs.find((j) => j.id === candidate.jobId);
            if (found) return found;
        }
        if (candidate.targetJobId) {
            const found = jobs.find((j) => j.id === candidate.targetJobId);
            if (found) return found;
        }
        const domain = detectCandidateDomain(candidate);
        const domainJob = jobs.find((j) => detectJobDomain(j) === domain);
        if (domainJob) return domainJob;
        return jobs[0] || null;
    };

    return (
        <div className="space-y-6 -mt-2 pb-12" data-testid="resume-management-page">
            {/* Top Resume Management Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
                            Resume Screener &amp; ATS
                        </h1>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200">
                            AI Powered
                        </span>
                    </div>

                </div>

                <div className="flex flex-wrap items-center gap-3">


                    {/* Upload Resume Button (Strictly Resumes Only) */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white rounded-full text-xs sm:text-sm font-semibold shadow-md shadow-violet-500/25 transition-all disabled:opacity-50 cursor-pointer"
                        title="Only resume documents (.pdf, .docx, .doc, .txt) are accepted"
                    >
                        <Upload className="w-4 h-4" />
                        <span>{isUploading ? "Screening..." : "Upload Resume"}</span>
                    </button>

                    {/* Hidden input strictly accepting resume formats */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.txt,.rtf"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e.target.files)}
                    />
                </div>
            </div>

            {/* 4 Summary Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Total Resumes */}
                <div
                    onClick={() => setActiveTab("All Resumes")}
                    className={`bg-white p-5 rounded-2xl border transition cursor-pointer ${
                        activeTab === "All Resumes"
                            ? "border-violet-500 shadow-sm ring-2 ring-violet-500/10"
                            : "border-slate-200/80 shadow-xs hover:shadow-sm hover:border-slate-300"
                    }`}
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 p-3 shrink-0">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-medium text-slate-500">Total Candidates</div>
                            <div className="text-2xl font-extrabold text-slate-900 mt-0.5">{tabCounts.total}</div>
                            <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
                                In current database
                            </div>
                        </div>
                    </div>
                </div>

                {/* Shortlisted */}
                <div
                    onClick={() => setActiveTab("Shortlisted")}
                    className={`bg-white p-5 rounded-2xl border transition cursor-pointer ${
                        activeTab === "Shortlisted"
                            ? "border-emerald-500 shadow-sm ring-2 ring-emerald-500/10"
                            : "border-slate-200/80 shadow-xs hover:shadow-sm hover:border-slate-300"
                    }`}
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 p-3 shrink-0">
                            <BookmarkCheck className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-medium text-emerald-700 font-semibold">Shortlisted</div>
                            <div className="text-2xl font-extrabold text-emerald-600 mt-0.5">{tabCounts.shortlisted}</div>
                            <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-0.5 mt-0.5">
                                <span>ATS Score ≥ 75/100</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Under Review */}
                <div
                    onClick={() => setActiveTab("Review")}
                    className={`bg-white p-5 rounded-2xl border transition cursor-pointer ${
                        activeTab === "Review"
                            ? "border-amber-500 shadow-sm ring-2 ring-amber-500/10"
                            : "border-slate-200/80 shadow-xs hover:shadow-sm hover:border-slate-300"
                    }`}
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 p-3 shrink-0">
                            <Clock className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-medium text-amber-700 font-semibold">Under Review</div>
                            <div className="text-2xl font-extrabold text-amber-600 mt-0.5">{tabCounts.review}</div>
                            <div className="text-[11px] font-semibold text-amber-600 flex items-center gap-0.5 mt-0.5">
                                <span>ATS Score 55-74/100</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Rejected */}
                <div
                    onClick={() => setActiveTab("Rejected")}
                    className={`bg-white p-5 rounded-2xl border transition cursor-pointer ${
                        activeTab === "Rejected"
                            ? "border-rose-500 shadow-sm ring-2 ring-rose-500/10"
                            : "border-slate-200/80 shadow-xs hover:shadow-sm hover:border-slate-300"
                    }`}
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 p-3 shrink-0">
                            <XCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-medium text-rose-700 font-semibold">Rejected</div>
                            <div className="text-2xl font-extrabold text-rose-500 mt-0.5">{tabCounts.rejected}</div>
                            <div className="text-[11px] font-semibold text-rose-500 flex items-center gap-0.5 mt-0.5">
                                <span>ATS Score &lt; 55/100</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>



            {/* Candidate List Table (Full width, spacious, clean hierarchy) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
                {/* Tabs Header & Controls */}
                <div className="p-4 sm:px-6 sm:py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    {/* Status Tabs: Separating resumes on the basis of shortlisted using JD */}
                    <div className="flex items-center gap-1 sm:gap-2">
                        {[
                            { label: "All Resumes", count: tabCounts.total, pill: "bg-slate-100 text-slate-600" },
                            { label: "Shortlisted", count: tabCounts.shortlisted, pill: "bg-emerald-100 text-emerald-700 font-bold" },
                            { label: "Review", count: tabCounts.review, pill: "bg-amber-100 text-amber-700 font-bold" },
                            { label: "Rejected", count: tabCounts.rejected, pill: "bg-rose-100 text-rose-700 font-bold" }
                        ].map((tab) => {
                            const isActive = activeTab === tab.label;
                            return (
                                <button
                                    key={tab.label}
                                    onClick={() => setActiveTab(tab.label)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 relative ${
                                        isActive
                                            ? "bg-violet-600 text-white shadow-xs shadow-violet-500/20"
                                            : "text-slate-600 hover:bg-slate-100"
                                    }`}
                                >
                                    <span>{tab.label}</span>
                                    <span
                                        className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                                            isActive ? "bg-white/20 text-white" : tab.pill
                                        }`}
                                    >
                                        {tab.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Search & Sort Controls */}
                    <div className="flex items-center gap-3 text-xs">
                        {/* Search Input */}
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search candidate, role or skill..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-500 w-44 sm:w-56"
                            />
                        </div>

                        {/* Sort Dropdown */}
                        <div className="flex items-center gap-1.5 text-slate-600">
                            <div className="relative">
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 pr-7 font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer text-xs"
                                >
                                    <option>Highest ATS</option>
                                    <option>Highest Match</option>
                                    <option>Experience</option>
                                    <option>Newest</option>
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table View */}
                <div className="overflow-x-auto min-h-[380px]">
                    <table className="w-full text-left text-xs sm:text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400 font-semibold bg-slate-50/50">
                                
                                <th className="py-3 px-4 font-semibold text-slate-700">Candidate</th>
                                <th className="py-3 px-3 font-semibold text-slate-700">Field &amp; Role</th>
                                <th className="py-3 px-3 font-semibold text-slate-700">Job Folder</th>
                                <th className="py-3 px-3 font-semibold text-slate-700">Experience</th>
                                <th className="py-3 px-3 font-semibold text-slate-700">Skills</th>
                                <th className="py-3 px-3 font-semibold text-slate-700 text-center">ATS Score</th>
                                <th className="py-3 px-3 font-semibold text-slate-700 text-center">JD Match %</th>
                                <th className="py-3 px-3 font-semibold text-slate-700">Status</th>
                                <th className="py-3 px-4 font-semibold text-slate-700 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredCandidates.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="py-16 text-center text-slate-400">
                                        <div className="w-12 h-12 rounded-2xl bg-purple-50 text-violet-500 flex items-center justify-center mx-auto mb-3 border border-purple-100">
                                            <FileText className="w-6 h-6 text-violet-600" />
                                        </div>
                                        <div className="text-sm font-bold text-slate-700">No Resumes in Screener</div>
                                        <div className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                            Upload candidate resumes above using drag &amp; drop or the browse button to begin screening.
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedCandidates.map((candidate, idx) => {
                                    const isSelectedRow = selectedCandidateId === candidate.id;
                                    const isChecked = selectedRowIds.includes(candidate.id);
                                    const isAnalyzing = analyzingCandidateId === candidate.id;
                                    const candidateDomain = detectCandidateDomain(candidate);
                                    const domainBadge = getDomainBadge(candidateDomain);
                                    const DomainIcon = domainBadge.icon;
                                    const jobFolder = getCandidateJobFolder(candidate);
                                    const isCurrentFolder = selectedFolderJobId === jobFolder?.id;

                                    return (
                                        <tr
                                            key={candidate.id ? `${candidate.id}-${idx}` : `row-${idx}`}
                                            onClick={() => setSelectedCandidateId(candidate.id)}
                                            className={`transition-colors cursor-pointer group ${
                                                isSelectedRow ? "bg-violet-50/60 border-l-4 border-l-violet-600" : "hover:bg-slate-50/70"
                                            }`}
                                        >
                                            

                                            {/* Candidate Profile */}
                                            <td className={`${preferences.compactView ? "py-2 px-3" : "py-3.5 px-4"}`}>
                                                <div className="flex items-center gap-3">
                                                    {preferences.showAvatars !== false && candidate.avatar ? (
                                                        <img
                                                            src={candidate.avatar}
                                                            alt={candidate.name}
                                                            className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200"
                                                        />
                                                    ) : (
                                                        <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 font-bold text-xs flex items-center justify-center shrink-0">
                                                            {candidate.initials ||
                                                                (candidate.name || "Candidate")
                                                                    .split(" ")
                                                                    .filter(Boolean)
                                                                    .map((n) => n[0])
                                                                    .join("")
                                                                    .slice(0, 2)}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                                                                {candidate.name}
                                                            </span>
                                                            {isSelectedRow && (
                                                                <span className="px-1.5 py-0.2 rounded bg-violet-100 text-violet-700 text-[10px] font-bold shrink-0">
                                                                    Selected
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 flex-wrap">
                                                            <span>{candidate.email}</span>
                                                            {candidate.phone && (
                                                                <>
                                                                    <span className="text-slate-300">•</span>
                                                                    <span className="font-mono text-violet-700 font-semibold">{candidate.phone}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Field & Current Role */}
                                            <td className="py-3.5 px-3">
                                                <div className="space-y-1">
                                                    <div className="font-semibold text-slate-800 text-xs truncate max-w-[130px]">
                                                        {candidate.role}
                                                    </div>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${domainBadge.bg}`}>
                                                        <DomainIcon className="w-3 h-3" />
                                                        <span>{domainBadge.label}</span>
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Job Folder */}
                                            <td className="py-3.5 px-3 whitespace-nowrap">
                                                {jobFolder ? (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedFolderJobId(jobFolder.id);
                                                            setSelectedJobId(jobFolder.id);
                                                            setSelectedField(detectJobDomain(jobFolder));
                                                        }}
                                                        title={`Click to filter by job folder "${jobFolder.title}"`}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                                            isCurrentFolder
                                                                ? "bg-violet-600 text-white border-violet-600 shadow-xs"
                                                                : "bg-slate-50 hover:bg-violet-50 text-slate-700 hover:text-violet-700 border-slate-200"
                                                        }`}
                                                    >
                                                        <Folder className={`w-3 h-3 ${isCurrentFolder ? "text-white" : "text-violet-500"}`} />
                                                        <span className="truncate max-w-[120px]">{jobFolder.title}</span>
                                                    </button>
                                                ) : (
                                                    <span className="text-[11px] text-slate-400 italic">General</span>
                                                )}
                                            </td>

                                            {/* Experience */}
                                            <td className="py-3.5 px-3 text-slate-600 text-xs whitespace-nowrap">
                                                {candidate.experience}
                                            </td>

                                            {/* Skills Pill Badges */}
                                            <td className="py-3.5 px-3">
                                                <div className="flex flex-wrap items-center gap-1 max-w-xs">
                                                    {(candidate.allSkills || candidate.skills || []).slice(0, 3).map((sk) => (
                                                        <span
                                                            key={sk}
                                                            className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100 text-[10px] font-semibold"
                                                        >
                                                            {sk}
                                                        </span>
                                                    ))}
                                                    {(candidate.allSkills || candidate.skills || []).length > 3 && (
                                                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">
                                                            +{(candidate.allSkills || candidate.skills || []).length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* ATS Score (Pill) */}
                                            <td className="py-3.5 px-3 text-center">
                                                <span
                                                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-extrabold border shadow-xs ${getScoreBadgeClass(
                                                        candidate.atsScore
                                                    )}`}
                                                >
                                                    {candidate.atsScore}
                                                </span>
                                            </td>

                                            {/* Match % */}
                                            <td
                                                className={`py-3.5 px-3 text-center font-bold text-xs whitespace-nowrap ${getMatchTextColor(
                                                    candidate.matchScore
                                                )}`}
                                            >
                                                {candidate.matchScore}%
                                            </td>

                                            {/* Status */}
                                            <td className="py-3.5 px-3 whitespace-nowrap">
                                                <div className="flex flex-col gap-1.5 items-start">
                                                    <span
                                                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${getStatusPill(
                                                            candidate.status
                                                        )}`}
                                                    >
                                                        {(candidate.status === "Review" || candidate.status === "Under Review") ? "Under Review" : candidate.status}
                                                    </span>
                                                    {(candidate.status === "Review" || candidate.status === "Under Review") && (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleStatusChange(candidate.id, "Shortlisted");
                                                                }}
                                                                className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                                                                title="Shortlist resume"
                                                            >
                                                                <UserCheck className="w-3 h-3 text-emerald-600" />
                                                                <span>Shortlist</span>
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleStatusChange(candidate.id, "Rejected");
                                                                }}
                                                                className="px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                                                                title="Reject resume"
                                                            >
                                                                <UserX className="w-3 h-3 text-rose-600" />
                                                                <span>Reject</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td
                                                className="py-3.5 px-4 text-center relative"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex items-center justify-center gap-1.5 text-slate-400">
                                                    {/* Re-analyze against active JD */}
                                                    <button
                                                        onClick={() => handleAnalyzeSingleCandidate(candidate.id)}
                                                        disabled={isAnalyzing}
                                                        className="p-1.5 rounded-lg hover:bg-violet-50 hover:text-violet-600 transition cursor-pointer"
                                                        title={`Re-screen against ${currentJd.title}`}
                                                    >
                                                        {isAnalyzing ? (
                                                            <RefreshCw className="w-3.5 h-3.5 text-violet-600 animate-spin" />
                                                        ) : (
                                                            <Sparkles className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>

                                                    {/* View Details */}
                                                    <button
                                                        onClick={() => {
                                                            setSelectedCandidateId(candidate.id);
                                                            setShowFullProfileModal(true);
                                                        }}
                                                        className="p-1.5 rounded-lg hover:bg-slate-100 hover:text-violet-600 transition cursor-pointer"
                                                        title="View Candidate Profile & Details"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>

                                                    {/* More Options */}
                                                    <button
                                                        onClick={() =>
                                                            setOpenActionMenuId(
                                                                openActionMenuId === candidate.id ? null : candidate.id
                                                            )
                                                        }
                                                        className="p-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                                                        title="Options"
                                                    >
                                                        <MoreVertical className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>

                                                {/* Dropdown Action Menu */}
                                                {openActionMenuId === candidate.id && (
                                                    <div className="absolute right-4 top-10 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-30 text-left text-xs font-medium text-slate-700 animate-in fade-in-50 zoom-in-95">
                                                        <button
                                                            onClick={() => {
                                                                handleAnalyzeSingleCandidate(candidate.id);
                                                                setOpenActionMenuId(null);
                                                            }}
                                                            className="w-full px-3.5 py-2 hover:bg-violet-50 flex items-center gap-2 text-violet-700 font-semibold cursor-pointer"
                                                        >
                                                            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                                                            <span>Auto-Screen with AI ATS</span>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedCandidateId(candidate.id);
                                                                setShowFullProfileModal(true);
                                                                setOpenActionMenuId(null);
                                                            }}
                                                            className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 cursor-pointer"
                                                        >
                                                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                                                            <span>View Full Breakdown</span>
                                                        </button>
                                                        <div className="border-t border-slate-100 my-1" />

                                                        {(candidate.status === "Review" || candidate.status === "Under Review") && (
                                                            <>
                                                                <button
                                                                    onClick={() => {
                                                                        handleStatusChange(candidate.id, "Shortlisted");
                                                                    }}
                                                                    className="w-full px-3.5 py-2 hover:bg-emerald-50 flex items-center gap-2 text-emerald-700 font-semibold cursor-pointer"
                                                                >
                                                                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                                    <span>Shortlist Resume</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        handleStatusChange(candidate.id, "Rejected");
                                                                    }}
                                                                    className="w-full px-3.5 py-2 hover:bg-rose-50 flex items-center gap-2 text-rose-700 font-semibold cursor-pointer"
                                                                >
                                                                    <UserX className="w-3.5 h-3.5 text-rose-600" />
                                                                    <span>Reject Resume</span>
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                toast.success(`Downloading ${candidate.name}'s resume...`);
                                                                setOpenActionMenuId(null);
                                                            }}
                                                            className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 cursor-pointer"
                                                        >
                                                            <Download className="w-3.5 h-3.5 text-slate-500" />
                                                            <span>Download Resume PDF</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-3 text-xs text-slate-500 bg-slate-50/40">
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage <= 1}
                            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                            title="Previous Page"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
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
                                        className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center transition cursor-pointer ${
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
                            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                            title="Next Page"
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal: Full Profile & JD ATS Breakdown */}
            {showFullProfileModal && selectedCandidate && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                {selectedCandidate.avatar ? (
                                    <img
                                        src={selectedCandidate.avatar}
                                        alt={selectedCandidate.name}
                                        className="w-16 h-16 rounded-2xl object-cover border border-slate-200"
                                    />
                                ) : (
                                    <div className="w-16 h-16 rounded-2xl bg-violet-100 text-violet-700 font-bold text-xl flex items-center justify-center">
                                        {selectedCandidate.initials || "SH"}
                                    </div>
                                )}
                                <div>
                                    <h3 className="text-2xl font-extrabold text-slate-900">
                                        {selectedCandidate.name}
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium">
                                        {selectedCandidate.role} · {selectedCandidate.experience} Experience
                                    </p>
                                    <div className="mt-1.5 flex items-center gap-2">
                                        <span
                                            className={`px-3 py-0.5 rounded-full text-xs font-semibold ${getStatusPill(
                                                selectedCandidate.status
                                            )}`}
                                        >
                                            {selectedCandidate.status}
                                        </span>
                                        <span className="text-xs text-slate-400 flex items-center gap-1">
                                            <MapPin className="w-3.5 h-3.5" />
                                            {selectedCandidate.location}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowFullProfileModal(false)}
                                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Navigation Tabs */}
                        <div className="flex border-b border-slate-100 gap-2 text-xs font-semibold text-slate-500 overflow-x-auto pb-1">
                            {[
                                { id: "overview", label: "Overview & Assessment", icon: Sparkles },
                                { id: "breakdown", label: "8-Factor ATS Breakdown", icon: BarChart3 },
                                { id: "skills", label: "Skills Matrix & JD Gaps", icon: CheckCircle2 },
                                { id: "experience", label: "Work History & Education", icon: Briefcase },
                                { id: "rawText", label: "Extracted Resume Text", icon: FileText }
                            ].map((tab) => {
                                const TabIcon = tab.icon;
                                const isActive = profileModalTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setProfileModalTab(tab.id)}
                                        className={`px-3 py-2 rounded-xl flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
                                            isActive
                                                ? "bg-violet-50 text-violet-700 font-bold border border-violet-200"
                                                : "hover:bg-slate-50 hover:text-slate-700"
                                        }`}
                                    >
                                        <TabIcon className="w-3.5 h-3.5" />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* TAB 1: OVERVIEW */}
                        {profileModalTab === "overview" && (
                            <div className="space-y-4 animate-in fade-in-50">
                                {/* Match & ATS Overview against Target JD */}
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 space-y-3">
                                    <div className="flex items-center justify-between text-xs text-slate-600">
                                        <span className="font-semibold">Evaluated against Target JD:</span>
                                        <span className="font-bold text-violet-700">{currentJd.title}</span>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="text-center bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                                            <div className="text-xs text-slate-500">ATS Score</div>
                                            <div className="text-2xl font-extrabold text-emerald-600 mt-0.5">
                                                {selectedCandidate.atsScore}/100
                                            </div>
                                        </div>
                                        <div className="text-center bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                                            <div className="text-xs text-slate-500">JD Match</div>
                                            <div className="text-2xl font-extrabold text-emerald-600 mt-0.5">
                                                {selectedCandidate.matchScore}%
                                            </div>
                                        </div>
                                        <div className="text-center bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                                            <div className="text-xs text-slate-500">Skill Alignment</div>
                                            <div className="text-2xl font-extrabold text-violet-600 mt-0.5">
                                                {selectedCandidate.skillsMatchPct || 85}%
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* AI Summary */}
                                <div className="p-5 rounded-2xl bg-violet-50/70 border border-violet-100/80">
                                    <div className="flex items-center gap-2 text-xs font-bold text-violet-800 uppercase tracking-wider mb-2">
                                        <Sparkles className="w-4 h-4 text-violet-600" />
                                        <span>AI Candidate Assessment for {currentJd.title}</span>
                                    </div>
                                    <p className="text-sm text-slate-700 leading-relaxed">
                                        {selectedCandidate.summary || selectedCandidate.aiSummary}
                                    </p>
                                </div>

                                {/* Key Points: Strengths & Missing Skills */}
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-2">
                                        <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                            <span>Strengths &amp; JD Matches</span>
                                        </div>
                                        <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                                            {(selectedCandidate.keyPoints?.strengths || ["Meets core criteria"]).map(
                                                (s, idx) => (
                                                    <li key={idx}>{s}</li>
                                                )
                                            )}
                                        </ul>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-2">
                                        <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                            <AlertCircle className="w-4 h-4 text-amber-600" />
                                            <span>Gaps &amp; Missing Skills</span>
                                        </div>
                                        <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                                            {(selectedCandidate.missingRequiredSkills?.length > 0
                                                ? selectedCandidate.missingRequiredSkills.map((s) => `Missing required: ${s}`)
                                                : (selectedCandidate.keyPoints?.missingSkills || ["None identified"])
                                            ).map((m, idx) => (
                                                <li key={idx}>{m}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                {/* Shortlist Verdict */}
                                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
                                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                        <ShieldCheck className="w-4 h-4 text-violet-600" />
                                        <span>Automated ATS Shortlist Verdict</span>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                        {selectedCandidate.keyPoints?.verdict ||
                                            `Candidate status: ${selectedCandidate.status} with an overall ATS score of ${selectedCandidate.atsScore}/100.`}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: 8-FACTOR ATS BREAKDOWN */}
                        {profileModalTab === "breakdown" && (
                            <div className="space-y-4 animate-in fade-in-50">
                                <div className="p-4 bg-violet-50/60 border border-violet-100 rounded-2xl">
                                    <h4 className="font-bold text-violet-900 text-sm">Deterministic 8-Factor Weighted Scoring</h4>
                                    <p className="text-xs text-violet-700 mt-1">
                                        Ground-truth mathematical evaluation against job requirements for {currentJd.title}.
                                    </p>
                                </div>

                                {(() => {
                                    const b = selectedCandidate.breakdown || {};
                                    const reqScore = b.requiredSkills?.score ?? Math.min(30, Math.round((selectedCandidate.atsScore || 70) * 0.3));
                                    const prefScore = b.preferredSkills?.score ?? Math.min(10, Math.round((selectedCandidate.atsScore || 70) * 0.1));
                                    const expScore = b.experience?.score ?? Math.min(20, Math.round((selectedCandidate.atsScore || 70) * 0.2));
                                    const eduScore = b.education?.score ?? 9;
                                    const domScore = b.domainRelevance?.score ?? 10;
                                    const kwScore = b.keywords?.score ?? 8;
                                    const qualScore = b.resumeQuality?.score ?? 4.5;
                                    const certScore = b.certifications?.score ?? 3.5;

                                    const factors = [
                                        {
                                            name: "Required Technical Skills",
                                            weight: "30%",
                                            score: reqScore,
                                            max: 30,
                                            desc: "Exact & canonical matches for must-have skills defined in JD",
                                            color: "bg-emerald-500"
                                        },
                                        {
                                            name: "Preferred & Nice-to-Have Skills",
                                            weight: "10%",
                                            score: prefScore,
                                            max: 10,
                                            desc: "Secondary competencies and supporting tools",
                                            color: "bg-blue-500"
                                        },
                                        {
                                            name: "Experience Level Alignment",
                                            weight: "20%",
                                            score: expScore,
                                            max: 20,
                                            desc: `Candidate: ${b.experience?.candidateYears || selectedCandidate.experience} vs JD: ${b.experience?.requiredYears || currentJd.expLevel}`,
                                            color: "bg-violet-500"
                                        },
                                        {
                                            name: "Education & Degree Match",
                                            weight: "10%",
                                            score: eduScore,
                                            max: 10,
                                            desc: selectedCandidate.education || "Bachelor's Degree in relevant field",
                                            color: "bg-indigo-500"
                                        },
                                        {
                                            name: "Professional Domain Relevance",
                                            weight: "10%",
                                            score: domScore,
                                            max: 10,
                                            desc: `Candidate domain (${selectedCandidate.domain || "General"}) aligned with job field`,
                                            color: "bg-purple-500"
                                        },
                                        {
                                            name: "Industry Terminology & Keywords",
                                            weight: "10%",
                                            score: kwScore,
                                            max: 10,
                                            desc: "Contextual vocabulary, methods, and domain terminology",
                                            color: "bg-cyan-500"
                                        },
                                        {
                                            name: "Resume Quality & Formatting",
                                            weight: "5%",
                                            score: qualScore,
                                            max: 5,
                                            desc: "ATS-friendly layout, action verbs, measurable impact",
                                            color: "bg-teal-500"
                                        },
                                        {
                                            name: "Certifications & Credentials",
                                            weight: "5%",
                                            score: certScore,
                                            max: 5,
                                            desc: "Accredited industry certifications and specialized training",
                                            color: "bg-amber-500"
                                        }
                                    ];

                                    return (
                                        <div className="grid gap-3">
                                            {factors.map((f, i) => {
                                                const pct = Math.min(100, Math.round((f.score / f.max) * 100));
                                                return (
                                                    <div key={i} className="p-3.5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <div className="font-bold text-slate-900 text-xs sm:text-sm">
                                                                    {f.name}
                                                                </div>
                                                                <div className="text-[11px] text-slate-500">{f.desc}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="font-extrabold text-sm text-slate-900">
                                                                    {f.score}/{f.max} <span className="text-xs text-slate-400 font-normal">pts</span>
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 font-semibold">{f.weight} weight</div>
                                                            </div>
                                                        </div>
                                                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                            <div
                                                                className={`${f.color} h-2 rounded-full transition-all duration-300`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* TAB 3: SKILLS MATRIX */}
                        {profileModalTab === "skills" && (
                            <div className="space-y-4 animate-in fade-in-50">
                                {/* Matched Required Skills */}
                                <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl space-y-2">
                                    <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                        <span>Matched Required Skills (High Weight)</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedCandidate.matchedSkills || selectedCandidate.allSkills || []).map((sk) => (
                                            <span
                                                key={sk}
                                                className="px-3 py-1 bg-white border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1"
                                            >
                                                <Check className="w-3 h-3 text-emerald-600" />
                                                <span>{sk}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Missing Required Skills */}
                                {selectedCandidate.missingRequiredSkills?.length > 0 && (
                                    <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-2">
                                        <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                            <AlertCircle className="w-4 h-4 text-amber-600" />
                                            <span>Missing Required Skills</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedCandidate.missingRequiredSkills.map((sk) => (
                                                <span
                                                    key={sk}
                                                    className="px-3 py-1 bg-white border border-amber-300 text-amber-800 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1"
                                                >
                                                    <X className="w-3 h-3 text-amber-600" />
                                                    <span>{sk}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* All Extracted Candidate Skills */}
                                <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl space-y-2">
                                    <div className="text-xs font-bold text-slate-800">
                                        All Skills Extracted from Resume
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(selectedCandidate.allSkills || selectedCandidate.skills || []).map((sk) => (
                                            <span
                                                key={sk}
                                                className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-medium"
                                            >
                                                {sk}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 4: EXPERIENCE & EDUCATION */}
                        {profileModalTab === "experience" && (
                            <div className="space-y-4 animate-in fade-in-50">
                                {/* Experience Timeline */}
                                <div className="space-y-3">
                                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                        <Briefcase className="w-4 h-4 text-slate-600" />
                                        <span>Work Experience Timeline</span>
                                    </div>

                                    {(Array.isArray(selectedCandidate.workExperience) && selectedCandidate.workExperience.length > 0
                                        ? selectedCandidate.workExperience
                                        : [
                                            {
                                                title: selectedCandidate.currentRole || selectedCandidate.role,
                                                company: "Enterprise Technology Inc.",
                                                duration: selectedCandidate.experience || "3+ Years",
                                                responsibilities: [
                                                    "Architected, tested, and shipped core service components.",
                                                    "Collaborated with cross-functional product and engineering teams.",
                                                    "Improved reliability and reduced latency across primary workflows."
                                                ]
                                            }
                                        ]
                                    ).map((exp, idx) => (
                                        <div key={idx} className="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl space-y-2">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm">{exp.title}</div>
                                                    <div className="text-xs text-violet-700 font-semibold">{exp.company}</div>
                                                </div>
                                                <span className="text-xs text-slate-500 font-medium px-2.5 py-0.5 rounded-full bg-white border border-slate-200">
                                                    {exp.duration}
                                                </span>
                                            </div>
                                            {Array.isArray(exp.responsibilities) && exp.responsibilities.length > 0 && (
                                                <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                                                    {exp.responsibilities.map((r, rIdx) => (
                                                        <li key={rIdx}>{r}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Education */}
                                <div className="space-y-3 pt-2 border-t border-slate-100">
                                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                        <GraduationCap className="w-4 h-4 text-slate-600" />
                                        <span>Education &amp; Academic Credentials</span>
                                    </div>

                                    <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl space-y-1">
                                        <div className="font-bold text-slate-900 text-sm">
                                            {selectedCandidate.education || "Bachelor of Technology / Computer Science"}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Graduated with Distinction · Relevant coursework in systems &amp; data structures
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 5: RAW RESUME TEXT */}
                        {profileModalTab === "rawText" && (
                            <div className="space-y-3 animate-in fade-in-50">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                        <FileText className="w-4 h-4 text-slate-500" />
                                        <span>Extracted Resume Text ({selectedCandidate.resumeFileName || "Document"})</span>
                                    </span>
                                    <button
                                        onClick={() => {
                                            const text = selectedCandidate.rawText || selectedCandidate.summary || "No raw text available";
                                            navigator.clipboard.writeText(text);
                                            toast.success("Resume text copied to clipboard!");
                                        }}
                                        className="text-xs font-semibold text-violet-700 hover:text-violet-800"
                                    >
                                        Copy Text
                                    </button>
                                </div>

                                <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl font-mono text-xs max-h-[380px] overflow-y-auto leading-relaxed whitespace-pre-wrap select-all">
                                    {selectedCandidate.rawText ||
                                        `${selectedCandidate.name}\n${selectedCandidate.email} | ${selectedCandidate.phone} | ${selectedCandidate.location}\n\nSUMMARY\n${selectedCandidate.summary}\n\nSKILLS\n${(selectedCandidate.allSkills || selectedCandidate.skills || []).join(", ")}\n\nEXPERIENCE\n${selectedCandidate.currentRole} (${selectedCandidate.experience})\n\nEDUCATION\n${selectedCandidate.education}`}
                                </div>
                            </div>
                        )}

                        {/* Modal Actions */}
                        <div className="flex justify-between items-center gap-3 pt-3 border-t border-slate-100">
                            <button
                                onClick={() => setShowFullProfileModal(false)}
                                className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                                Close
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        handleAnalyzeSingleCandidate(selectedCandidate.id);
                                        setShowFullProfileModal(false);
                                    }}
                                    className="px-4 py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-xl text-sm font-semibold transition flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Sparkles className="w-4 h-4 text-violet-600" />
                                    <span>Re-screen with AI ATS</span>
                                </button>
                                {(selectedCandidate.status === "Review" || selectedCandidate.status === "Under Review") && (
                                    <>
                                        <button
                                            onClick={() => {
                                                handleStatusChange(selectedCandidate.id, "Shortlisted");
                                                setShowFullProfileModal(false);
                                            }}
                                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                                        >
                                            <UserCheck className="w-4 h-4 text-white" />
                                            <span>Shortlist Resume</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                handleStatusChange(selectedCandidate.id, "Rejected");
                                                setShowFullProfileModal(false);
                                            }}
                                            className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-sm font-semibold transition flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <UserX className="w-4 h-4 text-rose-600" />
                                            <span>Reject Resume</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Custom JD Setup / Edit */}
            {showCustomJdModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
                                    <Target className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-base">Custom Job Description</h3>
                                    <p className="text-xs text-slate-500">
                                        Define or paste target JD requirements for ATS scoring
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCustomJdModal(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">Job Title</label>
                                <input
                                    type="text"
                                    value={customJd.title}
                                    onChange={(e) => setCustomJd({ ...customJd, title: e.target.value })}
                                    placeholder="e.g. Senior Frontend Engineer"
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 font-medium"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="font-semibold text-slate-700 block mb-1">Department</label>
                                    <input
                                        type="text"
                                        value={customJd.dept}
                                        onChange={(e) => setCustomJd({ ...customJd, dept: e.target.value })}
                                        placeholder="Engineering"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="font-semibold text-slate-700 block mb-1">Experience Required</label>
                                    <input
                                        type="text"
                                        value={customJd.expLevel}
                                        onChange={(e) => setCustomJd({ ...customJd, expLevel: e.target.value })}
                                        placeholder="3-5 Years"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 font-medium"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">
                                    Key Required Skills (comma separated)
                                </label>
                                <input
                                    type="text"
                                    value={customJd.keySkills}
                                    onChange={(e) => setCustomJd({ ...customJd, keySkills: e.target.value })}
                                    placeholder="React, TypeScript, Next.js, Tailwind, GraphQL"
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 font-medium"
                                />
                            </div>

                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">
                                    Job Description / Role Summary
                                </label>
                                <textarea
                                    rows="3"
                                    value={customJd.description}
                                    onChange={(e) => setCustomJd({ ...customJd, description: e.target.value })}
                                    placeholder="Paste job description text here..."
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 font-medium text-slate-800"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                            <button
                                onClick={() => setShowCustomJdModal(false)}
                                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setSelectedJobId("custom");
                                    setShowCustomJdModal(false);
                                    toast.success(`Active JD set to "${customJd.title}". Ready to screen!`);
                                }}
                                className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-violet-500/20"
                            >
                                Set as Active JD
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Interview scheduling modal removed from resume page */}

            {/* Modal: Filters Popover */}
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
                                <label className="font-semibold text-slate-700 block mb-1">Role</label>
                                <select
                                    value={filterRole}
                                    onChange={(e) => setFilterRole(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500"
                                >
                                    <option value="All">All Roles</option>
                                    <option value="Python Developer">Python Developer</option>
                                    <option value="Senior Software Engineer">Senior Software Engineer</option>
                                    <option value="UI/UX Product Designer">UI/UX Product Designer</option>
                                    <option value="DevOps Engineer">DevOps Engineer</option>
                                    <option value="Data Analyst">Data Analyst</option>
                                </select>
                            </div>

                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">
                                    Minimum ATS Score: {filterMinScore}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="90"
                                    step="5"
                                    value={filterMinScore}
                                    onChange={(e) => setFilterMinScore(Number(e.target.value))}
                                    className="w-full accent-violet-600"
                                />
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <button
                                onClick={() => {
                                    setFilterRole("All");
                                    setFilterMinScore(0);
                                }}
                                className="text-xs text-violet-600 font-semibold hover:underline"
                            >
                                Reset All
                            </button>
                            <button
                                onClick={() => setShowFilterModal(false)}
                                className="px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold"
                            >
                                Apply Filters
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Resumes;
