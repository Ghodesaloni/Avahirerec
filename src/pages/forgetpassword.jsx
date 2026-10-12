import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AvaHireLogo from "@/components/AvaHireLogo";
import { toast } from "sonner";
import { authApi } from "@/services/api";
import {
  Lock,
  Mail,
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Send,
  Eye,
  EyeOff,
  RefreshCw,
  MailCheck,
} from "lucide-react";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get("token") || "";
  const urlEmail = searchParams.get("email") || "";

  // Step state:
  // "request" -> enter email to receive unique recovery token
  // "sent" -> email sent confirmation card directing user to their inbox
  // "reset" -> enter token & new password
  // "success" -> success confirmation card
  const [step, setStep] = useState(urlToken ? "reset" : "request");
  const [email, setEmail] = useState(urlEmail);
  const [token, setToken] = useState(urlToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");

  // If token is provided in URL, automatically verify its validity
  useEffect(() => {
    if (urlToken) {
      setToken(urlToken);
      setStep("reset");
      checkTokenValidity(urlToken);
    }
  }, [urlToken]);

  const checkTokenValidity = async (tok) => {
    if (!tok || !tok.trim()) return;
    setVerifyingToken(true);
    setTokenError("");
    try {
      const res = await authApi.verifyResetToken(tok.trim());
      if (res.valid) {
        setTokenError("");
        if (res.email) {
          setVerifiedEmail(res.email);
          if (!email) setEmail(res.email);
        }
      }
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        "The recovery token is invalid, expired, or has already been used.";
      setTokenError(msg);
    } finally {
      setVerifyingToken(false);
    }
  };

  // Step 1: Request unique recovery token
  const handleRequestToken = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return toast.error("Please enter your registered work email.");
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return toast.error("Please enter a valid email address.");
    }

    setLoading(true);
    setTokenError("");
    try {
      await authApi.forgotPassword(cleanEmail);
      toast.success(`Password reset email sent directly to ${cleanEmail}!`);
      setStep("sent");
    } catch (err) {
      console.error("Forgot password request error:", err);
      toast.error(
        err.response?.data?.error ||
          "Could not send recovery token. Please verify your email and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Reset password using unique recovery token
  const handleResetPassword = async (e) => {
    e.preventDefault();
    const cleanToken = token.trim();
    if (!cleanToken) {
      return toast.error("Please enter the unique recovery token.");
    }
    if (!newPassword) {
      return toast.error("Please enter a new password.");
    }
    if (newPassword.length < 4) {
      return toast.error("Password must be at least 4 characters.");
    }
    if (newPassword !== confirmPassword) {
      return toast.error("Passwords do not match. Please re-enter.");
    }

    setLoading(true);
    try {
      const res = await authApi.resetPassword({
        email: (verifiedEmail || email || "").trim().toLowerCase(),
        password: newPassword,
        token: cleanToken,
      });

      toast.success(res?.message || "Password reset successfully!");
      setStep("success");
    } catch (err) {
      console.error("Reset password execution error:", err);
      const errorMsg =
        err.response?.data?.error ||
        "Failed to reset credentials with the given token. Please try again.";
      setTokenError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-50 flex items-center justify-center p-6"
      data-testid="forgot-password-page"
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-violet-500/5 border border-slate-100 p-8 sm:p-10 transition-all">
        <div className="flex justify-center mb-6">
          <AvaHireLogo />
        </div>

        {/* STEP 1: Request Recovery Token */}
        {step === "request" && (
          <div>
            <div className="text-center mb-8">
              <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
                <KeyRound size={24} />
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Forgot Password?
              </h2>
              <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
                Enter your registered work email and we will send you a unique recovery token to securely reset your credentials.
              </p>
            </div>

            <form onSubmit={handleRequestToken} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    data-testid="forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. ABC@example.com"
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 text-sm font-medium transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                data-testid="send-token-submit"
                className="btn-primary w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-violet-500/20 disabled:opacity-60 transition-all mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Dispatching Token...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>Send Recovery Token</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setStep("reset")}
                className="text-violet-600 hover:text-violet-700 font-semibold cursor-pointer"
              >
                Already have a token?
              </button>
              <Link
                to="/login"
                className="text-slate-600 hover:text-slate-900 font-medium"
              >
                ← Back to login
              </Link>
            </div>
          </div>
        )}

        {/* STEP 2: Sent Confirmation Notice & Action */}
        {step === "sent" && (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <MailCheck size={32} />
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Check Your Inbox
              </h2>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                A secure password recovery email has been sent directly to:
              </p>
              <div className="mt-2 font-mono font-bold text-violet-700 bg-violet-50 py-2 px-3 rounded-xl inline-block text-xs border border-violet-100 break-all">
                {email}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <span>Next steps from your email:</span>
              </div>
              <ul className="text-xs text-slate-600 space-y-1.5 pl-5 list-disc leading-relaxed">
                <li>Open the email sent from <strong>AvaHire Security</strong>.</li>
                <li>Click the <strong>Reset Password Securely</strong> button in the email to open the reset form automatically.</li>
                <li>Or copy the <strong>Unique Recovery Token</strong> from your email and enter it below.</li>
              </ul>
              <p className="text-[11px] text-slate-400 pt-1">
                Note: If you do not see it within a minute, please check your spam or junk folder.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setToken("");
                  setStep("reset");
                }}
                className="btn-primary w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-violet-500/20"
              >
                <span>Enter Token from Email &amp; Reset Password</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={() => setStep("request")}
                className="w-full py-2.5 rounded-xl text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Didn't receive email? Re-enter email address
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100 text-center">
              <Link
                to="/login"
                className="text-xs text-slate-500 hover:text-slate-800 font-medium"
              >
                ← Return to login
              </Link>
            </div>
          </div>
        )}

        {/* STEP 3: Enter Token & Set New Password */}
        {step === "reset" && (
          <div>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <ShieldCheck size={24} />
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Reset Credentials
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                Provide your unique recovery token and select a new secure password.
              </p>
            </div>

            {tokenError && (
              <div className="mb-5 bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-xl text-xs flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
                <div className="leading-relaxed">{tokenError}</div>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              {/* Token Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Recovery Token
                  </label>
                  {verifyingToken && (
                    <span className="text-[11px] text-violet-600 flex items-center gap-1 font-medium">
                      <Loader2 size={12} className="animate-spin" /> Verifying...
                    </span>
                  )}
                  {verifiedEmail && !verifyingToken && (
                    <span className="text-[11px] text-emerald-600 font-semibold">
                      ✓ Valid for {verifiedEmail}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <KeyRound
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={17}
                  />
                  <input
                    data-testid="recovery-token-input"
                    type="text"
                    required
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      if (e.target.value.length >= 32) {
                        checkTokenValidity(e.target.value);
                      }
                    }}
                    onBlur={() => {
                      if (token) checkTokenValidity(token);
                    }}
                    placeholder="Paste 64-char token from email"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 text-xs font-mono transition-all"
                  />
                </div>
              </div>

              {/* Work Email (Optional helper or confirmation) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Account Email
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={17}
                  />
                  <input
                    type="email"
                    value={verifiedEmail || email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your work email"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 text-xs font-medium"
                  />
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={17}
                  />
                  <input
                    data-testid="new-password-input"
                    type={showPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 4 chars)"
                    className="w-full pl-11 pr-11 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 text-xs font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={17}
                  />
                  <input
                    data-testid="confirm-password-input"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full pl-11 pr-11 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 text-xs font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                data-testid="reset-password-submit"
                className="btn-primary w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-violet-500/20 disabled:opacity-60 transition-all mt-4"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Updating Credentials...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>Save New Password &amp; Finish</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setStep("request")}
                className="text-violet-600 hover:text-violet-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={12} />
                <span>Request a new token</span>
              </button>
              <Link to="/login" className="text-slate-600 hover:text-slate-900 font-medium">
                Back to login
              </Link>
            </div>
          </div>
        )}

        {/* STEP 4: Success Card */}
        {step === "success" && (
          <div className="text-center space-y-5">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 size={34} />
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Credentials Updated!
              </h2>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                Your password has been securely reset and updated.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Your recovery token has been consumed and deactivated.
              </p>
            </div>

            <button
              type="button"
              data-testid="success-go-to-login"
              onClick={() => navigate("/login")}
              className="btn-primary w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-violet-500/20 mt-4"
            >
              <span>Proceed to Login</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
