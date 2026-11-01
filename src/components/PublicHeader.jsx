import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import AvaHireLogo from "./AvaHireLogo";
import { Menu, X } from "lucide-react";

const nav = [
    { to: "/", label: "Home" },
    { to: "/features", label: "Features" },
    { to: "/how-it-works", label: "How It Works" },
    { to: "/about", label: "About Us" },
    { to: "/contact", label: "Contact" },
    { to: "/i/akc123", label: "Candidate Portal" },
];

const PublicHeader = () => {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();

    return (
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60" data-testid="public-header">
            <div className="max-w-7xl mx-auto px-6 lg:px-10 h-20 flex items-center justify-between">
                <Link to="/" data-testid="header-logo-link">
                    <AvaHireLogo />
                </Link>

                <nav className="hidden lg:flex items-center gap-7">
                    {nav.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.to === "/"}
                            data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                            className={({ isActive }) =>
                                `text-[15px] font-medium transition-colors relative py-1 ${isActive
                                    ? "text-violet-600 after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-1 after:h-[3px] after:rounded-full after:bg-violet-600"
                                    : "text-slate-700 hover:text-violet-600"
                                }`
                            }
                        >
                            {n.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="hidden lg:flex items-center gap-3">
                    <button
                        data-testid="header-login-btn"
                        onClick={() => navigate("/login")}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-slate-200 text-slate-800 font-semibold text-sm hover:border-violet-400 hover:text-violet-600 transition-all cursor-pointer"
                    >
                        <i className="fa-regular fa-user text-[13px]"></i>
                        Login
                    </button>
                    <button
                        data-testid="header-dashboard-btn"
                        onClick={() => navigate("/app/dashboard")}
                        className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-semibold text-sm cursor-pointer shadow-md shadow-violet-500/25"
                    >
                        <i className="fa-solid fa-gauge text-[13px]"></i>
                        HR Dashboard
                    </button>
                </div>

                <button
                    data-testid="mobile-menu-toggle"
                    onClick={() => setOpen((v) => !v)}
                    className="lg:hidden p-2 text-slate-800"
                >
                    {open ? <X size={22} /> : <Menu size={22} />}
                </button>
            </div>

            {open && (
                <div className="lg:hidden border-t border-slate-200 bg-white px-6 py-4 flex flex-col gap-3">
                    {nav.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.to === "/"}
                            onClick={() => setOpen(false)}
                            className={({ isActive }) =>
                                `py-2 text-[15px] font-medium ${isActive ? "text-violet-600" : "text-slate-800"}`
                            }
                        >
                            {n.label}
                        </NavLink>
                    ))}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={() => navigate("/login")}
                            className="flex-1 py-2.5 rounded-full border border-slate-200 font-semibold text-sm"
                        >
                            Login
                        </button>
                        <button
                            onClick={() => navigate("/register")}
                            className="flex-1 py-2.5 rounded-full bg-violet-600 text-white font-semibold text-sm"
                        >
                            Register
                        </button>
                    </div>
                </div>
            )}
        </header>
    );
};

export default PublicHeader;
