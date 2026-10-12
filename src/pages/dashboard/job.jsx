import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { jobsApi } from "@/services/api";
import {
    FileText,
    MapPin,
    X,
    ChevronDown,
    Plus,
    Briefcase,
    Users,
    Clock,
    Building2,
    Search,
    MoreVertical,
    CheckCircle2,
    Tag,
    AlignLeft,
    Sparkles,
    Video,
    ArrowRight,
    Upload,
    Loader2,
    Trash2
} from "lucide-react";

const seedJobs = [];

const SUGGESTED_SKILLS = [
    "React",
    "Node.js",
    "Python",
    "TypeScript",
    "JavaScript",
    "SQL",
    "AWS",
    "Docker",
    "Figma",
    "Tailwind CSS",
    "GraphQL",
    "System Design",
    "Git",
    "FastAPI",
    "MongoDB",
    "PostgreSQL",
    "Java",
    "Kubernetes",
    "Next.js",
    "Express"
];

const defaultFormState = {
    title: "",
    dept: "Engineering",
    jobLevel: "Mid Level",
    reportsTo: "Engineering Manager",
    loc: "Karnataka",
    isRemotePosition: false,
    workMode: "On-site",
    type: "Full-time",
    expLevel: "3-5 Years",
    description: "",
    keySkills: []
};

