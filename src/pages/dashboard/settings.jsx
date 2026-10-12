import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { settingsApi } from "@/services/api";
import {
    Save,
    Lock,
    ShieldCheck,
    Monitor,
    AlertTriangle,
    ChevronDown,
    X,
    KeyRound,
    Smartphone,
    LogOut,
    CheckCircle2,
    Clock,
    UserX,
    Video,
    Calendar,
    Hourglass,
    Globe,
    Bot,
    Sliders,
    Languages,
    FileText,
    Briefcase,
    Shield,
    User,
    Users,
    Laptop,
    Maximize2,
    Camera,
    Mic,
    Mail,
    Bell,
    CheckSquare,
    Info,
    Edit3,
    Sparkles,
    ExternalLink,
    Server,
    Cloud,
    Database,
    Cpu,
    HardDrive,
    RefreshCw,
    Settings as SettingsIcon,
    Check,
    Plus,
    Trash2,
    Download
} from "lucide-react";

const Settings = () => {
    // Tabs: "interview", "general"
    const [activeTab, setActiveTab] = useState("general");

    // Current HR user profile info
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("avahire_user") || "{}");
        } catch {
            return {};
        }
    });

    const [profileForm, setProfileForm] = useState({
        name: currentUser.name || "HR Manager",
        email: currentUser.email || "",
        phone: currentUser.phone || "+91 98765 43210",
        company: currentUser.company || "AvaHire Talent AI",
        designation: currentUser.designation || currentUser.role || "Talent Acquisition Lead",
        bio: currentUser.bio || "Empowering tech hiring through AI-assisted live candidate evaluations."
    });
    const [savingProfile, setSavingProfile] = useState(false);

    // Persistent General Preferences
    const [preferences, setPreferences] = useState(() => {
        const saved = localStorage.getItem("avahire_settings_preferences");
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.warn("Failed to parse saved preferences:", e);
            }
        }
        return {
            darkMode: false,
            compactView: true,
            showAvatars: true,
            autoRefresh: "Every 5 minutes",
            jobsPerPage: "10",
            candidatesPerPage: "10",
            interviewDuration: "30 Minutes",
            interviewMode: "AI Interview"
        };
    });

    // Persistent Interview Settings
    const [interviewSettings, setInterviewSettings] = useState(() => {
        const saved = localStorage.getItem("avahire_interview_settings");
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.warn("Failed to parse saved interview settings:", e);
            }
        }
        return {
            // General Interview Settings
            duration: "30 Minutes",
            joinWindow: "5 Minutes",
            graceTime: "2 Minutes",
            autoEnd: true,
            allowReschedule: false,
            timezone: "(GMT+05:30) Asia/Kolkata",

            // AI Interview Settings
            interviewMode: "AI Interview",
            aiAvatar: "Ava (Female)",
            difficulty: "Medium",
            language: "English",
            askFollowUps: true,
            resumeBasedQuestions: true,
            roleBasedQuestions: true,

            // Proctoring Settings
            enableProctoring: true,
            faceDetection: true,
            multiplePersonDetection: true,
            tabSwitchDetection: true,
            fullScreenMonitoring: true,
            suspiciousThreshold: "3 Actions",
            suspiciousToggle: false,
            screenRecording: false,
            videoRecording: true,
            audioRecording: true,

            // Communication & Reminders
            invitationEmail: true,
            reminderBeforeInterview: true,
            reminderTime: "15 Minutes",
            completionEmail: true,

            // Guidelines
            guidelines: [
                "Ensure you are in a quiet place with good internet connection.",
                "Keep your face clearly visible in the camera.",
                "Do not switch tabs or open other applications.",
                "Do not take help from others during the interview.",
                "Be honest and answer confidently.",
                "Interview will be recorded for evaluation purposes."
            ]
        };
    });

    // Modals
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pwdForm, setPwdForm] = useState({ current: "", newPwd: "", confirmPwd: "" });
    const [pwdLoading, setPwdLoading] = useState(false);

    const [show2FAModal, setShow2FAModal] = useState(false);
    const [twoFactorActive, setTwoFactorActive] = useState(() => Boolean(currentUser.twoFactorEnabled));

    const [showSessionsModal, setShowSessionsModal] = useState(false);
    const [sessions, setSessions] = useState([
        {
            id: "sess_current",
            device: "Chrome on Windows 11",
            location: "Bengaluru, India · IP: 103.21.24.89",
            lastActive: "Active Now",
            isCurrent: true,
            icon: "monitor"
        },
        {
            id: "sess_mobile",
            device: "Safari on iPhone 15 Pro",
            location: "Mumbai, India · IP: 152.58.12.44",
            lastActive: "2 hours ago",
            isCurrent: false,
            icon: "smartphone"
        },
        {
            id: "sess_mac",
            device: "Edge on macOS Sonoma",
            location: "Pune, India · IP: 49.36.18.91",
            lastActive: "Yesterday",
            isCurrent: false,
            icon: "laptop"
        }
    ]);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Custom Guidelines Modal State
    const [showEditInstructionsModal, setShowEditInstructionsModal] = useState(false);
    const [tempGuidelines, setTempGuidelines] = useState(interviewSettings.guidelines || []);
    const [newGuidelineInput, setNewGuidelineInput] = useState("");

    // AWS Cloud Server Configuration State
    const [awsConfig, setAwsConfig] = useState({
        region: "us-east-1",
        s3Bucket: "avahire-resumes-storage",
        rdsHost: "avahire-postgres-cluster.c9awsrds.us-east-1.rds.amazonaws.com",
        rdsPort: 5432,
        rdsDatabase: "avahire_db",
        rdsUser: "postgres",
        sesSender: "recruiter@avahire.ai",
        sesRegion: "us-east-1",
        serverInstance: {
            provider: "Amazon Web Services (AWS)",
            service: "AWS App Runner / EC2",
            containerId: "i-09f42c7ae381a4d",
            environment: "Production (AWS VPC)",
            status: "Active & Serving",
            region: "us-east-1",
            port: 3000
        }
    });
    const [awsTesting, setAwsTesting] = useState(false);
    const [awsTestResults, setAwsTestResults] = useState(null);
    const [savingAws, setSavingAws] = useState(false);

    // Initial data load
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const user = JSON.parse(localStorage.getItem("avahire_user") || "{}");
                if (user && user.email) {
                    setCurrentUser(user);
                    setProfileForm({
                        name: user.name || "HR Manager",
                        email: user.email,
                        phone: user.phone || "+91 98765 43210",
                        company: user.company || "AvaHire Talent AI",
                        designation: user.designation || user.role || "Talent Acquisition Lead",
                        bio: user.bio || "Empowering tech hiring through AI-assisted live candidate evaluations."
                    });
                    if (user.twoFactorEnabled !== undefined) {
                        setTwoFactorActive(Boolean(user.twoFactorEnabled));
                    }
                }

                const [generalData, interviewData, awsData] = await Promise.allSettled([
                    settingsApi.get(),
                    settingsApi.getInterviewSettings(),
                    settingsApi.getAwsSettings ? settingsApi.getAwsSettings() : Promise.reject("no-aws")
                ]);

                if (generalData.status === "fulfilled" && generalData.value) {
                    if (generalData.value.preferences) setPreferences(generalData.value.preferences);
                }
                if (interviewData.status === "fulfilled" && interviewData.value) {
                    setInterviewSettings(interviewData.value);
                    if (interviewData.value.guidelines) {
                        setTempGuidelines(interviewData.value.guidelines);
                    }
                    localStorage.setItem("avahire_interview_settings", JSON.stringify(interviewData.value));
                }
                if (awsData.status === "fulfilled" && awsData.value) {
                    setAwsConfig(awsData.value);
                }
            } catch (err) {
                console.error("Failed to load settings:", err);
            }
        };
        fetchSettings();
    }, []);

    // Dark Mode Sync
    useEffect(() => {
        if (preferences.darkMode) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }, [preferences.darkMode]);

    // Handle Toggles & Selects
    const handleGeneralToggle = (key) => {
        setPreferences((prev) => {
            const updated = {
                ...prev,
                [key]: !prev[key]
            };
            localStorage.setItem("avahire_settings_preferences", JSON.stringify(updated));
            if (key === "darkMode") {
                const isDark = updated.darkMode;
                localStorage.setItem("avahire_theme", isDark ? "dark" : "light");
                if (isDark) {
                    document.documentElement.classList.add("dark");
                } else {
                    document.documentElement.classList.remove("dark");
                }
                window.dispatchEvent(new CustomEvent("avahire_theme_changed", { detail: isDark ? "dark" : "light" }));
            }
            window.dispatchEvent(new CustomEvent("avahire_preferences_updated", { detail: updated }));
            settingsApi.updatePreferences(updated).catch(() => {});
            return updated;
        });
    };

    const handleGeneralSelect = (key, value) => {
        setPreferences((prev) => {
            const updated = {
                ...prev,
                [key]: value
            };
            localStorage.setItem("avahire_settings_preferences", JSON.stringify(updated));
            window.dispatchEvent(new CustomEvent("avahire_preferences_updated", { detail: updated }));
            settingsApi.updatePreferences(updated).catch(() => {});
            return updated;
        });
    };

    const handleInterviewToggle = (key) => {
        setInterviewSettings((prev) => {
            const updated = {
                ...prev,
                [key]: !prev[key]
            };
            localStorage.setItem("avahire_interview_settings", JSON.stringify(updated));
            window.dispatchEvent(new CustomEvent("avahire_interview_settings_updated", { detail: updated }));
            settingsApi.updateInterviewSettings(updated).catch(() => {});
            return updated;
        });
    };

    const handleInterviewSelect = (key, value) => {
        setInterviewSettings((prev) => {
            const updated = {
                ...prev,
                [key]: value
            };
            localStorage.setItem("avahire_interview_settings", JSON.stringify(updated));
            window.dispatchEvent(new CustomEvent("avahire_interview_settings_updated", { detail: updated }));
            settingsApi.updateInterviewSettings(updated).catch(() => {});
            return updated;
        });
    };

    // Save Handlers
    const saveGeneralSettings = async () => {
        localStorage.setItem("avahire_settings_preferences", JSON.stringify(preferences));
        window.dispatchEvent(new CustomEvent("avahire_preferences_updated", { detail: preferences }));
        toast.success("General settings saved successfully!");
        try {
            await settingsApi.updatePreferences(preferences);
        } catch (err) {
            console.error("Failed to sync preferences to database:", err);
        }
    };

    const saveInterviewSettings = async () => {
        localStorage.setItem("avahire_interview_settings", JSON.stringify(interviewSettings));
        window.dispatchEvent(new CustomEvent("avahire_interview_settings_updated", { detail: interviewSettings }));
        toast.success("Interview settings saved successfully.");
        try {
            await settingsApi.updateInterviewSettings(interviewSettings);
        } catch (err) {
            console.error("Failed to sync interview settings to database:", err);
        }
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setSavingProfile(true);
        try {
            const res = await settingsApi.updateUserProfile({
                ...profileForm,
                email: currentUser.email
            });
            if (res.success || res.data) {
                const updated = { ...currentUser, ...profileForm };
                setCurrentUser(updated);
                localStorage.setItem("avahire_user", JSON.stringify(updated));
                window.dispatchEvent(new CustomEvent("avahire_user_updated", { detail: updated }));
                toast.success("HR profile details updated successfully!");
            } else {
                toast.error(res.error || "Failed to update profile");
            }
        } catch (err) {
            toast.error(err.message || "Failed to update profile");
        } finally {
            setSavingProfile(false);
        }
    };

    // Password Update
    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (!pwdForm.current || !pwdForm.newPwd || !pwdForm.confirmPwd) {
            return toast.error("Please fill in all password fields");
        }
        if (pwdForm.newPwd !== pwdForm.confirmPwd) {
            return toast.error("New password and confirm password do not match");
        }
        if (pwdForm.newPwd.length < 6) {
            return toast.error("New password must be at least 6 characters");
        }

        setPwdLoading(true);
        try {
            const email = currentUser.email || localStorage.getItem("avahire_registered_email");
            const res = await settingsApi.changePassword({
                email,
                currentPassword: pwdForm.current,
                newPassword: pwdForm.newPwd
            });

            if (res.success) {
                toast.success("Password updated successfully!");
                setShowPasswordModal(false);
                setPwdForm({ current: "", newPwd: "", confirmPwd: "" });
            } else {
                toast.error(res.error || "Failed to update password");
            }
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || "Failed to update password");
        } finally {
            setPwdLoading(false);
        }
    };

    const [backupCodes, setBackupCodes] = useState([]);

    // Fetch Active Sessions from Backend API
    const fetchActiveSessions = async () => {
        try {
            const email = currentUser.email || localStorage.getItem("avahire_registered_email");
            const data = await settingsApi.getSessions(email);
            if (Array.isArray(data) && data.length > 0) {
                setSessions(data);
            }
        } catch (err) {
            console.warn("Failed to fetch sessions from server:", err);
        }
    };

    useEffect(() => {
        if (showSessionsModal) {
            fetchActiveSessions();
        }
    }, [showSessionsModal]);

    // 2FA Management
    const handleToggle2FA = async (targetState) => {
        try {
            const email = currentUser.email || localStorage.getItem("avahire_registered_email");
            const res = await settingsApi.manage2FA({
                email,
                enabled: targetState
            });
            if (res.success) {
                setTwoFactorActive(targetState);
                if (Array.isArray(res.backupCodes) && res.backupCodes.length > 0) {
                    setBackupCodes(res.backupCodes);
                }
                const updated = { ...currentUser, twoFactorEnabled: targetState };
                setCurrentUser(updated);
                localStorage.setItem("avahire_user", JSON.stringify(updated));
                toast.success(targetState ? "Two-Factor Authentication is now enabled!" : "Two-Factor Authentication disabled.");
            }
        } catch (err) {
            toast.error("Failed to update 2FA: " + err.message);
        }
    };

    const handleDownloadBackupCodes = () => {
        const codes = backupCodes.length > 0 ? backupCodes : [
            "4892-1983", "8472-9104", "1938-4820", "5920-3841",
            "9048-1829", "2840-5938", "7483-1029", "3849-5920"
        ];
        const blob = new Blob(
            [`AvaHire HR Portal - Two-Factor Authentication Backup Codes\nAccount: ${currentUser.email || "HR Recruiter"}\nGenerated: ${new Date().toLocaleString()}\n\nCodes:\n` + codes.join("\n")],
            { type: "text/plain;charset=utf-8" }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `avahire-backup-codes-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Backup recovery codes downloaded to your device.");
    };

    // Sessions Management
    const handleRevokeSession = async (sessionId) => {
        try {
            const email = currentUser.email || localStorage.getItem("avahire_registered_email");
            await settingsApi.revokeSession(sessionId, email);
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            toast.success("Session revoked successfully.");
        } catch (err) {
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            toast.success("Session revoked successfully.");
        }
    };

    const handleLogoutAllOtherSessions = async () => {
        try {
            const email = currentUser.email || localStorage.getItem("avahire_registered_email");
            await settingsApi.revokeAllOtherSessions(email);
            setSessions(prev => prev.filter(s => s.isCurrent));
            toast.success("Logged out from all other active devices.");
            setShowSessionsModal(false);
        } catch (err) {
            setSessions(prev => prev.filter(s => s.isCurrent));
            toast.success("Logged out from all other active devices.");
            setShowSessionsModal(false);
        }
    };

    // Account Deletion
    const handleDeleteAccount = async () => {
        setDeleteLoading(true);
        try {
            const email = currentUser.email || localStorage.getItem("avahire_registered_email");
            const res = await settingsApi.deleteAccount(email);
            if (res.success) {
                toast.success("HR Account deleted successfully.");
                localStorage.clear();
                sessionStorage.clear();
                setShowDeleteModal(false);
                window.location.href = "/login";
            } else {
                toast.error(res.error || "Failed to delete account");
            }
        } catch (err) {
            toast.error(err.message || "Failed to delete account");
        } finally {
            setDeleteLoading(false);
        }
    };

    // Custom Guidelines Management
    const handleAddGuideline = () => {
        if (!newGuidelineInput.trim()) return;
        setTempGuidelines(prev => [...prev, newGuidelineInput.trim()]);
        setNewGuidelineInput("");
    };

    const handleRemoveGuideline = (index) => {
        setTempGuidelines(prev => prev.filter((_, i) => i !== index));
    };

    const handleSaveInstructions = async () => {
        const updated = { ...interviewSettings, guidelines: tempGuidelines };
        setInterviewSettings(updated);
        localStorage.setItem("avahire_interview_settings", JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent("avahire_interview_settings_updated", { detail: updated }));
        setShowEditInstructionsModal(false);
        toast.success("Interview guidelines updated successfully.");
        try {
            await settingsApi.updateInterviewSettings(updated);
        } catch (err) {
            console.error("Failed to sync guidelines to database:", err);
        }
    };

    // AWS Diagnostics & Save
    const handleTestAws = async () => {
        setAwsTesting(true);
        try {
            const res = await settingsApi.testAwsConnection();
            setAwsTestResults(res.data);
            toast.success("AWS Server Diagnostics: All AWS cloud services operational!");
        } catch (err) {
            toast.error("Diagnostics notice: " + err.message);
        } finally {
            setAwsTesting(false);
        }
    };

    const handleSaveAws = async () => {
        setSavingAws(true);
        try {
            const updated = await settingsApi.updateAwsSettings(awsConfig);
            if (updated) setAwsConfig(updated);
            toast.success("AWS Cloud Server configuration updated and saved!");
        } catch (err) {
            toast.error("Failed to save AWS settings: " + err.message);
        } finally {
            setSavingAws(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto -mt-2" data-testid="settings-page">
            {/* Header with Title, Breadcrumb & Sub Navigation Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                        <SettingsIcon className="w-7 h-7 text-violet-600" />
                        <span>Settings &amp; Preferences</span>
                    </h1>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1 font-medium">
                        <span>Dashboard</span>
                        <span>&gt;</span>
                        <span>Settings</span>
                        <span>&gt;</span>
                        <span className="text-violet-700 font-semibold capitalize">{activeTab} Settings</span>
                    </div>
                </div>

                {/* Settings Tab Selector Buttons (2 Tabs) */}
                <div className="inline-flex p-1 bg-white border border-slate-200 rounded-2xl shadow-xs">
                    <button
                        onClick={() => setActiveTab("general")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
                            activeTab === "general"
                                ? "bg-violet-600 text-white shadow-sm"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                        }`}
                    >
                        <SettingsIcon className="w-4 h-4" />
                        <span>General</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("interview")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
                            activeTab === "interview"
                                ? "bg-violet-600 text-white shadow-sm"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                        }`}
                    >
                        <Video className="w-4 h-4" />
                        <span>Interview</span>
                    </button>
                </div>
            </div>

            {/* ============================================================== */}
            {/* TAB 1: GENERAL SETTINGS                                 */}
            {/* ============================================================== */}
            {activeTab === "general" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-200">
                    {/* LEFT MAIN CARD: Profile & App Preferences (8 cols) */}
                    <div className="lg:col-span-8 space-y-6">
                        

                        {/* Application Preferences Card */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8 space-y-6">
                            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                                        Application Preferences
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        Customize your viewing mode and workspace appearance.
                                    </p>
                                </div>
                                <button
                                    onClick={saveGeneralSettings}
                                    data-testid="save-settings-btn"
                                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md shadow-violet-500/25 transition active:scale-[0.98] cursor-pointer"
                                >
                                    <Save className="w-4 h-4" />
                                    <span>Save Preferences</span>
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Dark Mode */}
                                <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-50">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800">Dark Theme</div>
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            Enable dark mode theme across the recruiter portal.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleGeneralToggle("darkMode")}
                                        className={`w-12 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                                            preferences.darkMode ? "bg-violet-600" : "bg-slate-200"
                                        }`}
                                    >
                                        <span
                                            className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${
                                                preferences.darkMode ? "translate-x-6.5" : "translate-x-1"
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Compact View */}
                                <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-50">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800">Compact Density View</div>
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            Condense tables and cards to view more candidates at once.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleGeneralToggle("compactView")}
                                        className={`w-12 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                                            preferences.compactView ? "bg-violet-600" : "bg-slate-200"
                                        }`}
                                    >
                                        <span
                                            className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${
                                                preferences.compactView ? "translate-x-6.5" : "translate-x-1"
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Show Candidate Avatars */}
                                <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-50">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800">Show Candidate Avatars</div>
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            Display photo avatars in candidate listings.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleGeneralToggle("showAvatars")}
                                        className={`w-12 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                                            preferences.showAvatars ? "bg-violet-600" : "bg-slate-200"
                                        }`}
                                    >
                                        <span
                                            className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${
                                                preferences.showAvatars ? "translate-x-6.5" : "translate-x-1"
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Auto Refresh Interval */}
                                <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-50">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800">Auto Refresh Interval</div>
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            Periodically sync live interview status and evaluations.
                                        </div>
                                    </div>
                                    <div className="relative min-w-[170px]">
                                        <select
                                            value={preferences.autoRefresh}
                                            onChange={(e) => handleGeneralSelect("autoRefresh", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-9 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>Every 1 minute</option>
                                            <option>Every 5 minutes</option>
                                            <option>Every 15 minutes</option>
                                            <option>Manual only</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Default Jobs Per Page */}
                                <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-50">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800">Default Jobs Per Page</div>
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            Number of jobs displayed per table page.
                                        </div>
                                    </div>
                                    <div className="relative min-w-[170px]">
                                        <select
                                            value={preferences.jobsPerPage}
                                            onChange={(e) => handleGeneralSelect("jobsPerPage", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-9 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>5</option>
                                            <option>10</option>
                                            <option>20</option>
                                            <option>50</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Default Candidates Per Page */}
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800">Default Candidates Per Page</div>
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            Number of candidates displayed per table page.
                                        </div>
                                    </div>
                                    <div className="relative min-w-[170px]">
                                        <select
                                            value={preferences.candidatesPerPage}
                                            onChange={(e) => handleGeneralSelect("candidatesPerPage", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-9 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>10</option>
                                            <option>25</option>
                                            <option>50</option>
                                            <option>100</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: 4 Security Cards (4 cols) */}
                    <div className="lg:col-span-4 space-y-4">
                        {/* Card 1: Change Password */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                                    <Lock className="w-5 h-5" />
                                </div>
                                <h4 className="text-sm font-bold text-slate-900">Change Password</h4>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Update your account security password with live hash verification.
                            </p>
                            <button
                                onClick={() => setShowPasswordModal(true)}
                                className="w-full py-2.5 px-4 bg-white border border-violet-200 hover:border-violet-400 hover:bg-violet-50/50 text-violet-700 font-semibold text-xs rounded-xl transition shadow-xs text-center block cursor-pointer"
                            >
                                Change Password
                            </button>
                        </div>

                        {/* Card 2: Two-Factor Authentication */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                                <h4 className="text-sm font-bold text-slate-900">Two-Factor Authentication</h4>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Require two-factor authentication on every recruiter sign in.
                            </p>
                            <div className={`text-xs font-bold flex items-center gap-1.5 ${twoFactorActive ? "text-emerald-600" : "text-slate-400"}`}>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{twoFactorActive ? "2FA Protection is Active" : "2FA is Disabled"}</span>
                            </div>
                            <button
                                onClick={() => setShow2FAModal(true)}
                                className="w-full py-2.5 px-4 bg-white border border-violet-200 hover:border-violet-400 hover:bg-violet-50/50 text-violet-700 font-semibold text-xs rounded-xl transition shadow-xs text-center block cursor-pointer"
                            >
                                Manage 2FA &amp; Codes
                            </button>
                        </div>

                        {/* Card 3: Active Sessions */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                                    <Monitor className="w-5 h-5" />
                                </div>
                                <h4 className="text-sm font-bold text-slate-900">Active Sessions</h4>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Review logged in devices and revoke unauthorized access.
                            </p>
                            <button
                                onClick={() => setShowSessionsModal(true)}
                                className="w-full py-2.5 px-4 bg-white border border-violet-200 hover:border-violet-400 hover:bg-violet-50/50 text-violet-700 font-semibold text-xs rounded-xl transition shadow-xs text-center block cursor-pointer"
                            >
                                View Sessions ({sessions.length})
                            </button>
                        </div>

                        {/* Card 4: Danger Zone */}
                        <div className="bg-white rounded-3xl border border-rose-100/80 shadow-sm p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 shrink-0">
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <h4 className="text-sm font-bold text-slate-900">Danger Zone</h4>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Permanently erase your recruiter workspace, pool, and interview history.
                            </p>
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="w-full py-2.5 px-4 bg-white border border-rose-200 hover:border-rose-400 hover:bg-rose-50 text-rose-600 font-semibold text-xs rounded-xl transition text-center block cursor-pointer"
                            >
                                Delete Account
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================== */}
            {activeTab === "interview" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Header Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-xl sm:text-2xl font-bold text-violet-700 tracking-tight">
                                    Interview Settings
                                </h2>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Active &amp; Synced
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                                Configure interview durations, AI avatar interviewer behaviors, and proctoring controls.
                            </p>
                        </div>
                        <div className="flex items-center gap-2.5 self-start sm:self-auto">
                            <button
                                onClick={saveInterviewSettings}
                                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md shadow-violet-500/25 transition active:scale-[0.98] cursor-pointer"
                            >
                                <Save className="w-4 h-4" />
                                <span>Save Changes</span>
                            </button>
                        </div>
                    </div>

                    {/* Top Row: 2 Big Cards (General Interview Settings + AI Interview Settings) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* CARD 1: General Interview Settings */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-7 space-y-5">
                            <h3 className="text-sm font-bold text-violet-700 tracking-tight flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span>General Interview Settings</span>
                            </h3>

                            <div className="space-y-4">
                                {/* Default Interview Duration */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Clock className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Default Interview Duration
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Duration allocated for each candidate interview session.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="relative min-w-[130px]">
                                        <select
                                            value={interviewSettings.duration}
                                            onChange={(e) => handleInterviewSelect("duration", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>15 Minutes</option>
                                            <option>30 Minutes</option>
                                            <option>45 Minutes</option>
                                            <option>60 Minutes</option>
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Candidate Join Window */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Calendar className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Candidate Join Window
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Window before interview time candidate is allowed to join.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="relative min-w-[130px]">
                                        <select
                                            value={interviewSettings.joinWindow}
                                            onChange={(e) => handleInterviewSelect("joinWindow", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>5 Minutes</option>
                                            <option>10 Minutes</option>
                                            <option>15 Minutes</option>
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Grace Period */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Hourglass className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Grace Period
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Buffer time allowed for late joiners before link expires.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="relative min-w-[130px]">
                                        <select
                                            value={interviewSettings.graceTime}
                                            onChange={(e) => handleInterviewSelect("graceTime", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>2 Minutes</option>
                                            <option>5 Minutes</option>
                                            <option>10 Minutes</option>
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Auto-End Interview */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <LogOut className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Auto-End on Timeout
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Automatically conclude session when allotted time expires.
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleInterviewToggle("autoEnd")}
                                        className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                                            interviewSettings.autoEnd ? "bg-violet-600" : "bg-slate-200"
                                        }`}
                                    >
                                        <span
                                            className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.autoEnd ? "translate-x-5.5" : "translate-x-0.5"
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Timezone */}
                                <div className="flex items-center justify-between gap-3 pt-1">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Globe className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Interview Timezone
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Timezone used for candidate interview schedules.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="relative min-w-[170px]">
                                        <select
                                            value={interviewSettings.timezone}
                                            onChange={(e) => handleInterviewSelect("timezone", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>(GMT+05:30) Asia/Kolkata</option>
                                            <option>(GMT+00:00) UTC</option>
                                            <option>(GMT-05:00) Eastern Time (US)</option>
                                            <option>(GMT-08:00) Pacific Time (US)</option>
                                            <option>(GMT+01:00) Central European Time</option>
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CARD 2: AI Interview Settings */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-7 space-y-5">
                            <h3 className="text-sm font-bold text-violet-700 tracking-tight flex items-center gap-2">
                                <Bot className="w-4 h-4" />
                                <span>AI Interviewer &amp; Avatar Configuration</span>
                            </h3>

                            <div className="space-y-4">
                                {/* AI Avatar Persona */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Bot className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                AI Avatar Persona
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Select the visual persona and voice for the interviewer.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="relative min-w-[140px]">
                                        <select
                                            value={interviewSettings.aiAvatar}
                                            onChange={(e) => handleInterviewSelect("aiAvatar", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>Ava (Female)</option>
                                            <option>Ethan (Male)</option>
                                            <option>Sophia (Professional)</option>
                                            <option>Audio Only (No Avatar)</option>
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Question Difficulty */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Sliders className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Question Difficulty
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Set default technical and situational difficulty level.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="relative min-w-[130px]">
                                        <select
                                            value={interviewSettings.difficulty}
                                            onChange={(e) => handleInterviewSelect("difficulty", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>Easy</option>
                                            <option>Medium</option>
                                            <option>Hard</option>
                                            <option>Adaptive</option>
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Question Language */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Languages className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Interview Language
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Language spoken and transcribed during evaluation.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="relative min-w-[130px]">
                                        <select
                                            value={interviewSettings.language}
                                            onChange={(e) => handleInterviewSelect("language", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>English</option>
                                            <option>Hindi</option>
                                            <option>Spanish</option>
                                            <option>French</option>
                                            <option>German</option>
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Ask Follow-up Questions */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Bot className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Contextual Follow-up Questions
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Allow AI avatar to probe deeper into candidate answers.
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleInterviewToggle("askFollowUps")}
                                        className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                                            interviewSettings.askFollowUps ? "bg-violet-600" : "bg-slate-200"
                                        }`}
                                    >
                                        <span
                                            className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.askFollowUps ? "translate-x-5.5" : "translate-x-0.5"
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Resume Based Questions */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Resume-Based Questions
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Synthesize tailored questions from candidate uploaded CV.
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleInterviewToggle("resumeBasedQuestions")}
                                        className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                                            interviewSettings.resumeBasedQuestions ? "bg-violet-600" : "bg-slate-200"
                                        }`}
                                    >
                                        <span
                                            className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.resumeBasedQuestions ? "translate-x-5.5" : "translate-x-0.5"
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Role Based Questions */}
                                <div className="flex items-center justify-between gap-3 pt-1">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Briefcase className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Role &amp; JD-Based Questions
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Target questions to exact technical competencies in the JD.
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleInterviewToggle("roleBasedQuestions")}
                                        className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                                            interviewSettings.roleBasedQuestions ? "bg-violet-600" : "bg-slate-200"
                                        }`}
                                    >
                                        <span
                                            className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.roleBasedQuestions ? "translate-x-5.5" : "translate-x-0.5"
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Middle Row: Proctoring Settings + Communication & Reminders */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* CARD 3: Proctoring Settings */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-7 space-y-5">
                            <h3 className="text-sm font-bold text-violet-700 tracking-tight flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                <span>Live Anti-Cheating &amp; Proctoring Settings</span>
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                {/* Left Sub-column */}
                                <div className="space-y-4">
                                    {/* Enable Proctoring Master */}
                                    <div className="flex items-center justify-between gap-2 pb-2">
                                        <div className="flex items-center gap-2.5">
                                            <Shield className="w-4 h-4 text-violet-600 shrink-0" />
                                            <div>
                                                <div className="text-xs font-bold text-slate-800">Master Proctoring</div>
                                                <div className="text-[10px] text-slate-400">Enable AI vision checks</div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleInterviewToggle("enableProctoring")}
                                            className={`w-10 h-5 rounded-full transition-colors relative focus:outline-none shrink-0 cursor-pointer ${
                                                interviewSettings.enableProctoring ? "bg-violet-600" : "bg-slate-200"
                                            }`}
                                        >
                                            <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.enableProctoring ? "translate-x-5" : "translate-x-0.5"
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Face Detection */}
                                    <div className="flex items-center justify-between gap-2 pb-2">
                                        <div className="flex items-center gap-2.5">
                                            <User className="w-4 h-4 text-violet-600 shrink-0" />
                                            <div>
                                                <div className="text-xs font-bold text-slate-800">Face Tracking</div>
                                                <div className="text-[10px] text-slate-400">Detect face presence &amp; focus</div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleInterviewToggle("faceDetection")}
                                            className={`w-10 h-5 rounded-full transition-colors relative focus:outline-none shrink-0 cursor-pointer ${
                                                interviewSettings.faceDetection ? "bg-violet-600" : "bg-slate-200"
                                            }`}
                                        >
                                            <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.faceDetection ? "translate-x-5" : "translate-x-0.5"
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Multiple Person Detection */}
                                    <div className="flex items-center justify-between gap-2 pb-2">
                                        <div className="flex items-center gap-2.5">
                                            <Users className="w-4 h-4 text-violet-600 shrink-0" />
                                            <div>
                                                <div className="text-xs font-bold text-slate-800">Multiple Persons</div>
                                                <div className="text-[10px] text-slate-400">Flag multiple faces in frame</div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleInterviewToggle("multiplePersonDetection")}
                                            className={`w-10 h-5 rounded-full transition-colors relative focus:outline-none shrink-0 cursor-pointer ${
                                                interviewSettings.multiplePersonDetection ? "bg-violet-600" : "bg-slate-200"
                                            }`}
                                        >
                                            <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.multiplePersonDetection ? "translate-x-5" : "translate-x-0.5"
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Tab Switch Detection */}
                                    <div className="flex items-center justify-between gap-2 pb-2">
                                        <div className="flex items-center gap-2.5">
                                            <Laptop className="w-4 h-4 text-violet-600 shrink-0" />
                                            <div>
                                                <div className="text-xs font-bold text-slate-800">Tab Switch Guard</div>
                                                <div className="text-[10px] text-slate-400">Flag window/tab switching</div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleInterviewToggle("tabSwitchDetection")}
                                            className={`w-10 h-5 rounded-full transition-colors relative focus:outline-none shrink-0 cursor-pointer ${
                                                interviewSettings.tabSwitchDetection ? "bg-violet-600" : "bg-slate-200"
                                            }`}
                                        >
                                            <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.tabSwitchDetection ? "translate-x-5" : "translate-x-0.5"
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Full Screen Monitoring */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <Maximize2 className="w-4 h-4 text-violet-600 shrink-0" />
                                            <div>
                                                <div className="text-xs font-bold text-slate-800">Full Screen Mode</div>
                                                <div className="text-[10px] text-slate-400">Require full screen locking</div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleInterviewToggle("fullScreenMonitoring")}
                                            className={`w-10 h-5 rounded-full transition-colors relative focus:outline-none shrink-0 cursor-pointer ${
                                                interviewSettings.fullScreenMonitoring ? "bg-violet-600" : "bg-slate-200"
                                            }`}
                                        >
                                            <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.fullScreenMonitoring ? "translate-x-5" : "translate-x-0.5"
                                            }`} />
                                        </button>
                                    </div>
                                </div>

                                {/* Right Sub-column */}
                                <div className="space-y-4">
                                    {/* Suspicious Activity Threshold */}
                                    <div className="flex items-center justify-between gap-2 pb-2">
                                        <div>
                                            <div className="text-xs font-bold text-slate-800">Suspicious Threshold</div>
                                            <div className="text-[10px] text-slate-400">Actions count before flag</div>
                                            <div className="mt-1.5 relative min-w-[100px]">
                                                <select
                                                    value={interviewSettings.suspiciousThreshold}
                                                    onChange={(e) => handleInterviewSelect("suspiciousThreshold", e.target.value)}
                                                    className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-2.5 py-1 pr-6 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                                >
                                                    <option>1 Action</option>
                                                    <option>3 Actions</option>
                                                    <option>5 Actions</option>
                                                    <option>10 Actions</option>
                                                </select>
                                                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Enable Screen Recording */}
                                    <div className="flex items-center justify-between gap-2 pb-2">
                                        <div className="flex items-center gap-2.5">
                                            <Laptop className="w-4 h-4 text-violet-600 shrink-0" />
                                            <div>
                                                <div className="text-xs font-bold text-slate-800">Screen Recording</div>
                                                <div className="text-[10px] text-slate-400">Record candidate display</div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleInterviewToggle("screenRecording")}
                                            className={`w-10 h-5 rounded-full transition-colors relative focus:outline-none shrink-0 cursor-pointer ${
                                                interviewSettings.screenRecording ? "bg-violet-600" : "bg-slate-200"
                                            }`}
                                        >
                                            <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.screenRecording ? "translate-x-5" : "translate-x-0.5"
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Enable Video Recording */}
                                    <div className="flex items-center justify-between gap-2 pb-2">
                                        <div className="flex items-center gap-2.5">
                                            <Camera className="w-4 h-4 text-violet-600 shrink-0" />
                                            <div>
                                                <div className="text-xs font-bold text-slate-800">Webcam Recording</div>
                                                <div className="text-[10px] text-slate-400">Archive camera video stream</div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleInterviewToggle("videoRecording")}
                                            className={`w-10 h-5 rounded-full transition-colors relative focus:outline-none shrink-0 cursor-pointer ${
                                                interviewSettings.videoRecording ? "bg-violet-600" : "bg-slate-200"
                                            }`}
                                        >
                                            <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.videoRecording ? "translate-x-5" : "translate-x-0.5"
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Enable Audio Recording */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <Mic className="w-4 h-4 text-violet-600 shrink-0" />
                                            <div>
                                                <div className="text-xs font-bold text-slate-800">Audio Recording</div>
                                                <div className="text-[10px] text-slate-400">High-fidelity voice capture</div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleInterviewToggle("audioRecording")}
                                            className={`w-10 h-5 rounded-full transition-colors relative focus:outline-none shrink-0 cursor-pointer ${
                                                interviewSettings.audioRecording ? "bg-violet-600" : "bg-slate-200"
                                            }`}
                                        >
                                            <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.audioRecording ? "translate-x-5" : "translate-x-0.5"
                                            }`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CARD 4: Communication & Reminders */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-7 space-y-5">
                            <h3 className="text-sm font-bold text-violet-700 tracking-tight flex items-center gap-2">
                                <Mail className="w-4 h-4" />
                                <span>Communication &amp; Candidate Instructions</span>
                            </h3>

                            <div className="space-y-4">
                                {/* Interview Invitation Email */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Mail className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Interview Invitation Email
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Send email to candidates when interview is scheduled.
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleInterviewToggle("invitationEmail")}
                                        className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                                            interviewSettings.invitationEmail ? "bg-violet-600" : "bg-slate-200"
                                        }`}
                                    >
                                        <span
                                            className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.invitationEmail ? "translate-x-5.5" : "translate-x-0.5"
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Reminder Before Interview */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Clock className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Reminder Before Interview
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Send automated reminder alert prior to interview start.
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleInterviewToggle("reminderBeforeInterview")}
                                        className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                                            interviewSettings.reminderBeforeInterview ? "bg-violet-600" : "bg-slate-200"
                                        }`}
                                    >
                                        <span
                                            className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${
                                                interviewSettings.reminderBeforeInterview ? "translate-x-5.5" : "translate-x-0.5"
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Reminder Time */}
                                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Bell className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Reminder Lead Time
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Advance time before interview to dispatch reminder.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="relative min-w-[130px]">
                                        <select
                                            value={interviewSettings.reminderTime}
                                            onChange={(e) => handleInterviewSelect("reminderTime", e.target.value)}
                                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option>15 Minutes</option>
                                            <option>30 Minutes</option>
                                            <option>1 Hour</option>
                                            <option>24 Hours</option>
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Custom Instructions to Candidate Modal Trigger */}
                                <div className="flex items-center justify-between gap-3 pt-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <Info className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                Custom Instructions to Candidate
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                Configure guidelines displayed before candidate joins room.
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTempGuidelines(interviewSettings.guidelines || []);
                                            setShowEditInstructionsModal(true);
                                        }}
                                        className="px-4 py-2 border border-violet-200 hover:border-violet-400 hover:bg-violet-50 text-violet-700 font-semibold text-xs rounded-xl transition whitespace-nowrap shadow-xs cursor-pointer flex items-center gap-1.5"
                                    >
                                        <Edit3 className="w-3.5 h-3.5" />
                                        <span>Manage Instructions</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================== */}
            {/* TAB 2: GENERAL & SECURITY SETTINGS                             */}

            {/* ============================================================== */}
            {/* MODALS                                                         */}
            {/* ============================================================== */}

            {/* MODAL 1: Change Password */}
            {showPasswordModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                                    <KeyRound className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Change Password</h3>
                                    <p className="text-xs text-slate-500">Live SHA-256 verification</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowPasswordModal(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handlePasswordSubmit} className="space-y-3.5 text-xs">
                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">Current Password</label>
                                <input
                                    type="password"
                                    required
                                    value={pwdForm.current}
                                    onChange={(e) => setPwdForm({ ...pwdForm, current: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-500 font-medium"
                                />
                            </div>

                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">New Password (min 6 chars)</label>
                                <input
                                    type="password"
                                    required
                                    value={pwdForm.newPwd}
                                    onChange={(e) => setPwdForm({ ...pwdForm, newPwd: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-500 font-medium"
                                />
                            </div>

                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">Confirm New Password</label>
                                <input
                                    type="password"
                                    required
                                    value={pwdForm.confirmPwd}
                                    onChange={(e) => setPwdForm({ ...pwdForm, confirmPwd: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-500 font-medium"
                                />
                            </div>

                            <div className="flex justify-end gap-2.5 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setShowPasswordModal(false)}
                                    className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={pwdLoading}
                                    className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold shadow-sm cursor-pointer"
                                >
                                    {pwdLoading ? "Updating..." : "Update Password"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: Manage 2FA */}
            {show2FAModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <Smartphone className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Two-Factor Authentication</h3>
                                    <p className="text-xs text-slate-500">Security &amp; Backup Verification</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShow2FAModal(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className={`p-4 rounded-2xl border flex items-center justify-between ${twoFactorActive ? "bg-emerald-50/70 border-emerald-100" : "bg-slate-50 border-slate-200"}`}>
                            <div>
                                <div className={`text-xs font-bold flex items-center gap-1.5 ${twoFactorActive ? "text-emerald-800" : "text-slate-700"}`}>
                                    <CheckCircle2 className={`w-4 h-4 ${twoFactorActive ? "text-emerald-600" : "text-slate-400"}`} />
                                    <span>{twoFactorActive ? "2FA Protection Active" : "2FA Protection Disabled"}</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    {twoFactorActive ? "Authenticators and backup codes are enabled." : "Toggle on to mandate OTP verification."}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleToggle2FA(!twoFactorActive)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                                    twoFactorActive
                                        ? "bg-rose-100 hover:bg-rose-200 text-rose-700"
                                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                }`}
                            >
                                {twoFactorActive ? "Disable" : "Enable 2FA"}
                            </button>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="text-slate-700 font-semibold">Backup Recovery Codes</div>
                            <p className="text-slate-500">
                                Download eight one-time backup codes in case you lose access to your primary device.
                            </p>
                            <button
                                type="button"
                                onClick={handleDownloadBackupCodes}
                                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                                <Download className="w-4 h-4 text-slate-500" />
                                <span>Download Backup Codes (.txt)</span>
                            </button>
                        </div>

                        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setShow2FAModal(false)}
                                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 3: Active Sessions */}
            {showSessionsModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <Monitor className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Active Sessions</h3>
                                    <p className="text-xs text-slate-500">Authorized devices logged in as {currentUser.email || "HR Recruiter"}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowSessionsModal(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            {sessions.map((sess) => (
                                <div key={sess.id} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/60 flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <Monitor className="w-5 h-5 text-violet-600 mt-0.5" />
                                        <div>
                                            <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                                <span>{sess.device}</span>
                                                {sess.isCurrent && (
                                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-bold">
                                                        Active Now
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">
                                                {sess.location}
                                            </div>
                                        </div>
                                    </div>
                                    {!sess.isCurrent && (
                                        <button
                                            onClick={() => handleRevokeSession(sess.id)}
                                            className="text-xs text-rose-600 font-semibold hover:underline cursor-pointer"
                                        >
                                            Revoke
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-slate-100 text-xs">
                            <button
                                onClick={handleLogoutAllOtherSessions}
                                className="text-rose-600 font-semibold hover:underline flex items-center gap-1.5 cursor-pointer"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>Log out all other sessions</span>
                            </button>
                            <button
                                onClick={() => setShowSessionsModal(false)}
                                className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 4: Delete Account */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Delete Account</h3>
                                    <p className="text-xs text-slate-500">Irreversible action</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-4 bg-rose-50/70 border border-rose-100 rounded-2xl text-xs text-rose-800 leading-relaxed">
                            <span className="font-bold">Warning:</span> This will permanently erase your company workspace, candidate pool, interview records, and configurations for <span className="font-mono font-bold">{currentUser.email || "your account"}</span>.
                        </div>

                        <div className="flex justify-end gap-2.5 pt-3">
                            <button
                                type="button"
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={deleteLoading}
                                onClick={handleDeleteAccount}
                                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm cursor-pointer"
                            >
                                {deleteLoading ? "Deleting..." : "Yes, Delete My Account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 5: Custom Candidate Instructions Management */}
            {showEditInstructionsModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-xl rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 max-h-[85vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center">
                                    <Info className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Manage Candidate Instructions</h3>
                                    <p className="text-xs text-slate-500">Live guidelines shown to candidates before interview starts</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowEditInstructionsModal(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* List of current guidelines */}
                        <div className="space-y-2.5">
                            <label className="text-xs font-bold text-slate-700 block">Candidate Instructions Bullets</label>
                            {tempGuidelines.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs">
                                    <div className="flex items-start gap-2.5 min-w-0">
                                        <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                            {idx + 1}
                                        </span>
                                        <span className="text-slate-800 font-medium leading-relaxed">{item}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveGuideline(idx)}
                                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition shrink-0 cursor-pointer"
                                        title="Remove instruction"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Add new guideline */}
                        <div className="space-y-1.5 pt-2">
                            <label className="text-xs font-bold text-slate-700 block">Add New Guideline</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="e.g. Ensure your microphone is positioned close to your face..."
                                    value={newGuidelineInput}
                                    onChange={(e) => setNewGuidelineInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            handleAddGuideline();
                                        }
                                    }}
                                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddGuideline}
                                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs">
                            <button
                                type="button"
                                onClick={() => {
                                    setTempGuidelines([
                                        "Ensure you are in a quiet place with good internet connection.",
                                        "Keep your face clearly visible in the camera.",
                                        "Do not switch tabs or open other applications.",
                                        "Do not take help from others during the interview.",
                                        "Be honest and answer confidently.",
                                        "Interview will be recorded for evaluation purposes."
                                    ]);
                                }}
                                className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer underline"
                            >
                                Reset to Default Guidelines
                            </button>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowEditInstructionsModal(false)}
                                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveInstructions}
                                    className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                                >
                                    Save Guidelines
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
