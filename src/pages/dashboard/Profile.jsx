import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
    Mail,
    Phone,
    MapPin,
    Calendar,
    Clock,
    Camera,
    Linkedin,
    CheckCircle2,
    Circle,
    Briefcase,
    Users,
    Video,
    Award,
    Building2,
    Globe,
    Bell,
    ChevronDown,
    Save,
    Sparkles,
    ArrowRight,
    Settings as SettingsIcon,
    LayoutDashboard
} from "lucide-react";
import { jobsApi, candidatesApi, interviewsApi, profileApi } from "@/services/api";

const Profile = () => {
    const [activeTab, setActiveTab] = useState("personal");
    const [saving, setSaving] = useState(false);

    // Profile Data State
    const [profile, setProfile] = useState(() => {
        const savedUser = localStorage.getItem("avahire_user");
        let parsedUser = null;
        if (savedUser) {
            try { parsedUser = JSON.parse(savedUser); } catch (e) {}
        }

        const saved = localStorage.getItem("avahire_hr_profile");
        if (saved && parsedUser && parsedUser.email) {
            try {
                const parsedProfile = JSON.parse(saved);
                if (parsedProfile && parsedProfile.email && parsedProfile.email.toLowerCase() === parsedUser.email.toLowerCase()) {
                    return parsedProfile;
                }
            } catch (e) {}
        }

        return {
            fullName: parsedUser?.fullName || parsedUser?.name || "",
            dob: "",
            displayDob: "",
            email: parsedUser?.email || "",
            gender: "Female",
            phone: parsedUser?.phone || "",
            location: "Bengaluru, India",
            jobTitle: parsedUser?.designation || "HR Administrator",
            linkedin: "",
            department: "Human Resources",
            bio: "",
            avatar: parsedUser?.avatar || "",
            companyName: parsedUser?.company || "AvaHire Tech Solutions",
            companyWebsite: parsedUser?.website || "https://avahire.ai",
            companySize: "50-250 employees",
            industry: "Technology & Software"
        };
    });

    const [stats, setStats] = useState({
        jobsPosted: 0,
        totalCandidates: 0,
        interviewsConducted: 0,
        selectedCandidates: 0
    });

    // Fetch live profile from backend on mount
    useEffect(() => {
        const fetchRemoteProfile = async () => {
            try {
                const remote = await profileApi.getProfile();
                if (remote) {
                    setProfile(prev => ({
                        ...prev,
                        ...remote,
                        fullName: remote.fullName || remote.name || prev.fullName,
                        companyName: remote.companyName || remote.company || prev.companyName,
                        companyWebsite: remote.companyWebsite || remote.website || prev.companyWebsite,
                        jobTitle: remote.jobTitle || remote.designation || prev.jobTitle,
                        displayDob: remote.displayDob || remote.dob || prev.displayDob,
                        avatar: remote.avatar || prev.avatar
                    }));
                    if (remote.avatar) {
                        setAvatarPhoto(remote.avatar);
                    }
                }
            } catch (e) {
                console.warn("Notice: Loading profile from local state:", e.message);
            }
        };
        fetchRemoteProfile();
    }, []);

    useEffect(() => {
        const loadOverview = async () => {
            try {
                const [jobsRes, candRes, intRes] = await Promise.allSettled([
                    jobsApi.getAll(),
                    candidatesApi.getAll(),
                    interviewsApi.getAll()
                ]);
                const jobsCount = jobsRes.status === "fulfilled" && Array.isArray(jobsRes.value) ? jobsRes.value.length : 0;
                const candCount = candRes.status === "fulfilled" && Array.isArray(candRes.value) ? candRes.value.length : 0;
                const intList = intRes.status === "fulfilled" && Array.isArray(intRes.value) ? intRes.value : [];
                const intCount = intList.filter(i => i.status === "Completed" || i.status === "Under Review" || i.status === "Shortlisted").length;
                const selCount = candRes.status === "fulfilled" && Array.isArray(candRes.value) ? candRes.value.filter(c => c.status === "Shortlisted" || c.status === "Selected").length : 0;
                setStats({
                    jobsPosted: jobsCount,
                    totalCandidates: candCount,
                    interviewsConducted: intCount,
                    selectedCandidates: selCount
                });
            } catch (e) {
                console.error("Failed to load profile metrics:", e);
            }
        };
        loadOverview();
    }, []);

    const [avatarPhoto, setAvatarPhoto] = useState(profile.avatar);

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (file) {
            // Instant preview
            const reader = new FileReader();
            reader.onload = (uploadEvent) => {
                const newUrl = uploadEvent.target?.result;
                setAvatarPhoto(newUrl);
            };
            reader.readAsDataURL(file);

            // Upload directly to backend
            try {
                const formData = new FormData();
                formData.append("avatar", file);
                const res = await profileApi.uploadAvatar(formData);
                if (res && res.avatar) {
                    setAvatarPhoto(res.avatar);
                    setProfile((prev) => ({ ...prev, avatar: res.avatar }));

                    const existingUser = JSON.parse(localStorage.getItem("avahire_user") || "{}");
                    const updatedUser = { ...existingUser, avatar: res.avatar };
                    localStorage.setItem("avahire_user", JSON.stringify(updatedUser));
                    window.dispatchEvent(new CustomEvent("avahire_user_updated", { detail: updatedUser }));

                    toast.success("Profile photo uploaded and saved successfully!");
                }
            } catch (uploadErr) {
                console.error("Failed to upload avatar to server:", uploadErr);
                toast.error("Failed to upload avatar to server: " + (uploadErr.response?.data?.error || uploadErr.message));
            }
        }
    };

    const handleRemoveAvatar = async () => {
        try {
            await profileApi.removeAvatar();
            setAvatarPhoto("");
            setProfile((prev) => ({ ...prev, avatar: "" }));

            const existingUser = JSON.parse(localStorage.getItem("avahire_user") || "{}");
            const updatedUser = { ...existingUser, avatar: "" };
            localStorage.setItem("avahire_user", JSON.stringify(updatedUser));
            window.dispatchEvent(new CustomEvent("avahire_user_updated", { detail: updatedUser }));

            toast.info("Profile photo removed");
        } catch (err) {
            toast.error("Failed to remove profile photo");
        }
    };

    const handleSave = async (e) => {
        e?.preventDefault();
        if (!profile.fullName?.trim()) {
            toast.error("Full Name is required");
            return;
        }

        setSaving(true);
        try {
            const updated = await profileApi.updateProfile({
                ...profile,
                avatar: avatarPhoto || profile.avatar
            });

            const refreshedData = updated?.data ? {
                ...profile,
                ...updated.data,
                fullName: updated.data.fullName || updated.data.name || profile.fullName,
                companyName: updated.data.companyName || updated.data.company || profile.companyName,
                companyWebsite: updated.data.companyWebsite || updated.data.website || profile.companyWebsite,
                jobTitle: updated.data.jobTitle || updated.data.designation || profile.jobTitle
            } : profile;

            setProfile(refreshedData);
            localStorage.setItem("avahire_hr_profile", JSON.stringify(refreshedData));

            // Also update avahire_user in localStorage so the header initials and name reflect
            const existingUser = JSON.parse(localStorage.getItem("avahire_user") || "{}");
            const updatedUser = {
                ...existingUser,
                name: refreshedData.fullName,
                email: refreshedData.email,
                designation: refreshedData.jobTitle,
                company: refreshedData.companyName,
                phone: refreshedData.phone,
                avatar: avatarPhoto || refreshedData.avatar
            };
            localStorage.setItem("avahire_user", JSON.stringify(updatedUser));

            // Broadcast to other components
            window.dispatchEvent(new CustomEvent("avahire_user_updated", { detail: updatedUser }));

            toast.success("HR Profile updated and saved to PostgreSQL successfully!");
        } catch (err) {
            console.error("Failed to save profile:", err);
            toast.error("Failed to save profile: " + (err.response?.data?.error || err.message));
        } finally {
            setSaving(false);
        }
    };

    const hasPersonal = Boolean(profile.fullName?.trim() && profile.email?.trim());
    const hasCompany = Boolean(profile.companyName?.trim());
    const hasEmailVerified = Boolean(profile.email?.trim());
    const hasPhone = Boolean(profile.phone?.trim());
    const hasAvatar = Boolean(avatarPhoto || profile.avatar);

    let completionScore = 0;
    if (hasPersonal) completionScore += 20;
    if (hasCompany) completionScore += 20;
    if (hasEmailVerified) completionScore += 20;
    if (hasPhone) completionScore += 20;
    if (hasAvatar) completionScore += 20;

    const circumference = 251.2;
    const strokeOffset = circumference - (circumference * completionScore) / 100;

    return (
        <div className="space-y-6 max-w-7xl mx-auto -mt-2" data-testid="hr-profile-page">
            {/* Header */}
            <div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
                    HR Profile
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    Manage your personal information and view your HR account overview.
                </p>
            </div>

            {/* 3-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT COLUMN: Summary Card (3 cols) */}
                <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    {/* Top banner */}
                    <div className="h-24 bg-gradient-to-r from-violet-100/70 to-indigo-100/70 relative" />

                    {/* Avatar with Camera badge */}
                    <div className="px-6 pb-6 text-center -mt-14 space-y-4">
                        <div className="relative inline-block mx-auto">
                            {avatarPhoto ? (
                                <img
                                    src={avatarPhoto}
                                    alt={profile.fullName || "User Avatar"}
                                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md mx-auto"
                                />
                            ) : (
                                <div className="w-24 h-24 rounded-full bg-violet-100 text-violet-700 font-bold text-2xl flex items-center justify-center border-4 border-white shadow-md mx-auto">
                                    {profile.fullName ? profile.fullName.charAt(0).toUpperCase() : <Users className="w-8 h-8" />}
                                </div>
                            )}
                            <label
                                htmlFor="avatar-upload"
                                className="absolute bottom-0 right-0 w-8 h-8 bg-violet-600 hover:bg-violet-700 text-white rounded-full flex items-center justify-center cursor-pointer shadow-sm transition border-2 border-white"
                                title="Change Profile Photo"
                            >
                                <Camera className="w-4 h-4" />
                                <input
                                    id="avatar-upload"
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />
                            </label>
                        </div>

                        {avatarPhoto && (
                            <div>
                                <button
                                    type="button"
                                    onClick={handleRemoveAvatar}
                                    className="text-[11px] text-rose-500 hover:text-rose-600 font-semibold transition hover:underline"
                                >
                                    Remove photo
                                </button>
                            </div>
                        )}

                        {/* Name & Badge */}
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <h2 className="text-lg font-bold text-slate-900">{profile.fullName || "HR User"}</h2>
                                <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold text-[11px]">
                                    HR Admin
                                </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 font-medium">
                                Human Resources Administrator
                            </div>
                        </div>

                        {/* Details List */}
                        <div className="space-y-3 pt-3 border-t border-slate-100 text-left text-xs text-slate-600">
                            {/* Email */}
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                    <Mail className="w-4 h-4" />
                                </div>
                                <span className="truncate font-medium">{profile.email || "Not specified"}</span>
                            </div>

                            {/* Phone */}
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                    <Phone className="w-4 h-4" />
                                </div>
                                <span className="font-medium">{profile.phone || "Not specified"}</span>
                            </div>

                            {/* Location */}
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                    <MapPin className="w-4 h-4" />
                                </div>
                                <span className="font-medium">{profile.location || "Not specified"}</span>
                            </div>

                            {/* Account Status */}
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                    <CheckCircle2 className="w-4 h-4" />
                                </div>
                                <span className="font-medium">Active HR Account</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* MIDDLE COLUMN: Tabs & Form Card (6 cols) */}
                <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-7 space-y-6">
                    {/* Navigation Tabs */}
                    <div className="flex items-center gap-4 sm:gap-6 border-b border-slate-100 overflow-x-auto text-xs sm:text-sm font-semibold pb-1">
                        {[
                            { id: "personal", label: "Personal Information" },
                            { id: "company", label: "Company Information" },
                            { id: "preferences", label: "Preferences" },
                            { id: "notifications", label: "Notification Settings" }
                        ].map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`pb-2.5 whitespace-nowrap transition relative ${
                                        isActive
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

                    {/* Form: Personal Information */}
                    {activeTab === "personal" && (
                        <form onSubmit={handleSave} className="space-y-5 animate-in fade-in">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Personal Information</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Update your personal details.</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Full Name */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        Full Name
                                    </label>
                                    <input
                                        type="text"
                                        value={profile.fullName}
                                        onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 transition"
                                    />
                                </div>

                                {/* Date of Birth */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        Date of Birth
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={profile.displayDob}
                                            onChange={(e) => setProfile({ ...profile, displayDob: e.target.value })}
                                            className="w-full px-3.5 py-2.5 pr-9 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 transition"
                                        />
                                        <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Email Address */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={profile.email}
                                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 transition"
                                    />
                                </div>

                                {/* Gender */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        Gender
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={profile.gender}
                                            onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                                            className="w-full appearance-none px-3.5 py-2.5 pr-9 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 transition cursor-pointer"
                                        >
                                            <option>Female</option>
                                            <option>Male</option>
                                            <option>Non-binary</option>
                                            <option>Prefer not to say</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Phone Number */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        Phone Number
                                    </label>
                                    <input
                                        type="text"
                                        value={profile.phone}
                                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 transition"
                                    />
                                </div>

                                {/* Location */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        Location
                                    </label>
                                    <input
                                        type="text"
                                        value={profile.location}
                                        onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 transition"
                                    />
                                </div>

                                {/* Job Title */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        Job Title
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={profile.jobTitle}
                                            onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })}
                                            className="w-full appearance-none px-3.5 py-2.5 pr-9 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 transition cursor-pointer"
                                        >
                                            <option>HR Administrator</option>
                                            <option>HR Manager</option>
                                            <option>Talent Acquisition Lead</option>
                                            <option>VP of Human Resources</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* LinkedIn Profile */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        LinkedIn Profile (Optional)
                                    </label>
                                    <div className="relative">
                                        <Linkedin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            value={profile.linkedin}
                                            onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })}
                                            className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 transition"
                                        />
                                    </div>
                                </div>

                                {/* Department */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        Department
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={profile.department}
                                            onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                                            className="w-full appearance-none px-3.5 py-2.5 pr-9 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 transition cursor-pointer"
                                        >
                                            <option>Human Resources</option>
                                            <option>Talent Acquisition</option>
                                            <option>People Operations</option>
                                            <option>Executive Management</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Bio (Optional) */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                        Bio (Optional)
                                    </label>
                                    <textarea
                                        rows="3"
                                        value={profile.bio}
                                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-violet-500 transition resize-none leading-relaxed"
                                    />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => toast.info("Changes reverted")}
                                    className="px-5 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md shadow-violet-500/25 transition active:scale-[0.98]"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Company Information Tab */}
                    {activeTab === "company" && (
                        <div className="space-y-4 animate-in fade-in">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Company Information</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Details about your organization.</p>
                            </div>
                            <div className="space-y-3 text-xs sm:text-sm">
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Company Name</label>
                                    <input
                                        type="text"
                                        value={profile.companyName}
                                        onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Company Website</label>
                                    <input
                                        type="text"
                                        value={profile.companyWebsite}
                                        onChange={(e) => setProfile({ ...profile, companyWebsite: e.target.value })}
                                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Company Size</label>
                                    <input
                                        type="text"
                                        value={profile.companySize}
                                        onChange={(e) => setProfile({ ...profile, companySize: e.target.value })}
                                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end pt-3 border-t border-slate-100">
                                <button
                                    onClick={handleSave}
                                    className="px-5 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold"
                                >
                                    Save Company Info
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Preferences Tab */}
                    {activeTab === "preferences" && (
                        <div className="space-y-4 animate-in fade-in text-xs">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Work Preferences</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Customise your HR workspace defaults.</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
                                <div className="font-bold text-slate-800">Timezone &amp; Locale</div>
                                <div className="text-slate-600">(GMT+05:30) Asia/Kolkata (IST)</div>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
                                <div className="font-bold text-slate-800">Default Currency</div>
                                <div className="text-slate-600">INR (₹) - Indian Rupee</div>
                            </div>
                        </div>
                    )}

                    {/* Notifications Tab */}
                    {activeTab === "notifications" && (
                        <div className="space-y-4 animate-in fade-in text-xs">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Notification Settings</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Control communication channels.</p>
                            </div>
                            <div className="space-y-3">
                                {[
                                    { label: "New candidate applications", default: true },
                                    { label: "Interview completion alerts", default: true },
                                    { label: "Daily talent digest", default: false }
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl">
                                        <span className="font-medium text-slate-800">{item.label}</span>
                                        <input type="checkbox" defaultChecked={item.default} className="rounded text-violet-600" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: Profile Completion & Overview (3 cols) */}
                <div className="lg:col-span-3 space-y-5">
                    {/* CARD 1: Profile Completion */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4 text-center">
                        <h4 className="text-sm font-bold text-slate-900 text-left">Profile Completion</h4>

                        {/* Circular Progress Meter */}
                        <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                {/* Background track */}
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    className="stroke-slate-100"
                                    strokeWidth="8"
                                    fill="none"
                                />
                                {/* Progress arc */}
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    className="stroke-violet-600 transition-all duration-700 ease-out"
                                    strokeWidth="8"
                                    strokeDasharray="251.2"
                                    strokeDashoffset={strokeOffset}
                                    strokeLinecap="round"
                                    fill="none"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-extrabold text-slate-900 leading-none">{completionScore}%</span>
                                <span className="text-[10px] text-slate-400 font-semibold mt-1">
                                    Profile<br />Completed
                                </span>
                            </div>
                        </div>

                        <p className="text-xs text-slate-500">
                            Complete your profile to get the best experience.
                        </p>

                        {/* Checklist */}
                        <div className="space-y-2 text-left text-xs pt-2 border-t border-slate-100">
                            <div className={`flex items-center gap-2 font-medium ${hasPersonal ? "text-emerald-600" : "text-slate-400"}`}>
                                {hasPersonal ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4 text-slate-300" />}
                                <span>Personal Information</span>
                            </div>
                            <div className={`flex items-center gap-2 font-medium ${hasCompany ? "text-emerald-600" : "text-slate-400"}`}>
                                {hasCompany ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4 text-slate-300" />}
                                <span>Company Information</span>
                            </div>
                            <div className={`flex items-center gap-2 font-medium ${hasEmailVerified ? "text-emerald-600" : "text-slate-400"}`}>
                                {hasEmailVerified ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4 text-slate-300" />}
                                <span>Email Verified</span>
                            </div>
                            <div className={`flex items-center gap-2 font-medium ${hasPhone ? "text-emerald-600" : "text-slate-400"}`}>
                                {hasPhone ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4 text-slate-300" />}
                                <span>Phone Verified</span>
                            </div>
                            <div className={`flex items-center gap-2 font-medium ${hasAvatar ? "text-emerald-600" : "text-slate-400"}`}>
                                {hasAvatar ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4 text-slate-300" />}
                                <span>Profile Photo</span>
                            </div>
                        </div>
                    </div>

                    {/* CARD 2: HR Overview */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-900">HR Overview</h4>
                            <span className="text-[11px] font-semibold text-violet-600">Click to view</span>
                        </div>

                        <div className="space-y-2.5 text-xs">
                            {/* Jobs Posted */}
                            <Link
                                to="/app/jobs"
                                className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 transition border border-transparent hover:border-slate-100 group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                        <Briefcase className="w-4 h-4" />
                                    </div>
                                    <span className="text-slate-600 font-medium group-hover:text-violet-700 transition">Jobs Posted</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-slate-900 text-sm">{stats.jobsPosted}</span>
                                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
                                </div>
                            </Link>

                            {/* Total Candidates */}
                            <Link
                                to="/app/candidates"
                                className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 transition border border-transparent hover:border-slate-100 group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                        <Users className="w-4 h-4" />
                                    </div>
                                    <span className="text-slate-600 font-medium group-hover:text-violet-700 transition">Total Candidates</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-slate-900 text-sm">{stats.totalCandidates}</span>
                                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
                                </div>
                            </Link>

                            {/* Interviews Conducted */}
                            <Link
                                to="/app/interviews"
                                className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 transition border border-transparent hover:border-slate-100 group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                        <Video className="w-4 h-4" />
                                    </div>
                                    <span className="text-slate-600 font-medium group-hover:text-violet-700 transition">Interviews Conducted</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-slate-900 text-sm">{stats.interviewsConducted}</span>
                                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
                                </div>
                            </Link>

                            {/* Selected Candidates */}
                            <Link
                                to="/app/candidates?status=Selected"
                                className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 transition border border-transparent hover:border-slate-100 group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                        <Award className="w-4 h-4" />
                                    </div>
                                    <span className="text-slate-600 font-medium group-hover:text-violet-700 transition">Selected Candidates</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-slate-900 text-sm">{stats.selectedCandidates}</span>
                                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