// Client-side text parser for job descriptions
const parseJobDescriptionClientSide = (text = "", filename = "") => {
    if (!text) {
        const fallbackTitle = filename ? filename.replace(/\.(pdf|docx?|txt|rtf)$/i, "").replace(/[_-]/g, " ") : "New Job Opening";
        return {
            title: fallbackTitle,
            dept: "Engineering",
            jobLevel: "Mid Level",
            reportsTo: "Engineering Manager",
            loc: "Karnataka",
            isRemotePosition: false,
            workMode: "On-site",
            type: "Full-time",
            expLevel: "3-5 Years",
            description: "",
            keySkills: []
        };
    }

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const lowerText = text.toLowerCase();

    // 1. Extract Job Title
    let title = "";
    const titlePatterns = [
        /(?:job\s*title|position|role|designation|hiring\s*for)\s*[:\-–]\s*([^\n\r,;]+)/i,
        /(?:we\s*are\s*hiring|opening\s*for|looking\s*for\s*(?:a|an)?)\s+([A-Za-z0-9\s\/\-\+\#\.]+?(?:engineer|developer|architect|lead|manager|designer|specialist|analyst|associate|intern|consultant|director|officer|executive|scientist|administrator))/i
    ];

    for (const p of titlePatterns) {
        const m = text.match(p);
        if (m && m[1] && m[1].trim().length > 2 && m[1].trim().length < 80) {
            title = m[1].trim().replace(/^[:\-–\s]+/, "");
            break;
        }
    }

    if (!title && lines.length > 0) {
        for (let i = 0; i < Math.min(lines.length, 6); i++) {
            const line = lines[i];
            if (
                line.length > 4 &&
                line.length < 65 &&
                !/^(company|location|date|page|about\s*us|job\s*description|overview|requirements)/i.test(line) &&
                /(engineer|developer|designer|manager|lead|analyst|architect|specialist|officer|consultant|scientist|intern|associate)/i.test(line)
            ) {
                title = line.replace(/^[:\-–\s]+/, "");
                break;
            }
        }
    }

    if (!title && lines.length > 0) {
        title = lines[0].slice(0, 60);
    }

    if (!title) {
        title = filename ? filename.replace(/\.(pdf|docx?|txt|rtf)$/i, "").replace(/[_-]/g, " ") : "Software Engineer";
    }

    // 2. Extract Department
    let dept = "Engineering";
    if (/(design|ui\/ux|graphic|visual|product\s*design)/i.test(lowerText) || /(designer)/i.test(title)) {
        dept = "Design";
    } else if (/(product\s*manager|product\s*owner|scrum\s*master)/i.test(lowerText) || /(product)/i.test(title)) {
        dept = "Product";
    } else if (/(marketing|seo|growth|content|social\s*media|brand)/i.test(lowerText)) {
        dept = "Marketing";
    } else if (/(sales|business\s*development|bdr|sdr|account\s*executive)/i.test(lowerText)) {
        dept = "Sales";
    } else if (/(human\s*resources|talent\s*acquisition|recruiter|people\s*ops|hr)/i.test(lowerText)) {
        dept = "Human Resources";
    } else if (/(finance|accounting|audit|tax|treasury)/i.test(lowerText)) {
        dept = "Finance";
    } else if (/(operations|logistics|supply\s*chain|procurement)/i.test(lowerText)) {
        dept = "Operations";
    }

    // 3. Extract Job Level
    let jobLevel = "Mid Level";
    const titleLower = title.toLowerCase();
    if (/(director|vp|vice\s*president|head\s*of|chief|cxo)/i.test(titleLower) || /(director|vp)/i.test(lowerText)) {
        jobLevel = "Director / Executive";
    } else if (/(lead|principal|architect|staff)/i.test(titleLower)) {
        jobLevel = "Lead / Principal";
    } else if (/(senior|sr\b|senior\s*level)/i.test(titleLower) || /(senior|sr\.)/i.test(lowerText)) {
        jobLevel = "Senior Level";
    } else if (/(junior|jr\b|intern|trainee|fresher|entry\s*level|graduate)/i.test(titleLower) || /(entry\s*level|internship)/i.test(lowerText)) {
        jobLevel = "Entry Level / Junior";
    }

    // 4. Extract Experience Level
    let expLevel = "3-5 Years";
    const expMatch =
        text.match(/(?:experience|exp|years\s*of\s*experience)\s*[:\-–]?\s*(\d+)\s*(?:-|to|\+)?\s*(\d*)\s*(?:years?|yrs?|yr)/i) ||
        text.match(/(\d+)\s*(?:-|to|\+)\s*(\d*)\s*(?:years?|yrs?|yr)\s*(?:of)?\s*(?:relevant)?\s*experience/i);

    if (expMatch) {
        const minExp = parseInt(expMatch[1], 10);
        const maxExp = expMatch[2] ? parseInt(expMatch[2], 10) : minExp;
        const avgExp = (minExp + maxExp) / 2;

        if (avgExp <= 1) {
            expLevel = "0-1 Years";
        } else if (avgExp <= 3) {
            expLevel = "1-3 Years";
        } else if (avgExp <= 5) {
            expLevel = "3-5 Years";
        } else if (avgExp <= 8) {
            expLevel = "5-8 Years";
        } else {
            expLevel = "8+ Years";
        }
    } else if (jobLevel === "Entry Level / Junior") {
        expLevel = "0-1 Years";
    } else if (jobLevel === "Senior Level") {
        expLevel = "5-8 Years";
    } else if (jobLevel === "Lead / Principal" || jobLevel === "Director / Executive") {
        expLevel = "8+ Years";
    }

    // 5. Extract Work Mode & Remote Status
    let workMode = "On-site";
    let isRemotePosition = false;
    if (/(100%\s*remote|fully\s*remote|remote\s*position|work\s*from\s*anywhere|wfh)/i.test(lowerText)) {
        workMode = "Remote";
        isRemotePosition = true;
    } else if (/(\bhybrid\b|hybrid\s*work|partly\s*remote)/i.test(lowerText)) {
        workMode = "Hybrid";
    } else if (/\bremote\b/i.test(lowerText) && !/non-remote|no\s*remote/i.test(lowerText)) {
        workMode = "Remote";
        isRemotePosition = true;
    }

    // 6. Extract Location
    let loc = "Karnataka";
    if (isRemotePosition || workMode === "Remote") {
        loc = "Remote";
    } else {
        if (/(bangalore|bengaluru)/i.test(lowerText)) loc = "Karnataka";
        else if (/(mumbai|pune|nagpur)/i.test(lowerText)) loc = "Maharashtra";
        else if (/(delhi|ncr|new\s*delhi)/i.test(lowerText)) loc = "Delhi";
        else if (/(hyderabad)/i.test(lowerText)) loc = "Telangana";
        else if (/(chennai|coimbatore)/i.test(lowerText)) loc = "Tamil Nadu";
        else if (/(gurgaon|gurugram|noida)/i.test(lowerText)) loc = "Haryana";
        else if (/(kolkata)/i.test(lowerText)) loc = "West Bengal";
        else if (/(ahmedabad|surat)/i.test(lowerText)) loc = "Gujarat";
        else if (/(kochi|trivandrum|thiruvananthapuram)/i.test(lowerText)) loc = "Kerala";
    }

    // 7. Extract Employment Type
    let type = "Full-time";
    if (/(part\s*time|part-time)/i.test(lowerText)) {
        type = "Part-time";
    } else if (/(contract|freelance|consultant|fixed\s*term)/i.test(lowerText)) {
        type = "Contract";
    } else if (/(internship|intern\b)/i.test(lowerText)) {
        type = "Internship";
    }

    // 8. Extract Skills
    const keySkills = [];
    for (const skill of SUGGESTED_SKILLS) {
        const escaped = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const regex = new RegExp(`(?:^|[^a-zA-Z0-9+#.])${escaped}(?:$|[^a-zA-Z0-9+#.])`, "i");
        if (regex.test(text)) {
            if (!keySkills.includes(skill)) {
                keySkills.push(skill);
            }
        }
    }

    // 9. Format Clean Description
    let description = text.trim();
    if (description.length > 3000) {
        description = description.slice(0, 3000) + "...";
    }

    return {
        title,
        dept,
        jobLevel,
        reportsTo: dept === "Engineering" ? "Engineering Manager" : `${dept} Manager`,
        loc,
        isRemotePosition,
        workMode,
        type,
        expLevel,
        description,
        keySkills: keySkills.slice(0, 10)
    };
};

const Jobs = () => {
    const [jobs, setJobs] = useState(seedJobs);
    const [q, setQ] = useState("");
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(defaultFormState);
    const [skillInput, setSkillInput] = useState("");
    const [selectedJobView, setSelectedJobView] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isParsingDoc, setIsParsingDoc] = useState(false);
    const [uploadedDocName, setUploadedDocName] = useState("");
    const fileInputRef = useRef(null);

    const [preferences, setPreferences] = useState(() => {
        try {
            const saved = localStorage.getItem("avahire_settings_preferences");
            return saved ? JSON.parse(saved) : { jobsPerPage: "10", compactView: true };
        } catch {
            return { jobsPerPage: "10", compactView: true };
        }
    });
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        const handlePrefUpdate = (e) => {
            if (e.detail) {
                setPreferences(e.detail);
                if (e.detail.jobsPerPage) {
                    setCurrentPage(1);
                }
            }
        };
        window.addEventListener("avahire_preferences_updated", handlePrefUpdate);
        return () => window.removeEventListener("avahire_preferences_updated", handlePrefUpdate);
    }, []);

    useEffect(() => {
        const loadJobs = async () => {
            try {
                const data = await jobsApi.getAll();
                if (Array.isArray(data)) {
                    setJobs(data);
                }
            } catch (err) {
                console.error("Failed to load jobs from database:", err);
            }
        };
        loadJobs();
    }, []);

    const handleDeleteJob = async (jobId, jobTitle) => {
        if (!window.confirm(`Are you sure you want to delete the job "${jobTitle || 'Selected Job'}"? This action cannot be undone.`)) {
            return;
        }
        try {
            await jobsApi.delete(jobId);
            setJobs((prev) => prev.filter((j) => j.id !== jobId));
            if (selectedJobView && selectedJobView.id === jobId) {
                setSelectedJobView(null);
            }
            toast.success(`Job "${jobTitle || 'Job'}" deleted successfully`);
        } catch (err) {
            console.error("Failed to delete job:", err);
            setJobs((prev) => prev.filter((j) => j.id !== jobId));
            if (selectedJobView && selectedJobView.id === jobId) {
                setSelectedJobView(null);
            }
            toast.success(`Job removed successfully`);
        }
    };

    const safeJobs = Array.isArray(jobs) ? jobs : [];
    const filtered = safeJobs.filter((j) => {
        if (!j) return false;
        const title = j.title || "";
        const dept = j.dept || "";
        const loc = j.loc || "";
        return (
            title.toLowerCase().includes(q.toLowerCase()) ||
            dept.toLowerCase().includes(q.toLowerCase()) ||
            loc.toLowerCase().includes(q.toLowerCase()) ||
            (Array.isArray(j.keySkills) && j.keySkills.some(skill => skill && skill.toLowerCase().includes(q.toLowerCase())))
        );
    });

    const pageSize = Number(preferences.jobsPerPage) || 10;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    const paginatedJobs = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const handleAddSkill = (skillToAdd) => {
        const trimmed = (skillToAdd || skillInput).trim();
        if (!trimmed) return;
        if (form.keySkills.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
            toast.info(`"${trimmed}" is already in the skills list`);
            setSkillInput("");
            return;
        }
        setForm(prev => ({
            ...prev,
            keySkills: [...prev.keySkills, trimmed]
        }));
        setSkillInput("");
    };

    const handleRemoveSkill = (skillToRemove) => {
        setForm(prev => ({
            ...prev,
            keySkills: prev.keySkills.filter(s => s !== skillToRemove)
        }));
    };

    const handleSkillKeyDown = (e) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            handleAddSkill();
        }
    };

    // Document Upload & Auto-fill Handler
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsParsingDoc(true);
        toast.info(`Reading and analyzing document "${file.name}"...`);

        try {
            let parsedData = null;

            // 1. Try server-side parser
            const formData = new FormData();
            formData.append("document", file);
            try {
                const res = await jobsApi.parseDocument(formData);
                if (res && res.data) {
                    parsedData = res.data;
                }
            } catch (apiErr) {
                console.warn("Backend document parser fallback:", apiErr);
            }

            // 2. Client-side fallback if server didn't return data
            if (!parsedData) {
                let textContent = "";
                if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".rtf")) {
                    textContent = await file.text();
                } else {
                    const buffer = await file.arrayBuffer();
                    const bytes = new Uint8Array(buffer);
                    let rawStr = "";
                    for (let i = 0; i < bytes.length; i++) {
                        const b = bytes[i];
                        if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
                            rawStr += String.fromCharCode(b);
                        } else if (rawStr.length > 0 && rawStr[rawStr.length - 1] !== " ") {
                            rawStr += " ";
                        }
                    }
                    textContent = rawStr;
                }
                parsedData = parseJobDescriptionClientSide(textContent, file.name);
            }

            if (parsedData) {
                setForm(prev => ({
                    ...prev,
                    title: parsedData.title || prev.title || file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
                    dept: parsedData.dept || prev.dept,
                    jobLevel: parsedData.jobLevel || prev.jobLevel,
                    reportsTo: parsedData.reportsTo || prev.reportsTo,
                    loc: parsedData.loc || prev.loc,
                    isRemotePosition: parsedData.isRemotePosition ?? prev.isRemotePosition,
                    workMode: parsedData.workMode || prev.workMode,
                    type: parsedData.type || prev.type,
                    expLevel: parsedData.expLevel || prev.expLevel,
                    description: parsedData.description || prev.description,
                    keySkills: Array.isArray(parsedData.keySkills) && parsedData.keySkills.length > 0
                        ? parsedData.keySkills
                        : prev.keySkills
                }));

                setUploadedDocName(file.name);
                toast.success(`Job description parsed! Title, requirements, experience (${parsedData.expLevel || "detected"}), and role description filled automatically.`);
            }
        } catch (err) {
            console.error("Document upload error:", err);
            toast.error("Failed to read document file. Please fill the fields manually.");
        } finally {
            setIsParsingDoc(false);
            if (e.target) {
                e.target.value = "";
            }
        }
    };

    const submit = async (e) => {
        e?.preventDefault();
        const title = form.title?.trim();
        if (!title) {
            return toast.error("Please enter a job title");
        }

        setIsSubmitting(true);
        let currentUserEmail = "";
        try {
            const user = JSON.parse(localStorage.getItem("avahire_user") || "{}");
            currentUserEmail = user?.email || "";
        } catch {
            // ignore
        }

        const jobPayload = {
            ...form,
            title,
            dept: form.dept?.trim() || "Engineering",
            loc: form.loc?.trim() || "Karnataka",
            expLevel: form.expLevel?.trim() || "3-5 Years",
            jobLevel: form.jobLevel?.trim() || "Mid Level",
            reportsTo: form.reportsTo?.trim() || "Engineering Manager",
            workMode: form.workMode || (form.isRemotePosition ? "Remote" : "On-site"),
            type: form.type || "Full-time",
            keySkills: form.keySkills.length > 0 ? form.keySkills : (skillInput.trim() ? [skillInput.trim()] : []),
            candidates: 0,
            status: "Active",
            posted: "Just now",
            createdBy: currentUserEmail,
            userEmail: currentUserEmail
        };

        try {
            const savedJob = await jobsApi.create(jobPayload);
            if (savedJob) {
                setJobs(prev => [savedJob, ...prev]);
            } else {
                const localJob = { id: `job-${Date.now()}`, ...jobPayload };
                setJobs(prev => [localJob, ...prev]);
            }
            toast.success("Job posting created successfully!");
            setModal(false);
            setForm(defaultFormState);
            setSkillInput("");
        } catch (err) {
            console.error("Backend error, adding locally:", err);
            const localJob = { id: `job-${Date.now()}`, ...jobPayload };
            setJobs(prev => [localJob, ...prev]);
            toast.success("Job posting created!");
            setModal(false);
            setForm(defaultFormState);
            setSkillInput("");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="jobs-page">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Jobs</h2>
                    <p className="text-sm text-slate-500">Manage your active job postings and open vacancies</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            data-testid="jobs-search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search jobs, departments, skills..."
                            className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-full text-sm w-64 sm:w-72 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition shadow-xs"
                        />
                    </div>
                    <button
                        data-testid="new-job-btn"
                        onClick={() => {
                            setForm(defaultFormState);
                            setSkillInput("");
                            setModal(true);
                        }}
                        className="btn-primary px-5 py-2.5 rounded-full text-white font-semibold text-sm flex items-center gap-2 shadow-md shadow-violet-500/25 transition active:scale-95 cursor-pointer"
                    >
                        <Plus className="w-4 h-4" /> New Job
                    </button>
                </div>
            </div>

            {/* Jobs Cards Grid */}
            {filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center" data-testid="empty-jobs-state">
                    <div className="w-16 h-16 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl">
                        <Briefcase className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">No jobs found</h3>
                    <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">
                        {q ? "No jobs match your search query." : "Get started by creating your first job posting."}
                    </p>
                    {!q && (
                        <button
                            onClick={() => {
                                setForm(defaultFormState);
                                setSkillInput("");
                                setModal(true);
                            }}
                            className="btn-primary px-5 py-2.5 rounded-full text-white font-semibold text-sm mt-4 inline-flex items-center gap-2 shadow-md shadow-violet-500/25 cursor-pointer"
                        >
                            <Plus className="w-4 h-4" /> New Job
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {paginatedJobs.map((j) => (
                            <div key={j.id} data-testid={`job-card-${j.id}`} className={`bg-white rounded-2xl border border-slate-100 ${preferences.compactView ? "p-4.5" : "p-6"} card-hover flex flex-col justify-between shadow-xs`}>
                                <div>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="text-lg font-bold text-slate-900 tracking-tight leading-snug">{j.title}</div>
                                            <div className="text-xs font-semibold text-violet-600 mt-1 flex items-center gap-1.5">
                                                <Building2 className="w-3.5 h-3.5" />
                                                <span>{j.dept}</span>
                                                {j.jobLevel && (
                                                    <>
                                                        <span className="text-slate-300">•</span>
                                                        <span className="text-slate-500 font-medium">{j.jobLevel}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${j.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                                            {j.status}
                                        </span>
                                    </div>

                                    {j.description && (
                                        <p className="text-xs text-slate-500 mt-3 line-clamp-2 leading-relaxed">
                                            {j.description}
                                        </p>
                                    )}

                                    {/* Key Skills Badges */}
                                    {j.keySkills && j.keySkills.length > 0 && (
                                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                                            {j.keySkills.slice(0, 4).map((skill, sIdx) => (
                                                <span
                                                    key={sIdx}
                                                    className="text-[11px] font-medium px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md"
                                                >
                                                    {skill}
                                                </span>
                                            ))}
                                            {j.keySkills.length > 4 && (
                                                <span className="text-[11px] font-medium px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded-md border border-slate-100">
                                                    +{j.keySkills.length - 4} more
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                                        <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-1 font-medium">
                                            <MapPin className="w-3 h-3 text-slate-400" />
                                            {j.loc}
                                        </span>
                                        <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-1 font-medium">
                                            <Clock className="w-3 h-3 text-slate-400" />
                                            {j.type}
                                        </span>
                                        {j.workMode && (
                                            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 font-medium">
                                                {j.workMode}
                                            </span>
                                        )}
                                        <Link
                                            to={`/app/candidates?job=${encodeURIComponent(j.title)}`}
                                            className="px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-100 font-semibold flex items-center gap-1 transition"
                                            title="View candidates for this job"
                                        >
                                            <Users className="w-3 h-3 text-violet-500" />
                                            {j.candidates} candidates →
                                        </Link>
                                    </div>
                                </div>

                                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                                    <span className="text-slate-400 font-medium">Posted {j.posted}</span>
                                    <div className="flex items-center gap-2">
                                        <Link
                                            to={`/app/candidates?job=${encodeURIComponent(j.title)}`}
                                            className="text-slate-600 hover:text-violet-600 font-semibold px-2 py-1 rounded-lg hover:bg-slate-50 transition"
                                            title="View Candidates"
                                        >
                                            Candidates
                                        </Link>
                                        <button
                                            onClick={() => setSelectedJobView(j)}
                                            className="text-violet-600 font-bold hover:text-violet-700 px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 transition cursor-pointer"
                                        >
                                            Details
                                        </button>
                                        <button
                                            onClick={() => handleDeleteJob(j.id, j.title)}
                                            className="text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 transition cursor-pointer flex items-center gap-1"
                                            title="Delete Job"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>Delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-200/80 pt-4 mt-2">
                            <span className="text-xs text-slate-500 font-medium">
                                Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} jobs
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    Previous
                                </button>
                                <span className="text-xs font-bold text-violet-700 px-2">
                                    {currentPage} / {totalPages}
                                </span>
                                <button
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* View Job Details Modal */}
            {selectedJobView && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-2xl p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                            <div>
                                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${selectedJobView.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                                    {selectedJobView.status}
                                </span>
                                <h3 className="text-xl font-bold text-slate-900 mt-2">{selectedJobView.title}</h3>
                                <p className="text-sm text-violet-600 font-semibold mt-0.5 flex items-center gap-1.5">
                                    <Building2 className="w-4 h-4" />
                                    {selectedJobView.dept} • {selectedJobView.jobLevel || "Mid Level"}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedJobView(null)}
                                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="mt-5 space-y-5">
                            {/* Key Highlights */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-[11px] text-slate-400 font-medium block">Location</span>
                                    <span className="text-xs font-bold text-slate-800 mt-0.5 block truncate">{selectedJobView.loc}</span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-[11px] text-slate-400 font-medium block">Work Mode</span>
                                    <span className="text-xs font-bold text-slate-800 mt-0.5 block">{selectedJobView.workMode || "On-site"}</span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-[11px] text-slate-400 font-medium block">Experience</span>
                                    <span className="text-xs font-bold text-slate-800 mt-0.5 block">{selectedJobView.expLevel || "3-5 Years"}</span>
                                </div>
                            </div>

                            {/* Job Description */}
                            {selectedJobView.description && (
                                <div>
                                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <AlignLeft className="w-3.5 h-3.5 text-violet-600" /> Job Description
                                    </h4>
                                    <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        {selectedJobView.description}
                                    </p>
                                </div>
                            )}

                            {/* Key Skills */}
                            {selectedJobView.keySkills && selectedJobView.keySkills.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <Tag className="w-3.5 h-3.5 text-blue-600" /> Required Key Skills
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedJobView.keySkills.map((skill, idx) => (
                                            <span
                                                key={idx}
                                                className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-xs font-semibold"
                                            >
                                                {skill}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <button
                                onClick={() => setSelectedJobView(null)}
                                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition cursor-pointer"
                            >
                                Close
                            </button>

                            <div className="flex flex-wrap items-center gap-2">
                                <Link
                                    to={`/app/candidates?job=${encodeURIComponent(selectedJobView.title)}`}
                                    className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                                >
                                    <Users className="w-3.5 h-3.5" />
                                    <span>View Applicants ({selectedJobView.candidates || 0})</span>
                                </Link>
                                <button
                                    onClick={() => handleDeleteJob(selectedJobView.id, selectedJobView.title)}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                                    title="Delete Job"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete Job</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Create New Job Modal */}
            {modal && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in" data-testid="new-job-modal">
                    <div className="bg-white rounded-3xl w-full max-w-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="flex items-start justify-between pb-6 border-b border-slate-100 gap-3">
                            <div className="flex items-center gap-3.5">
                                <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                                        Create New Job Posting
                                    </h3>
                                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                                        Add the essential details, role description, and key skills required.
                                    </p>
                                </div>
                            </div>

                            {/* Top Right Actions: Upload Document Button & Close */}
                            <div className="flex items-center gap-2 shrink-0">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    accept=".pdf,.doc,.docx,.txt,.rtf"
                                    className="hidden"
                                    id="jd-document-upload-input"
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isParsingDoc}
                                    className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-violet-500/20 transition active:scale-95 cursor-pointer disabled:opacity-50"
                                    title="Upload Job Description document (PDF, DOCX, TXT) to auto-fill form"
                                >
                                    {isParsingDoc ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>Reading...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-3.5 h-3.5" />
                                            <span>Upload Document</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setModal(false)}
                                    className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Document Upload Success Banner */}
                        {uploadedDocName && (
                            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center justify-between text-xs text-emerald-800 animate-in fade-in">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span>
                                        Auto-filled form from document: <strong className="font-bold text-emerald-950">{uploadedDocName}</strong>
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setUploadedDocName("")}
                                    className="text-emerald-700 hover:text-emerald-950 p-1 rounded-md hover:bg-emerald-100/50"
                                    title="Dismiss"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        {/* Modal Form */}
                        <form onSubmit={submit} className="mt-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                                {/* Job Title * */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                                        Job Title <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        data-testid="job-form-title"
                                        value={form.title}
                                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                                        placeholder="e.g. Senior Software Engineer"
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                    />
                                </div>

                                {/* Job Level */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                                        Job Level
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={form.jobLevel}
                                            onChange={(e) => setForm({ ...form, jobLevel: e.target.value })}
                                            className="w-full appearance-none px-4 py-2.5 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition cursor-pointer"
                                        >
                                            <option>Mid Level</option>
                                            <option>Entry Level / Junior</option>
                                            <option>Senior Level</option>
                                            <option>Lead / Principal</option>
                                            <option>Director / Executive</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Department * */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                                        Department <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <select
                                            data-testid="job-form-dept"
                                            value={form.dept}
                                            onChange={(e) => setForm({ ...form, dept: e.target.value })}
                                            className="w-full appearance-none px-4 py-2.5 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition cursor-pointer"
                                        >
                                            <option>Engineering</option>
                                            <option>Product</option>
                                            <option>Design</option>
                                            <option>Marketing</option>
                                            <option>Sales</option>
                                            <option>Human Resources</option>
                                            <option>Finance</option>
                                            <option>Operations</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Location * */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                                        Location <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                        <select
                                            value={form.loc}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const isRemote = val.toLowerCase().includes("remote");
                                                setForm({
                                                    ...form,
                                                    loc: val,
                                                    isRemotePosition: isRemote ? true : form.isRemotePosition,
                                                    workMode: isRemote ? "Remote" : form.workMode
                                                });
                                            }}
                                            className="w-full appearance-none pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition cursor-pointer"
                                        >
                                            <optgroup>
                                                <option value="Andhra Pradesh">Andhra Pradesh</option>
                                                <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                                                <option value="Assam">Assam</option>
                                                <option value="Bihar">Bihar</option>
                                                <option value="Chhattisgarh">Chhattisgarh</option>
                                                <option value="Goa">Goa</option>
                                                <option value="Gujarat">Gujarat</option>
                                                <option value="Haryana">Haryana</option>
                                                <option value="Himachal Pradesh">Himachal Pradesh</option>
                                                <option value="Jharkhand">Jharkhand</option>
                                                <option value="Karnataka">Karnataka</option>
                                                <option value="Kerala">Kerala</option>
                                                <option value="Madhya Pradesh">Madhya Pradesh</option>
                                                <option value="Maharashtra">Maharashtra</option>
                                                <option value="Manipur">Manipur</option>
                                                <option value="Meghalaya">Meghalaya</option>
                                                <option value="Mizoram">Mizoram</option>
                                                <option value="Nagaland">Nagaland</option>
                                                <option value="Odisha">Odisha</option>
                                                <option value="Punjab">Punjab</option>
                                                <option value="Rajasthan">Rajasthan</option>
                                                <option value="Sikkim">Sikkim</option>
                                                <option value="Tamil Nadu">Tamil Nadu</option>
                                                <option value="Telangana">Telangana</option>
                                                <option value="Tripura">Tripura</option>
                                                <option value="Uttar Pradesh">Uttar Pradesh</option>
                                                <option value="Uttarakhand">Uttarakhand</option>
                                                <option value="West Bengal">West Bengal</option>
                                                <option value="Delhi">Delhi</option>
                                                <option value="Chandigarh">Chandigarh</option>
                                                <option value="Jammu and Kashmir">Jammu and Kashmir</option>
                                                <option value="Ladakh">Ladakh</option>
                                                <option value="Lakshadweep">Lakshadweep</option>
                                                <option value="Puducherry">Puducherry</option>
                                                <option value="Remote">Remote</option>
                                            </optgroup>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>

                                    {/* Remote Position Checkbox */}
                                    <label className="flex items-center gap-2.5 mt-2.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={form.isRemotePosition}
                                            onChange={(e) => setForm({ ...form, isRemotePosition: e.target.checked })}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                        />
                                        <span className="text-xs font-semibold text-slate-700">Remote Position</span>
                                    </label>
                                </div>

                                {/* Work Mode * */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                                        Work Mode <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {["On-site", "Hybrid", "Remote"].map((mode) => {
                                            const isActive = form.workMode === mode;
                                            return (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => setForm({ ...form, workMode: mode })}
                                                    className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition text-center cursor-pointer ${isActive
                                                        ? "bg-blue-50/70 border-2 border-blue-500 text-blue-600 shadow-xs"
                                                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                        }`}
                                                >
                                                    {mode}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Employment Type * */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                                        Employment Type <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {["Full-time", "Part-time", "Contract", "Internship"].map((type) => {
                                            const isActive = form.type === type;
                                            return (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setForm({ ...form, type: type })}
                                                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition text-center whitespace-nowrap cursor-pointer ${isActive
                                                        ? "bg-blue-50/70 border-2 border-blue-500 text-blue-600 shadow-xs"
                                                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                        }`}
                                                >
                                                    {type}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Experience Level * */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                                        Experience Level <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={form.expLevel}
                                            onChange={(e) => setForm({ ...form, expLevel: e.target.value })}
                                            className="w-full appearance-none px-4 py-2.5 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition cursor-pointer"
                                        >
                                            <option>3-5 Years</option>
                                            <option>0-1 Years</option>
                                            <option>1-3 Years</option>
                                            <option>5-8 Years</option>
                                            <option>8+ Years</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* JOB DESCRIPTION BOX */}
                                <div className="col-span-1 md:col-span-2">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                            <AlignLeft className="w-3.5 h-3.5 text-blue-600" />
                                            Job Description
                                        </label>
                                        <span className="text-[11px] text-slate-400">
                                            {form.description.length} characters
                                        </span>
                                    </div>
                                    <textarea
                                        rows={4}
                                        data-testid="job-form-description"
                                        value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                                        placeholder="Describe the role responsibilities, ideal candidate background, mission, and key daily expectations..."
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition resize-y leading-relaxed"
                                    />
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Provide a clear summary of what candidates will be doing in this role.
                                    </p>
                                </div>

                                {/* KEY SKILLS */}
                                <div className="col-span-1 md:col-span-2">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                            <Tag className="w-3.5 h-3.5 text-blue-600" />
                                            Key Skills
                                        </label>
                                        <span className="text-[11px] text-slate-400">
                                            {form.keySkills.length} skill{form.keySkills.length === 1 ? "" : "s"} added
                                        </span>
                                    </div>

                                    {/* Skills Input Bar */}
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                data-testid="job-form-skill-input"
                                                value={skillInput}
                                                onChange={(e) => setSkillInput(e.target.value)}
                                                onKeyDown={handleSkillKeyDown}
                                                placeholder="Type a skill and press Enter (e.g. React, Python, AWS)..."
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleAddSkill()}
                                            disabled={!skillInput.trim()}
                                            className="px-4 py-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 disabled:pointer-events-none rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 border border-blue-200 cursor-pointer"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Add
                                        </button>
                                    </div>

                                    {/* Added Skills Pill Badges */}
                                    {form.keySkills.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2 p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                                            {form.keySkills.map((skill) => (
                                                <span
                                                    key={skill}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-blue-200 text-blue-700 rounded-full text-xs font-semibold shadow-2xs group"
                                                >
                                                    {skill}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveSkill(skill)}
                                                        className="text-slate-400 hover:text-rose-600 transition -mr-0.5 cursor-pointer"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </span>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => setForm(prev => ({ ...prev, keySkills: [] }))}
                                                className="text-[11px] text-slate-400 hover:text-rose-500 font-semibold px-2 py-1 transition cursor-pointer"
                                            >
                                                Clear all
                                            </button>
                                        </div>
                                    )}

                                    {/* Suggested Skills Quick-Add */}
                                    <div className="mt-2.5">
                                        <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mb-1.5">
                                            <Sparkles className="w-3 h-3 text-amber-500" /> Suggested Skills (Click to add):
                                        </span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {SUGGESTED_SKILLS.filter(s => !form.keySkills.some(existing => existing.toLowerCase() === s.toLowerCase())).slice(0, 10).map((skill) => (
                                                <button
                                                    key={skill}
                                                    type="button"
                                                    onClick={() => handleAddSkill(skill)}
                                                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 border border-slate-200/60 transition flex items-center gap-1 cursor-pointer"
                                                >
                                                    <Plus className="w-3 h-3 text-slate-400" /> {skill}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setModal(false)}
                                    className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    data-testid="job-form-submit"
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-500/25 transition active:scale-[0.98] cursor-pointer flex items-center gap-2"
                                >
                                    {isSubmitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                    {isSubmitting ? "Creating..." : "Create Job"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Jobs;
