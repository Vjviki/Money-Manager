import { useState } from "react";
import { Eye, EyeOff, LoaderCircle, Mail, ShieldCheck, X } from "lucide-react";
import "./index.css";

const API = "https://money-manager-wmon.onrender.com";

const ForgotPassword = ({ onClose }) => {
  const [stage, setStage] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const readJson = async (response) => {
    try {
      return await response.json();
    } catch {
      return {};
    }
  };

  const requestCode = async (event) => {
    event?.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    setError("");
    setMessage("");

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Enter the email address linked to your account.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API}/forgot-password/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Unable to send the verification code.");
      setEmail(cleanEmail);
      setStage("reset");
      setMessage(data.message || "If the account exists, a verification code has been sent.");
    } catch (err) {
      setError(err instanceof TypeError ? "Unable to connect to the server. Check your internet connection." : err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit verification code from your email.");
    if (nextPassword.length < 8) return setError("New password must be at least 8 characters.");
    if (nextPassword !== confirmPassword) return setError("New passwords do not match.");

    try {
      setLoading(true);
      const response = await fetch(`${API}/forgot-password/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code, newPassword: nextPassword }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Unable to reset your password.");
      setStage("success");
      setMessage(data.message || "Password reset successfully. You can now sign in.");
    } catch (err) {
      setError(err instanceof TypeError ? "Unable to connect to the server. Check your internet connection." : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-overlay" onClick={() => !loading && onClose()}>
      <section className="forgot-modal" onClick={(event) => event.stopPropagation()}>
        <div className="forgot-header">
          <div><span>Account recovery</span><h2>{stage === "success" ? "Password updated" : "Forgot password"}</h2></div>
          <button type="button" onClick={onClose} disabled={loading} aria-label="Close password recovery"><X size={20} /></button>
        </div>

        {stage === "email" && (
          <form className="forgot-form" onSubmit={requestCode}>
            <div className="forgot-info"><Mail size={20} /><p>Enter the email linked to your account. We’ll send a 6-digit verification code.</p></div>
            <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" autoFocus disabled={loading} /></label>
            {error && <div className="forgot-alert forgot-alert-error">{error}</div>}
            <button className="forgot-primary-btn" type="submit" disabled={loading}>{loading ? <><LoaderCircle size={18} className="forgot-spinner" /> Sending...</> : "Send verification code"}</button>
          </form>
        )}

        {stage === "reset" && (
          <form className="forgot-form" onSubmit={resetPassword}>
            <div className="forgot-info"><ShieldCheck size={20} /><p>Enter the code sent to <strong>{email}</strong>. It expires in 10 minutes.</p></div>
            {message && <div className="forgot-alert forgot-alert-success">{message}</div>}
            <label><span>6-digit verification code</span><input className="forgot-code-input" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" autoComplete="one-time-code" autoFocus disabled={loading} /></label>
            <label><span>New password</span><div className="forgot-password-wrap"><input type={showPassword ? "text" : "password"} value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" disabled={loading} /><button type="button" onClick={() => setShowPassword((prev) => !prev)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            <label><span>Confirm new password</span><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat new password" autoComplete="new-password" disabled={loading} /></label>
            {error && <div className="forgot-alert forgot-alert-error">{error}</div>}
            <div className="forgot-actions"><button type="button" className="forgot-secondary-btn" onClick={requestCode} disabled={loading}>Resend code</button><button className="forgot-primary-btn" type="submit" disabled={loading}>{loading ? <><LoaderCircle size={18} className="forgot-spinner" /> Updating...</> : "Reset password"}</button></div>
          </form>
        )}

        {stage === "success" && (
          <div className="forgot-form forgot-success"><div className="forgot-success-icon"><ShieldCheck size={28} /></div><p>{message}</p><button className="forgot-primary-btn" type="button" onClick={onClose}>Back to login</button></div>
        )}
      </section>
    </div>
  );
};

export default ForgotPassword;
