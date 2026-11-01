import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Lock, Loader2, Sparkles } from "lucide-react";
import AvaHireLogo from "@/components/AvaHireLogo";
import GoogleAccountChooserModal from "@/components/GoogleAccountChooserModal";
import { toast } from "sonner";
import { authApi } from "@/services/api";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    remember: true,
  });

  useEffect(() => {
    // 1. Check if user just registered and was passed via route state
    if (location.state?.email) {
      setForm((prev) => ({
        ...prev,
        email: location.state.email,
        password: location.state.password || location.state.initialPassword || prev.password,
      }));
      return;
    }

    // 2. Check if a registered email is stored locally
    const lastRegisteredEmail = localStorage.getItem("avahire_registered_email");
    if (lastRegisteredEmail) {
      setForm((prev) => ({ ...prev, email: lastRegisteredEmail }));
      return;
    }

    // 3. Otherwise check existing stored user session
    try {
      const stored = localStorage.getItem("avahire_user");
      if (stored) {
        const u = JSON.parse(stored);
        if (u && u.email) {
          setForm((prev) => ({ ...prev, email: u.email }));
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [location.state]);

  const handleOpenGoogleLogin = () => {
    setShowGoogleModal(true);
  };

  const handleSelectGoogleAccount = async (account) => {
    setGoogleLoading(true);
    try {
      const activeEmail = account.email.trim();
      const activeName = account.name.trim() || activeEmail.split("@")[0].replace(/[._]/g, " ");

      const response = await authApi.googleAuth({
        email: activeEmail,
        name: activeName,
        avatar: account.avatar || "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200",
      });

      if (response && response.success) {
        const userData = response.data || {
          name: activeName,
          email: activeEmail,
          role: "recruiter",
          company: "AvaHire Partner",
        };

        localStorage.setItem("avahire_user", JSON.stringify(userData));
        localStorage.setItem("avahire_token", response.token || `usr_google_${Date.now()}`);
        localStorage.setItem("avahire_registered_email", activeEmail);

        setShowGoogleModal(false);
        toast.success(response.message || `Signed in with Google as ${userData.name || activeEmail} 👋`);
        setTimeout(() => navigate("/app/dashboard"), 250);
      } else {
        throw new Error(response?.error || "Google authentication failed");
      }
    } catch (err) {
      console.error("Google sign-in error:", err);
      const msg = err.response?.data?.error || err.message || "Google sign-in could not be completed.";
      toast.error(msg);
      throw new Error(msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error("Please enter both email and password");
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.login({
        email: form.email.trim(),
        password: form.password,
      });

      if (response && response.success && response.token) {
        const userData = response.data || {
          name: form.email.split("@")[0],
          email: form.email.trim(),
          designation: "HR Administrator",
        };

        localStorage.setItem("avahire_user", JSON.stringify(userData));
        localStorage.setItem("avahire_token", response.token);
        localStorage.setItem("avahire_registered_email", form.email.trim());

        toast.success(response.message || `Welcome back, ${userData.name || "HR User"} 👋`);
        setTimeout(() => navigate("/app/dashboard"), 300);
      } else {
        toast.error(response?.error || "Incorrect email or password. Please check your credentials.");
      }
    } catch (err) {
      console.warn("Login attempt status:", err?.response?.status);
      const errMsg = err.response?.data?.error || err.message || "Login failed. Please check your credentials.";
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8" data-testid="login-page">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-6 min-h-[calc(100vh-4rem)]">
        {/* Left */}
        <div className="relative flex flex-col justify-between p-10 lg:p-14 bg-gradient-to-br from-violet-50 via-white to-violet-50 rounded-3xl">
          <div>
            <AvaHireLogo />
            <h1 className="mt-10 text-4xl lg:text-5xl font-extrabold text-slate-900 leading-tight">
              Welcome Back!<br />Let's Continue<br />
              <span className="gradient-text">Building Great Teams</span>
            </h1>
            <p className="mt-4 text-slate-600 max-w-md">
              Login to your HR account and manage jobs, candidates, interviews, and more with AI power.
            </p>
            <div className="mt-10 space-y-5">
              {[
                { icon: "fa-users-gear", bg: "bg-violet-100 text-violet-600", t: "AI-Powered Hiring", d: "Smart screening and ranking to find the best talent." },
                { icon: "fa-shield-halved", bg: "bg-emerald-100 text-emerald-600", t: "Secure & Reliable", d: "Enterprise-grade security to protect your data." },
                { icon: "fa-chart-column", bg: "bg-blue-100 text-blue-600", t: "Data-Driven Insights", d: "Real-time reports to make better hiring decisions." },
              ].map((b) => (
                <div key={b.t} className="flex gap-4">
                  <div className={`w-11 h-11 rounded-full ${b.bg} flex items-center justify-center`}>
                    <i className={`fa-solid ${b.icon}`}></i>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{b.t}</div>
                    <div className="text-sm text-slate-500">{b.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right form */}
        <form
          onSubmit={submit}
          data-testid="login-form"
          className="bg-white rounded-3xl shadow-xl shadow-violet-500/5 border border-slate-100 p-8 lg:p-14 flex flex-col justify-center"
        >
          <div className="text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-violet-100 flex items-center justify-center">
              <Lock size={34} className="text-violet-600" />
            </div>
            <h2 className="mt-5 text-3xl font-extrabold text-slate-900">Welcome Back!</h2>
            <p className="text-slate-500 mt-1">Login to your HR account</p>
          </div>

          <div className="mt-8 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Work Email</label>
              <div className="relative">
                <i className="fa-solid fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                <input
                  data-testid="login-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Enter your registered work email"
                  required
                  className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  data-testid="login-password"
                  type={show ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Enter your account password"
                  required
                  className="w-full pl-11 pr-11 py-3.5 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 text-sm"
                />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  data-testid="login-remember"
                  type="checkbox"
                  checked={form.remember}
                  onChange={(e) => setForm({ ...form, remember: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-violet-600" />
                Remember me
              </label>
              <Link to="/forgot-password" className="text-sm font-semibold text-violet-600 hover:underline">Forgot Password?</Link>
            </div>

            <button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Login</span>
              )}
            </button>

            <div className="flex items-center gap-3 text-sm text-slate-400">
              <div className="flex-1 h-px bg-slate-200" />or<div className="flex-1 h-px bg-slate-200" />
            </div>

            <button
              type="button"
              data-testid="google-login-btn"
              onClick={handleOpenGoogleLogin}
              disabled={googleLoading}
              className="w-full py-3.5 rounded-xl border border-slate-200 font-semibold text-slate-800 flex items-center justify-center gap-3 hover:border-violet-400 transition cursor-pointer bg-white"
            >
              {googleLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                </svg>
              )}
              <span>Login with Google</span>
            </button>

            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
                Quick 1-Click Recruiter Demo Access
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="demo-login-saloni"
                  onClick={async () => {
                    setForm({ email: "salonighode@gmail.com", password: "Password123!", remember: true });
                    setLoading(true);
                    try {
                      const res = await authApi.login({ email: "salonighode@gmail.com", password: "Password123!" });
                      if (res && res.success) {
                        const userData = res.data || { name: "Saloni Ghode", email: "salonighode@gmail.com", role: "recruiter" };
                        localStorage.setItem("avahire_user", JSON.stringify(userData));
                        localStorage.setItem("avahire_token", res.token || "token_saloni");
                        localStorage.setItem("avahire_registered_email", "salonighode@gmail.com");
                        toast.success("Logged in as Saloni Ghode (Lead Recruiter) 👋");
                        setTimeout(() => navigate("/app/dashboard"), 200);
                      }
                    } catch (err) {
                      toast.error("Demo login error: " + (err.message || "Failed"));
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="py-2.5 px-3 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                  <span>Saloni Ghode (Lead)</span>
                </button>

                <button
                  type="button"
                  data-testid="demo-login-admin"
                  onClick={async () => {
                    setForm({ email: "admin@avahire.ai", password: "Password123!", remember: true });
                    setLoading(true);
                    try {
                      const res = await authApi.login({ email: "admin@avahire.ai", password: "Password123!" });
                      if (res && res.success) {
                        const userData = res.data || { name: "AvaHire Admin", email: "admin@avahire.ai", role: "recruiter" };
                        localStorage.setItem("avahire_user", JSON.stringify(userData));
                        localStorage.setItem("avahire_token", res.token || "token_admin");
                        localStorage.setItem("avahire_registered_email", "admin@avahire.ai");
                        toast.success("Logged in as AvaHire Admin 👋");
                        setTimeout(() => navigate("/app/dashboard"), 200);
                      }
                    } catch (err) {
                      toast.error("Demo login error: " + (err.message || "Failed"));
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="py-2.5 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Admin Recruiter</span>
                </button>
              </div>
            </div>

            <div className="text-center text-sm text-slate-600">
              Don't have an account? <Link to="/register" className="text-violet-600 font-semibold hover:underline">Register</Link>
            </div>
          </div>
        </form>
      </div>

      {/* Google Account Selector & Add Google Account Modal */}
      <GoogleAccountChooserModal
        isOpen={showGoogleModal}
        onClose={() => setShowGoogleModal(false)}
        onSelectAccount={handleSelectGoogleAccount}
        mode="login"
        initialEmail={form.email}
      />
    </div>
  );
};

export default Login;
