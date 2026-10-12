import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AvaHireLogo from "@/components/AvaHireLogo";
import {
    Bell,
    Check,
    CheckCheck,
    Clock,
    FileText,
    Video,
    Calendar,
    Briefcase,
    AlertTriangle,
    Sparkles,
    Trash2,
    X,
    ExternalLink,
    Settings as SettingsIcon,
    SlidersHorizontal,
    Search
} from "lucide-react";

const menu = [
    { to: "/app/dashboard", label: "Dashboard", icon: "fa-house" },
    { to: "/app/jobs", label: "Jobs", icon: "fa-briefcase" },
    { to: "/app/resumes", label: "Resumes", icon: "fa-file-lines" },
    { to: "/app/interviews", label: "Interviews", icon: "fa-video" },
    { to: "/app/email", label: "Email Center", icon: "fa-envelope" },
    { to: "/app/calendar", label: "Calendar", icon: "fa-calendar" },
    { to: "/app/candidates", label: "Candidates", icon: "fa-users" },
    { to: "/app/reports", label: "Reports", icon: "fa-file-excel" },
    { to: "/app/settings", label: "Settings", icon: "fa-gear" },
];

const initialNotifications = [];

const DashboardLayout = () => {
    const navigate = useNavigate();
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [notifications, setNotifications] = useState(initialNotifications);
    const [notificationFilter, setNotificationFilter] = useState("all");

    const [globalSearch, setGlobalSearch] = useState("");
    const [user, setUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("avahire_user") || "{}");
        } catch {
            return {};
        }
    });

    // Theme & Profile sync
    useEffect(() => {
        // Initialize Theme
        const storedTheme = localStorage.getItem("avahire_theme");
        const prefs = JSON.parse(localStorage.getItem("avahire_settings_preferences") || "{}");
        if (storedTheme === "dark" || prefs.darkMode) {
            document.documentElement.classList.add("dark");
        } else if (storedTheme === "light") {
            document.documentElement.classList.remove("dark");
        }

        const handleThemeChanged = (e) => {
            if (e.detail === "dark") {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        };

        const handleProfileUpdated = (e) => {
            if (e.detail) {
                setUser(e.detail);
            } else {
                try {
                    setUser(JSON.parse(localStorage.getItem("avahire_user") || "{}"));
                } catch { }
            }
        };

        window.addEventListener("avahire_theme_changed", handleThemeChanged);
        window.addEventListener("avahire_user_updated", handleProfileUpdated);

        return () => {
            window.removeEventListener("avahire_theme_changed", handleThemeChanged);
            window.removeEventListener("avahire_user_updated", handleProfileUpdated);
        };
    }, []);

    const handleGlobalSearch = (e) => {
        if (e.key === "Enter" && globalSearch.trim()) {
            navigate(`/app/candidates?search=${encodeURIComponent(globalSearch.trim())}`);
        }
    };

    const logout = () => {
        localStorage.removeItem("avahire_user");
        localStorage.removeItem("avahire_token");
        toast.success("Logged out successfully");
        navigate("/login");
    };

    const initials = (user.name || "HR User")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    const unreadCount = notifications.filter((n) => n.unread).length;

    const filteredNotifications = notifications.filter((n) => {
        if (notificationFilter === "unread") return n.unread;
        if (notificationFilter === "interviews") return n.type === "interviews";
        if (notificationFilter === "resumes") return n.type === "resumes";
        if (notificationFilter === "jobs") return n.type === "jobs";
        return true;
    });

    const markAllAsRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
        toast.success("All notifications marked as read");
    };

    const markAsRead = (id) => {
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, unread: false } : n))
        );
    };

    const deleteNotification = (id, e) => {
        e.stopPropagation();
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        toast.info("Notification removed");
    };

    const clearAll = () => {
        setNotifications([]);
        toast.info("Notification history cleared");
    };

    const handleNotificationClick = (item) => {
        markAsRead(item.id);
        if (item.link) {
            setIsNotificationOpen(false);
            navigate(item.link);
        }
    };

    return (
        <div className="min-h-screen flex bg-slate-50" data-testid="dashboard-layout">
            {/* Sidebar */}
            <aside className="w-64 shrink-0 bg-slate-900 text-slate-300 flex flex-col fixed inset-y-0 left-0 z-30">
                <div className="p-5">
                    <AvaHireLogo size="md" variant="darkBg" />
                </div>

                <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
                    {menu.map((m) => (
                        <NavLink
                            key={m.to}
                            to={m.to}
                            data-testid={`sidebar-${m.label.toLowerCase().replace(/\s+/g, "-")}`}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive
                                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30"
                                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                                }`
                            }
                        >
                            <i className={`fa-solid ${m.icon} w-5`}></i>
                            {m.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <div
                        onClick={() => navigate("/app/profile")}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800/90 transition cursor-pointer group"
                        title="View HR Profile"
                        data-testid="sidebar-profile-box"
                    >
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-pink-500 flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                            {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white truncate group-hover:text-violet-300 transition-colors">
                                {user.company || user.name || "My Account"}
                            </div>
                            <div className="text-xs text-slate-400 truncate">{user.designation || user.email || ""}</div>
                        </div>
                        <button
                            data-testid="logout-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                logout();
                            }}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/50 transition"
                            title="Logout"
                        >
                            <i className="fa-solid fa-arrow-right-from-bracket"></i>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Content */}
            <main className="flex-1 ml-64 min-h-screen">
                {/* Top bar */}
                <div className="sticky top-0 z-20 bg-slate-50/80 backdrop-blur-md px-8 py-5 flex items-center justify-between border-b border-slate-200/60">
                    <div>
                        <h1 className="text-2xl font-extrabold text-slate-900">Welcome back, {user.name?.split(" ")[0] || "HR Admin"}! <span className="inline-block animate-wave">👋</span></h1>
                        <p className="text-sm text-slate-500 mt-0.5">Here's what's happening with your recruitment today.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                            <input
                                data-testid="global-search"
                                placeholder="Search candidates, jobs..."
                                value={globalSearch}
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                onKeyDown={handleGlobalSearch}
                                className="w-72 pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-full focus:outline-none focus:border-violet-500 text-sm shadow-2xs"
                            />
                        </div>

                        {/* Notification Bell Button */}
                        <button
                            onClick={() => setIsNotificationOpen(true)}
                            className="relative w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-violet-600 hover:border-violet-300 transition shadow-2xs"
                            data-testid="notifications-btn"
                            title="Notifications"
                        >
                            <Bell className="w-4 h-4" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                                    {unreadCount}
                                </span>
                            )}
                        </button>

                        {/* User Profile Pill in Top Bar */}
                        <div
                            onClick={() => navigate("/app/profile")}
                            data-testid="topbar-profile-box"
                            className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-white border border-slate-200 hover:border-violet-300 hover:shadow-xs transition cursor-pointer group"
                            title="View HR Profile"
                        >
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-pink-500 flex items-center justify-center text-white font-bold text-sm shadow-2xs group-hover:scale-105 transition-transform">
                                {initials}
                            </div>
                            <div className="pr-1">
                                <div className="text-sm font-semibold text-slate-900 group-hover:text-violet-600 transition-colors leading-tight">
                                    {user.name || user.email?.split("@")[0] || "My Account"}
                                </div>
                                <div className="text-[11px] text-slate-500">{user.designation || user.company || user.email || ""}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    <Outlet />
                </div>
            </main>

            {/* NOTIFICATION DRAWER / SLIDE-OVER PANEL */}
            {isNotificationOpen && (
                <div className="fixed inset-0 z-50 overflow-hidden">
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in"
                        onClick={() => setIsNotificationOpen(false)}
                    />

                    {/* Drawer Content */}
                    <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
                        <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-100 flex flex-col animate-in slide-in-from-right duration-300">
                            {/* Drawer Header */}
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                                        <Bell className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
                                            {unreadCount > 0 && (
                                                <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold">
                                                    {unreadCount} New
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-400">Stay updated with recruitment events</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={markAllAsRead}
                                            className="text-xs font-semibold text-violet-600 hover:text-violet-700 p-1.5 rounded-lg hover:bg-violet-50 transition"
                                            title="Mark all as read"
                                        >
                                            <CheckCheck className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsNotificationOpen(false)}
                                        className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
                                        title="Close"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Filter Tabs */}
                            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-1.5 overflow-x-auto text-xs">
                                {[
                                    { id: "all", label: "All" },
                                    { id: "unread", label: `Unread (${unreadCount})` },
                                    { id: "interviews", label: "Interviews" },
                                    { id: "resumes", label: "Resumes" },
                                    { id: "jobs", label: "Jobs" }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setNotificationFilter(tab.id)}
                                        className={`px-3 py-1.5 rounded-full font-semibold transition whitespace-nowrap ${
                                            notificationFilter === tab.id
                                                ? "bg-violet-600 text-white shadow-2xs"
                                                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Notification List */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-3 divide-y divide-slate-50">
                                {filteredNotifications.length === 0 ? (
                                    <div className="py-16 text-center text-slate-400 space-y-2">
                                        <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center mx-auto">
                                            <Bell className="w-6 h-6" />
                                        </div>
                                        <div className="text-sm font-semibold text-slate-700">No notifications</div>
                                        <p className="text-xs text-slate-400 max-w-xs mx-auto">
                                            You're all caught up! New alerts and interview events will appear here.
                                        </p>
                                    </div>
                                ) : (
                                    filteredNotifications.map((item) => {
                                        const IconComponent = item.icon || Bell;
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => handleNotificationClick(item)}
                                                className={`p-4 rounded-2xl border transition cursor-pointer relative group flex gap-3.5 items-start ${
                                                    item.unread
                                                        ? "bg-violet-50/40 border-violet-100/90 hover:bg-violet-50/70"
                                                        : "bg-white border-slate-100 hover:bg-slate-50/80"
                                                }`}
                                            >
                                                {/* Category Icon */}
                                                <div
                                                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                        item.iconBg || "bg-violet-50 text-violet-600"
                                                    }`}
                                                >
                                                    <IconComponent className="w-4 h-4" />
                                                </div>

                                                {/* Text Content */}
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                                            {item.title}
                                                        </h4>
                                                        {item.unread && (
                                                            <span className="w-2 h-2 rounded-full bg-violet-600 shrink-0" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                                                        {item.desc}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400 font-medium">
                                                        <Clock className="w-3 h-3 text-slate-400" />
                                                        <span>{item.time}</span>
                                                    </div>
                                                </div>

                                                {/* Delete Action Button */}
                                                <button
                                                    onClick={(e) => deleteNotification(item.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 rounded-md hover:bg-slate-100 transition absolute top-3 right-3"
                                                    title="Dismiss"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Drawer Footer */}
                            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
                                <button
                                    onClick={clearAll}
                                    className="text-slate-500 hover:text-rose-600 font-semibold transition"
                                >
                                    Clear all notifications
                                </button>
                                <button
                                    onClick={() => {
                                        setIsNotificationOpen(false);
                                        navigate("/app/settings");
                                    }}
                                    className="flex items-center gap-1.5 text-violet-600 hover:text-violet-700 font-semibold"
                                >
                                    <SettingsIcon className="w-3.5 h-3.5" />
                                    <span>Settings</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardLayout;
